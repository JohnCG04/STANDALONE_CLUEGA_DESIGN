/**
 * The same-origin media proxy url helper.
 *
 * Lives in its own module (rather than in mediaImageClient) so `loadCanvasImage` can use
 * it without an import cycle — mediaImageClient itself loads images through that loader.
 * `mediaImageClient` re-exports `toProxiedImageUrl` for its existing importers.
 */
export const MEDIA_IMAGE_PROXY = '/api/artifacts/media/image'

/**
 * Route a media artifact URL through the same-origin proxy so the canvas can load it
 * with `crossOrigin = "anonymous"` without hitting CORS on the media host. Local /
 * relative assets, data: and blob: URLs — and urls already served from this origin —
 * are left untouched: proxying a same-origin url gains nothing and would only expose it
 * to the proxy's SSRF allowlist (a guaranteed 403 for non-media paths).
 */
export function toProxiedImageUrl(url: string) {
  if (!url) return url
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith(MEDIA_IMAGE_PROXY)) return url
  if (!/^https?:\/\//i.test(url)) return url
  if (isSameOriginUrl(url)) return url
  return `${MEDIA_IMAGE_PROXY}?url=${encodeURIComponent(url)}`
}

function isSameOriginUrl(url: string) {
  if (typeof window === 'undefined') return false
  try {
    return new URL(url).origin === window.location.origin
  }
  catch {
    return false
  }
}
