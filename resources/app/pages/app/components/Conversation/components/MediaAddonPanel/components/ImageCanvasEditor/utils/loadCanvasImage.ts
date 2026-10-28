import { displayMediaUrl } from '@/lib/media/displayMediaUrl'
import { toProxiedImageUrl } from './mediaProxyUrl'

/**
 * The one place the canvas turns an artifact URL into an <img>.
 *
 * Preferred path: the same-origin proxy (`/api/artifacts/media/image`) with
 * `crossOrigin = "anonymous"`, which yields a CORS-clean bitmap the canvas can read
 * pixels from (export / OCR / social reframe).
 *
 * Fallback path: the RAW url with no `crossOrigin` — exactly what the chat thumbnails
 * use. When the proxy fails (SSRF-guard deny, upstream 4xx/5xx, no egress from the
 * server container) the raw url still loads in the browser, so an image the user can
 * SEE beats a correct-but-invisible canvas. The trade-off is a tainted bitmap: it can
 * be painted but not read back, so pixel-reading callers pass `requirePixelAccess`
 * and get an `ImagePixelAccessError` instead of an opaque `SecurityError` later.
 */
export type LoadedCanvasImage = {
  image: HTMLImageElement
  /** True when the bitmap came from the raw url: paintable, NOT pixel-readable. */
  isTainted: boolean
}

export type LoadCanvasImageOptions = {
  /** Reject (instead of falling back to a tainted bitmap) when pixels must be readable. */
  requirePixelAccess?: boolean
  signal?: AbortSignal
}

/** Thrown when the image only loads tainted but the caller needs to read its pixels. */
export class ImagePixelAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImagePixelAccessError'
  }
}

type UrlStatus = 'clean' | 'tainted' | 'failed'

// Per-url outcome, so a url already known to fail the proxy skips that doomed
// round-trip on every later mount (a canvas re-mounts its elements a lot).
const urlStatusCache = new Map<string, UrlStatus>()
// Diagnostics are logged once per url — 20 broken elements shouldn't mean 20x the noise.
const loggedUrls = new Set<string>()

const ABORT_MESSAGE = 'Image load aborted.'

function isAborted(signal?: AbortSignal) {
  return Boolean(signal?.aborted)
}

/** A stored media link is loaded from its view address (lib/media/displayMediaUrl.ts). */
async function loadImageTag(
  src: string,
  crossOrigin: 'anonymous' | null,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return loadSignedImageTag(await displayMediaUrl(src), crossOrigin, signal)
}

function loadSignedImageTag(
  src: string,
  crossOrigin: 'anonymous' | null,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (isAborted(signal)) {
      reject(new Error(ABORT_MESSAGE))
      return
    }

    const image = new window.Image()
    if (crossOrigin) image.crossOrigin = crossOrigin

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', handleAbort)
    }
    // React 19 StrictMode double-invokes effects, so an in-flight load must be
    // droppable — otherwise the discarded <img> still resolves into dead state.
    function handleAbort() {
      cleanup()
      reject(new Error(ABORT_MESSAGE))
    }

    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error(`Image failed to load: ${src}`))
    }
    signal?.addEventListener('abort', handleAbort)
    image.src = src
  })
}

/**
 * Ask the proxy what went wrong. The `<img>` `onerror` event carries no status, so the
 * only way to name the failure (403 deny vs upstream 401 vs 502 egress) is a follow-up
 * fetch that reads the status, the JSON body and the `X-Proxy-*` diagnostic headers the
 * route sets. Logged once per url so a broken canvas is diagnosable from the console
 * alone, without DevTools access to the deployment.
 */
async function logProxyFailure(url: string, proxiedUrl: string) {
  if (loggedUrls.has(url)) return
  loggedUrls.add(url)

  const details: Record<string, unknown> = { url, proxiedUrl }
  try {
    const response = await fetch(proxiedUrl, { cache: 'no-store' })
    details.proxyStatus = response.status
    details.targetHost = response.headers.get('x-proxy-target-host')
    details.targetPath = response.headers.get('x-proxy-target-path')
    details.upstreamStatus = response.headers.get('x-proxy-upstream-status')
    details.denyReason = response.headers.get('x-proxy-deny-reason')
    if (!response.ok) {
      details.body = (await response.text()).slice(0, 200)
    }
  }
  catch (error) {
    details.probeError = error instanceof Error ? error.message : String(error)
  }

  console.error('[canvas-image] proxied load failed, falling back to the raw url', details)
}

export async function loadCanvasImage(
  url: string,
  options: LoadCanvasImageOptions = {},
): Promise<LoadedCanvasImage> {
  const { requirePixelAccess = false, signal } = options
  if (!url) throw new Error('Image url is empty.')

  const proxiedUrl = toProxiedImageUrl(url)
  // data:, blob:, relative and already-proxied urls are served as-is — there is no
  // second url to fall back to, and none of them are cross-origin anyway.
  const hasProxyFallback = proxiedUrl !== url
  const cachedStatus = urlStatusCache.get(url)

  if (hasProxyFallback && cachedStatus === 'tainted') {
    if (requirePixelAccess) {
      throw new ImagePixelAccessError(
        'This image can only be loaded without pixel access (the media proxy is failing), so it cannot be exported or read here.',
      )
    }
    const image = await loadImageTag(url, null, signal)
    return { image, isTainted: true }
  }

  try {
    const crossOrigin = url.startsWith('data:') || url.startsWith('blob:') ? null : 'anonymous'
    const image = await loadImageTag(proxiedUrl, crossOrigin, signal)
    urlStatusCache.set(url, 'clean')
    return { image, isTainted: false }
  }
  catch (error) {
    if (isAborted(signal)) throw error
    if (!hasProxyFallback) {
      urlStatusCache.set(url, 'failed')
      throw error
    }
  }

  await logProxyFailure(url, proxiedUrl)

  // Raw fallback. Loading it even when the caller needs pixel access separates the two
  // failures: the image exists but is tainted (ImagePixelAccessError, actionable) vs
  // the image is genuinely gone (plain load error).
  const image = await loadImageTag(url, null, signal)
  urlStatusCache.set(url, 'tainted')

  if (requirePixelAccess) {
    throw new ImagePixelAccessError(
      'This image can only be loaded without pixel access (the media proxy is failing), so it cannot be exported or read here.',
    )
  }

  return { image, isTainted: true }
}

/** Test/debug seam: drop the memoized per-url outcomes. */
export function resetCanvasImageCache() {
  urlStatusCache.clear()
  loggedUrls.clear()
}
