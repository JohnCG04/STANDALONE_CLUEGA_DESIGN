import { assertUploadContent, inspectUploadContent } from '@/lib/uploads/contentCheck'
import { textRecognitionService } from './ocr/TextRecognitionService'
import type { OcrProgress } from './ocr/types'
import type { MediaJobType } from '../../../../apis/types'
import {
  DEFAULT_VIDEO_GEN_CONFIG,
  snapVideoDuration,
} from '../../../../../SuggestionPills/videoGenConfig'
import { cachedVideoCatalog } from '../../../../../../hooks/useVideoCatalog'
import { findVideoModelRow, videoDurationsOf } from '@/lib/media-library/videoDurations'
import type {
  VideoDuration,
  VideoOrientation,
} from '../../../../../SuggestionPills/videoGenConfig'
import type { ImageGenConfig } from '../../../../../SuggestionPills/imageGenConfig'
import {
  CANVAS_VIDEO_MODEL,
  CANVAS_VIDEO_RESOLUTION,
  clampCanvasVideoDuration,
} from './constants'
import type { CommentPoint } from './utils/commentGeneration'
import { MEDIA_IMAGE_PROXY, toProxiedImageUrl } from './utils/mediaProxyUrl'
import {
  buildSocialOutpaintPrompt,
  renderSocialFallback,
  runSocialOutpaint,
  SOCIAL_OUTPAINT_MESSAGES,
} from './socialOutpaint'
// Media traffic flows through the CDP gateway (/api/v1/media/*). Reuse the
// shared base-URL + auth helpers so the canvas editor never talks to
// media-ai-service directly and carries the CDP bearer token.
import {
  currentChatSessionId,
  isFatalPollError,
  mediaBaseUrl,
  mediaFetch,
  resolveMediaUrl,
  upstreamErrorMessage,
} from '../../../../apis/api.helper'
import { extractJobArtifactId } from '@/lib/ai-agent/creativeArtifactId'
import { UploadRejectedError, mapUploadFailure } from '@/lib/uploads/limits'
import type { UploadCopy } from '@/lib/uploads/limits'

/**
 * rembg config for the canvas `remove_background` button, sent as the job's
 * `options`. `isnet-general-use` is the general-purpose rembg model; alpha
 * matting cleans up the hair/edge fringe.
 */
const REMOVE_BACKGROUND_OPTIONS = {
  model: 'isnet-general-use',
  alpha_matting: true,
} as const

/**
 * A finished media-gen result: the loadable display url plus the media-library
 * artifact id (`output_refs[0]`, "" when the job returned none). The two are NOT
 * interchangeable — the ad flow reports the artifact id as `creative_ids`, and a
 * display url cannot be resolved back to it.
 */
export type GeneratedMedia = {
  url: string
  artifactId: string
}

export type NormalizedRect = {
  x: number
  y: number
  width: number
  height: number
}

export type PixelPoint = {
  x: number
  y: number
}

export type PixelRect = {
  x: number
  y: number
  width: number
  height: number
}

export type PixelCorners = {
  top_left: PixelPoint
  top_right: PixelPoint
  bottom_right: PixelPoint
  bottom_left: PixelPoint
}

export type NormalizedCorners = {
  top_left: PixelPoint
  top_right: PixelPoint
  bottom_right: PixelPoint
  bottom_left: PixelPoint
}

export type NormalizedCenter = {
  x: number
  y: number
}

export type DetectedTextRegion = {
  id: string
  normalizedRect: NormalizedRect
  originalText: string
  modifiedText: string
  imagePixelSize?: {
    width: number
    height: number
  }
  pixelRect?: PixelRect
  pixelCorners?: PixelCorners
  normalizedCorners?: NormalizedCorners
  normalizedCenter?: NormalizedCenter
}

type MediaJobOptions = {
  model?: string
  alpha_matting?: boolean
  scale?: number
  face_enhance?: boolean
  // Video-job knobs. `seconds` is the documented clip-length option, `orientation` the
  // output framing, `resolution` the target output size, and the two audio flags the
  // music / voice-over tracks — the same keys the main video flow sends (see
  // videoOptions in apis/video.api.ts), so both paths configure the tool identically.
  seconds?: VideoDuration
  orientation?: VideoOrientation
  resolution?: string
  background_music?: boolean
  audio_voice?: boolean
}

type MediaCreateJobRequest = {
  // `type` is REQUIRED by the media-ai-service and is the source of truth for
  // image-vs-video dispatch (POST /jobs returns 422 without it). Every canvas
  // action here — generate, upscale, remove_background, edit_text, social
  // outpaint — is an image job, so this is always "image". Mirrors
  // buildChatJobRequest in apis.ts.
  type: MediaJobType
  prompt: string
  input_files: string[]
  style?: string | null
  operation?: string | null
  // User-selected image model id, sent at the top level of the body exactly like
  // the main generation job (see buildChatJobRequest in apis.ts).
  model?: string
  // Output frame for an image job ("1:1", "9:16", …). A first-class POST /jobs
  // field, so the backend frames to it regardless of what the prompt says — same
  // key the chat design flow sends (buildChatJobRequest). Images only; there is
  // no resolution twin, which is why the size travels in the prompt instead.
  aspect_ratio?: string
  options?: MediaJobOptions | null
}

type MediaCreateJobResponse = {
  job_id?: string
  jobID?: string
  status?: string
}

type MediaJobStatusResponse = {
  status?: string
  result?: MediaJobResult
  error?: string
}

type MediaJobResult = {
  result?: MediaJobResult | null
  artifact_id?: string
  artifactId?: string
  id?: string
  file_id?: string
  fileId?: string
  output_url?: string
  outputUrl?: string
  artifact_url?: string
  artifactUrl?: string
  download_url?: string
  downloadUrl?: string
  image_url?: string
  imageUrl?: string
  output_path?: string
  outputPath?: string
  path?: string
  url?: string
  error?: string
  message?: string
  content?: string
  text?: string
  output_urls?: string[]
  output_refs?: string[]
  // New URL-only protocol (mirrors the block-stream image_gen fields): the
  // loadable display urls arrive in `image_urls`, the canonical `art_*` refs in
  // `image_ids`. The generate / rembg tools now return results this way.
  image_urls?: string[]
  image_ids?: string[]
  // Video jobs (type: 'video') return their result under video-named fields; mirror
  // the image_urls/image_ids protocol so resolveResultUrl can pick up either shape.
  video_url?: string
  videoUrl?: string
  video_urls?: string[]
  video_ids?: string[]
  data?: {
    result?: MediaJobResult | null
    tool_id?: string
    output_urls?: string[]
    output_refs?: string[]
    image_urls?: string[]
    image_ids?: string[]
    video_url?: string
    videoUrl?: string
    video_urls?: string[]
    video_ids?: string[]
    output_url?: string
    outputUrl?: string
    artifact_url?: string
    artifactUrl?: string
    download_url?: string
    downloadUrl?: string
    image_url?: string
    imageUrl?: string
    output_path?: string
    outputPath?: string
    path?: string
    url?: string
    error?: string
    message?: string
    content?: string
    text?: string
  }
  tool_id?: string
  output?: MediaJobResult
  image?: MediaJobResult
  artifacts?: MediaJobResult[]
  outputs?: MediaJobResult[]
  files?: MediaJobResult[]
}

export type ImageDesignAction = 'upscale' | 'removeBackground' | 'editText' | 'socialGenerate' | 'commentEdit'

/**
 * A social-media ad placement size. Content stays the same — only the framing/canvas
 * is adapted to the platform's recommended aspect ratio and pixel dimensions.
 */
export type SocialMediaSize = {
  id: string
  platform: string
  ratio: string
  ratioLabel: string
  width: number
  height: number
  purpose?: string
}

export type SocialMediaPlatform = {
  name: string
  sizes: SocialMediaSize[]
}

export const socialMediaPlatforms: SocialMediaPlatform[] = [
  {
    name: 'TikTok',
    sizes: [
      {
        id: 'tiktok-9-16',
        platform: 'TikTok',
        ratio: '9:16',
        ratioLabel: '9:16 (直式)',
        width: 1080,
        height: 1920,
        purpose: '資訊流廣告、電商帶貨、表單收集（Leads）',
      },
    ],
  },
  {
    name: 'Meta (Facebook / Instagram)',
    sizes: [
      {
        id: 'meta-9-16',
        platform: 'Meta',
        ratio: '9:16',
        ratioLabel: '9:16 (直式)',
        width: 1080,
        height: 1920,
        purpose: 'Reels 與 Stories 短影音首選',
      },
      {
        id: 'meta-4-5',
        platform: 'Meta',
        ratio: '4:5',
        ratioLabel: '4:5 (垂直長形)',
        width: 1080,
        height: 1350,
        purpose: 'Facebook/IG 資訊流（Feed）首選',
      },
      {
        id: 'meta-1-1',
        platform: 'Meta',
        ratio: '1:1',
        ratioLabel: '1:1 (正方形)',
        width: 1080,
        height: 1080,
        purpose: '傳統 Feed 圖文、輪播廣告（Carousel）',
      },
      {
        id: 'meta-16-9',
        platform: 'Meta',
        ratio: '16:9',
        ratioLabel: '16:9 (橫式)',
        width: 1920,
        height: 1080,
        purpose: '插頁影片（In-stream Video）、右側欄版位',
      },
    ],
  },
  {
    name: 'Google Ads (YouTube)',
    sizes: [
      {
        id: 'google-16-9',
        platform: 'Google Ads',
        ratio: '16:9',
        ratioLabel: '16:9 (橫式)',
        width: 1920,
        height: 1080,
        purpose: '傳統 YouTube 影片首選',
      },
      {
        id: 'google-9-16',
        platform: 'Google Ads',
        ratio: '9:16',
        ratioLabel: '9:16 (直式)',
        width: 1080,
        height: 1920,
        purpose: 'YouTube Shorts 短影音首選',
      },
      {
        id: 'google-1-1',
        platform: 'Google Ads',
        ratio: '1:1',
        ratioLabel: '1:1 (正方形)',
        width: 1080,
        height: 1080,
        purpose: '最高效成效廣告（PMax）、多媒體廣告（Display）',
      },
    ],
  },
  {
    name: 'X (Twitter)',
    sizes: [
      {
        id: 'x-16-9',
        platform: 'X',
        ratio: '16:9',
        ratioLabel: '16:9 (橫式)',
        width: 1920,
        height: 1080,
        purpose: '資訊流（Timeline）標準推廣影片',
      },
      {
        id: 'x-1-1',
        platform: 'X',
        ratio: '1:1',
        ratioLabel: '1:1 (正方形)',
        width: 1080,
        height: 1080,
        purpose: '對話式卡片廣告（Conversational Card）',
      },
      {
        id: 'x-9-16',
        platform: 'X',
        ratio: '9:16',
        ratioLabel: '9:16 (直式)',
        width: 1080,
        height: 1920,
        purpose: '全螢幕沉浸式影片廣告（Immersive Video）',
      },
    ],
  },
]

type EditImageOptions = {
  action: ImageDesignAction
  sourceImageUrl: string
  userPrompt?: string
  scale?: number
  targetSize?: SocialMediaSize
  textRegions?: DetectedTextRegion[]
  // Comment pins to apply when action === 'commentEdit' — each carries a normalized
  // 0..1 position + the user's instruction text. Built by buildCommentRequests.
  commentPoints?: CommentPoint[]
  // User-selected image model id, forwarded to POST /jobs at the top level.
  model?: string
}

const defaultImageUrl = '/images/SourcesSupportingGraphic.svg'

// Bundled sample used as the video result when no media backend is configured (dev),
// so the in-canvas video rendering + controls are exercisable without the service.
const defaultVideoUrl = '/videos/demo.mp4'

// Re-exported so the existing importers (`from '../mediaImageClient'`) keep working;
// the implementation moved to utils/mediaProxyUrl.ts to break the import cycle with
// utils/loadCanvasImage.ts.
export { toProxiedImageUrl }

// Resolve a canvas image URL to the absolute display URL the backend now accepts as
// an `input_files` entry. The image tools resolve an input by its full https URL
// (the URL-only protocol) — NOT a bare `art_*` ref, which fails with "cannot resolve
// input image '<id>'". Strips our same-origin proxy wrapper so the backend gets the
// real R2/CDP url (it cannot fetch the frontend's /api/artifacts/media/image
// proxy) and absolutizes any relative artifact path.
export function toInputFileUrl(url: string): string {
  let resolved = url
  if (resolved.startsWith(MEDIA_IMAGE_PROXY)) {
    const inner = new URLSearchParams(resolved.split('?')[1] ?? '').get('url')
    if (inner) resolved = inner
  }
  return resolveRelativeUrl(resolved)
}

function requestForEdit(options: EditImageOptions, inputFile: string): MediaCreateJobRequest {
  const operation =
    options.action === 'removeBackground'
      ? 'remove_background'
      : options.action === 'upscale'
        ? 'upscale'
        : null

  return {
    // Canvas edits (upscale / remove_background / edit_text / social outpaint) are
    // all image jobs — the service requires `type` to route them (422 otherwise).
    type: 'image',
    prompt: operation ? '' : makePrompt(options),
    // The backend resolves an input image by its full display URL (the URL-only
    // protocol), so we send the whole https link here rather than a bare art_* ref.
    input_files: [inputFile],
    style: null,
    operation,
    // Top-level `model` is the user-selected image-generation model and is ONLY
    // valid for prompt-driven jobs (operation === null: socialGenerate / editText),
    // exactly like the main generation job. For deterministic operations
    // (remove_background / upscale) the backend reads the top-level model as the
    // tool's session model — sending an LLM/image model there throws
    // "No session class found for model …", so it MUST be omitted; those use
    // `options.model` (e.g. rembg `isnet-general-use`) instead.
    ...(!operation && options.model ? { model: options.model } : {}),
    options:
      operation === 'remove_background'
        ? { ...REMOVE_BACKGROUND_OPTIONS }
        : operation === 'upscale'
          ? { scale: options.scale ?? 2 }
          : {},
  }
}

function resolveRelativeUrl(value: string) {
  return resolveMediaUrl(value)
}

function firstString(...values: Array<string | undefined | null>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null
}

function firstNestedResult(result: MediaJobResult): MediaJobResult | null {
  return result.result
    ?? result.data?.result
    ?? result.output
    ?? result.image
    ?? result.artifacts?.[0]
    ?? result.outputs?.[0]
    ?? result.files?.[0]
    ?? null
}

/**
 * Ask the media gateway for a fresh, authorized download URL for a hosted file
 * (`GET {mediaBaseUrl}/files/{id}/download-url`). The gateway proxies to the storage
 * service; the browser must go through it (not the storage host directly) for auth +
 * CORS. `mediaFetch` supplies the CDP Bearer token (and refreshes it on a 401); the
 * backend validates the JWT and issues a signed URL for the underlying R2 object.
 * Mirrors components/workflow/shared/artifacts.ts.
 *
 * Returns `null` (rather than throwing) whenever a URL can't be resolved — no base
 * url, no id, a non-2xx response, or a body without a url — so the caller can fall
 * back to deriving one. The body is the `{ success, data: { ... } }` envelope; we
 * read the url off `data` (or the top level as a shim) and accept
 * `url`/`download_url`/`downloadUrl` defensively.
 */
async function resolveHostedDownloadUrl(id: string): Promise<string | null> {
  const baseUrl = mediaBaseUrl()
  if (!baseUrl || !id) return null

  try {
    const response = await mediaFetch(
      `${baseUrl}/files/${encodeURIComponent(id)}/download-url`,
    )
    if (!response.ok) return null

    type UrlBody = { url?: string; download_url?: string; downloadUrl?: string }
    const payload = (await response.json().catch(() => null)) as
      | (UrlBody & { data?: UrlBody })
      | null
    if (!payload) return null

    const body = payload.data ?? payload
    return body.url ?? body.download_url ?? body.downloadUrl ?? null
  } catch {
    return null
  }
}

function artifactUrl(toolId: string | undefined, outputRef: string) {
  if (outputRef.startsWith('http://') || outputRef.startsWith('https://') || outputRef.startsWith('/')) {
    return resolveRelativeUrl(outputRef)
  }

  const filename = outputRef.includes('.')
    ? outputRef
    : toolId
      ? `${toolId}-${outputRef}.png`
      : `${outputRef}.png`

  return resolveRelativeUrl(`/artifacts-output/${filename}`)
}

// Mirror the block-stream driver's field resolution (createSseDriver →
// resolveDisplayUrls): in the URL-only protocol the generate / rembg tools return
// the loadable display urls in `image_urls` (extensionless R2 urls) and opaque
// `art_*` refs in `image_ids`. Prefer `image_urls`; only fall back to `image_ids`
// when it carries an absolute url (older payloads) — never resolve an `art_*` ref
// to a url (GET /artifacts/{id} 404s). Returns the first display url, or null.
function resolveDisplayUrl(
  obj:
    | { image_urls?: string[]; image_ids?: string[]; video_urls?: string[]; video_ids?: string[] }
    | null
    | undefined,
): string | null {
  if (!obj) return null
  // Video jobs return their loadable url in video_urls; check it first so a video
  // result isn't missed when the payload carries no image_* fields.
  const videoUrls = obj.video_urls
  if (Array.isArray(videoUrls) && videoUrls.length > 0 && videoUrls[0]) return videoUrls[0]
  const videoIds = obj.video_ids
  if (Array.isArray(videoIds) && videoIds.length > 0 && videoIds[0] && /^(https?:|data:|blob:)/.test(videoIds[0])) return videoIds[0]
  const urls = obj.image_urls
  if (Array.isArray(urls) && urls.length > 0 && urls[0]) return urls[0]
  const ids = obj.image_ids
  if (Array.isArray(ids) && ids.length > 0 && ids[0] && /^(https?:|data:|blob:)/.test(ids[0])) return ids[0]
  return null
}

function resolveResultUrl(result: MediaJobResult): string | null {
  const nested = firstNestedResult(result)

  // New URL-only protocol (matches the block-stream gallery): display urls arrive
  // in `image_urls`, refs in `image_ids`. Check these FIRST so canvas generate /
  // remove-bg / social pick up their results too — they no longer come back in the
  // legacy `output_urls` shape that the image-edit tool (comment/edit-text) still uses.
  const displayUrl =
    resolveDisplayUrl(result)
    ?? resolveDisplayUrl(result.data)
    ?? resolveDisplayUrl(nested)
    ?? resolveDisplayUrl(nested?.data)
  if (displayUrl) return resolveRelativeUrl(displayUrl)

  const outputUrl = result.output_urls?.[0]
    ?? result.data?.output_urls?.[0]
    ?? nested?.output_urls?.[0]
    ?? nested?.data?.output_urls?.[0]
  if (outputUrl) return resolveRelativeUrl(outputUrl)

  const directUrl = firstString(
    result.video_url,
    result.videoUrl,
    result.data?.video_url,
    result.data?.videoUrl,
    nested?.video_url,
    nested?.videoUrl,
    result.output_url,
    result.outputUrl,
    result.artifact_url,
    result.artifactUrl,
    result.download_url,
    result.downloadUrl,
    result.image_url,
    result.imageUrl,
    result.output_path,
    result.outputPath,
    result.path,
    result.url,
    result.data?.output_url,
    result.data?.outputUrl,
    result.data?.artifact_url,
    result.data?.artifactUrl,
    result.data?.download_url,
    result.data?.downloadUrl,
    result.data?.image_url,
    result.data?.imageUrl,
    result.data?.output_path,
    result.data?.outputPath,
    result.data?.path,
    result.data?.url,
    nested?.output_url,
    nested?.outputUrl,
    nested?.artifact_url,
    nested?.artifactUrl,
    nested?.download_url,
    nested?.downloadUrl,
    nested?.image_url,
    nested?.imageUrl,
    nested?.output_path,
    nested?.outputPath,
    nested?.path,
    nested?.url,
    nested?.data?.output_url,
    nested?.data?.outputUrl,
    nested?.data?.artifact_url,
    nested?.data?.artifactUrl,
    nested?.data?.download_url,
    nested?.data?.downloadUrl,
    nested?.data?.image_url,
    nested?.data?.imageUrl,
    nested?.data?.output_path,
    nested?.data?.outputPath,
    nested?.data?.path,
    nested?.data?.url,
  )

  if (directUrl) return resolveRelativeUrl(directUrl)

  const outputRef = result.data?.output_refs?.[0]
    ?? result.output_refs?.[0]
    ?? nested?.data?.output_refs?.[0]
    ?? nested?.output_refs?.[0]
  if (outputRef) {
    return artifactUrl(
      result.data?.tool_id ?? result.tool_id ?? nested?.data?.tool_id ?? nested?.tool_id,
      outputRef,
    )
  }

  return null
}

function isTerminalSuccess(status: string | undefined) {
  return status === 'succeeded' || status === 'completed' || status === 'success'
}

function isTerminalFailure(status: string | undefined) {
  return status === 'failed' || status === 'error' || status === 'cancelled'
}

async function createJob(requestBody: MediaCreateJobRequest) {
  const baseUrl = mediaBaseUrl()
  if (!baseUrl) {
    throw new Error('Media AI API is not configured.')
  }

  // mediaFetch heals a 401 by refreshing the CDP access token once and retrying,
  // so an expired token at job-creation time no longer fails the action. It
  // rebuilds the auth headers itself — we pass only content-type.
  const response = await mediaFetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (response.status !== 202) {
    throw new Error(await upstreamErrorMessage(response))
  }

  const payload = (await response.json()) as MediaCreateJobResponse
  const jobId = payload.job_id ?? payload.jobID
  if (!jobId) {
    throw new Error('Media job response is missing job_id.')
  }

  return jobId
}

async function waitForStatus(jobId: string, maxAttempts = 90, pollIntervalMs = 3000) {
  const baseUrl = mediaBaseUrl()

  // ~90s budget by default (matches the chat block-stream's image budget): generation
  // can run 15s+, and this poll is the ONLY path to the result (there is no live
  // stream). Video jobs pass a larger budget AND a slower poll (3-5s) — they routinely
  // run several minutes, so polling /jobs/{id} every 1s just wastes calls and risks
  // rate limits.
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // mediaFetch heals an expired access token (refresh once + retry) — the whole
    // point of the fix, since a poll can outlive the 15-min token. Only the network
    // call is guarded here: a residual 401 (refresh race across concurrent polls) or
    // a transient blip is RECOVERABLE, so we wait and re-poll rather than failing the
    // job. isFatalPollError isolates the two states that must stop the loop: an abort,
    // and a dead session (CluegaUnauthorizedError — mediaFetch already cleared it and
    // redirected to /login). Terminal-status handling stays OUTSIDE this try so a real
    // job failure / missing-url is surfaced, not silently retried.
    let response: Response
    try {
      response = await mediaFetch(`${baseUrl}/jobs/${jobId}`)
    }
    catch (error) {
      if (isFatalPollError(error)) throw error
      await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
      continue
    }

    if (!response.ok) {
      // A still-401 after mediaFetch's single retry is a refresh race, not a dead
      // session — the next tick rebuilds auth from the freshly refreshed token and
      // succeeds, so wait and re-poll instead of throwing.
      if (response.status === 401) {
        await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
        continue
      }
      throw new Error(await upstreamErrorMessage(response))
    }

    const status = (await response.json()) as MediaJobStatusResponse
    if (status.error) {
      throw new Error(status.error)
    }

    if (isTerminalFailure(status.status)) {
      throw new Error(`Media job ${jobId} ${status.status}.`)
    }

    if (isTerminalSuccess(status.status)) {
      const resolvedUrl = status.result ? resolveResultUrl(status.result) : null
      if (!resolvedUrl) {
        throw new Error('Media job completed without an image URL.')
      }
      // The artifact id rides alongside the url: an ad built from this media must
      // report the media-LIBRARY id (creative_ids), which the display url cannot be
      // resolved back to. "" when the job returned no ref (see extractJobArtifactId).
      return { url: resolvedUrl, artifactId: extractJobArtifactId(status.result) }
    }

    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Media job timed out.')
}

/**
 * Run a media-gen job to completion and return BOTH the display url and the
 * media-library artifact id (see waitForStatus). Callers that only render the
 * result read `.url`; the ad flow needs `.artifactId` to attribute an ad to the
 * AI creative it was built from.
 */
async function runJob(
  requestBody: MediaCreateJobRequest,
  options?: { maxWaitAttempts?: number; pollIntervalMs?: number },
): Promise<GeneratedMedia> {
  const jobId = await createJob(requestBody)
  // Poll the job status to completion instead of opening the live SSE stream. The
  // stream connection is frequently dropped mid-generation (a tool like openai_images
  // runs ~15s+ with a long idle gap, and an intermediate hop kills the idle connection
  // before the result arrives), whereas polling /jobs/{id} is connectionless and
  // reliable. waitForStatus resolves the result URL (incl. the `image_urls` shape) or
  // surfaces a real terminal error, and heals an expired access token per tick via
  // mediaFetch.
  return waitForStatus(jobId, options?.maxWaitAttempts ?? 90, options?.pollIntervalMs ?? 3000)
}

function fallbackUrl(sourceImageUrl?: string) {
  return sourceImageUrl ?? defaultImageUrl
}

/**
 * Text-to-image. Returns the display url PLUS the media-library artifact id — the
 * id is what an ad built from this image (or from a video generated OUT of it)
 * reports as its creative, and a display url cannot be resolved back to it.
 *
 * `config` carries the user's output frame + size from the generate panel, sent
 * exactly the way the chat design flow sends them (see createSseDriver): the
 * ratio as the job's own `aspect_ratio` field, and nothing appended to the prompt
 * — so the resolution, which POST /jobs has no field for, does not travel.
 */
export async function generateImage(
  prompt: string,
  model?: string,
  config?: ImageGenConfig,
): Promise<GeneratedMedia> {
  if (!mediaBaseUrl()) {
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    return { url: defaultImageUrl, artifactId: '' }
  }

  return runJob({
    // Plain text-to-image generation — `type: "image"` is the required dispatch
    // discriminator, exactly like buildChatJobRequest in apis.ts.
    type: 'image',
    prompt,
    input_files: [],
    style: null,
    operation: null,
    ...(model ? { model } : {}),
    ...(config?.aspectRatio ? { aspect_ratio: config.aspectRatio } : {}),
    // Provenance, on the same only-when-true terms as everywhere else: without
    // it the panel's default frame reads as an instruction and a ratio named in
    // the prompt can never win.
    ...(config?.aspectExplicit ? { aspect_explicit: true } : {}),
    options: {},
  })
}

/**
 * User-chosen video knobs from the generate panel's duration / orientation pickers.
 * Unset values fall back to the picker defaults: CANVAS_VIDEO_DURATION_MIN for the clip
 * length, and the composer video flow's default orientation.
 */
export type VideoGenerationSettings = {
  duration?: VideoDuration
  orientation?: VideoOrientation
}

/**
 * Image-to-video: generate a video FROM a source canvas image + a text prompt.
 * Mirrors editImage's input-file handling (upload a local blob/data source, else send
 * the resolved https display url) but dispatches a `type: 'video'` job. Returns the
 * resolved video URL — the caller renders it as a `mediaType: 'video'` canvas element
 * — PLUS the media-library artifact id, which the canvas element keeps so a "Use for
 * Ad" hand-off can report which AI creative the ad was built from (creative_ids).
 *
 * NOTE: the caller's selected model is never forwarded — that is the user-selected
 * IMAGE model (e.g. google/gemini-3.1-flash-image-preview), which is only valid for
 * image jobs and would route a video job to the wrong model. This flow pins its own
 * video model instead (CANVAS_VIDEO_MODEL).
 */
export async function generateVideoFromImage(
  prompt: string,
  sourceImageUrl: string,
  settings?: VideoGenerationSettings,
): Promise<GeneratedMedia> {
  if (!mediaBaseUrl()) {
    // No backend (dev): return the bundled sample so the in-canvas video UI still works.
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    return { url: defaultVideoUrl, artifactId: '' }
  }

  // Resolve the source to a backend-loadable https URL (URL-only protocol), uploading
  // a local blob/data source first — exactly like editImage builds its input_files.
  let inputFile: string | null = null
  if (sourceImageUrl.startsWith('blob:') || sourceImageUrl.startsWith('data:')) {
    const uploaded = await uploadLocalImage(sourceImageUrl).catch((error) => {
      console.error('[GenerateVideo] Failed to upload source image:', error)
      return null
    })
    inputFile = uploaded?.url ?? null
  }
  else {
    inputFile = toInputFileUrl(sourceImageUrl)
  }

  if (!inputFile) {
    throw new Error('Could not resolve the source image for video generation.')
  }

  return runJob(
    {
      type: 'video',
      prompt,
      input_files: [inputFile],
      style: null,
      operation: null,
      // The pinned video model — NOT the caller's image model (see above).
      model: CANVAS_VIDEO_MODEL,
      options: {
        // Clamped to this flow's bounds, then snapped onto whatever the pinned
        // model actually renders — the bounds are a contiguous 4..15 while a
        // model's real list may skip values (Sora: 4/8/12/16/20), and an
        // off-list length is a 400, not a rounding.
        seconds: snapVideoDuration(
          clampCanvasVideoDuration(settings?.duration),
          videoDurationsOf(findVideoModelRow(cachedVideoCatalog(), CANVAS_VIDEO_MODEL)),
          clampCanvasVideoDuration(settings?.duration),
        ),
        orientation: settings?.orientation ?? DEFAULT_VIDEO_GEN_CONFIG.orientation,
        resolution: CANVAS_VIDEO_RESOLUTION,
        // Both audio tracks pinned OFF. Left unset, the service applies its own
        // defaults, and this canvas is only reachable from the ad creative panel
        // (main.tsx is the sole caller passing `enableVideoGeneration`), where a
        // clip carrying music or a voice-over is wrong — the ad supplies its own
        // sound, and the card's own image→video path
        // (lib/media-library/mediaJobs.ts) has always sent both as false.
        background_music: false,
        audio_voice: false,
      },
    },
    // Video jobs routinely run several minutes: poll every 4s (not 1s) to avoid rate
    // limiting, with a wide budget — 180 × 4s ≈ 12 min.
    { maxWaitAttempts: 180, pollIntervalMs: 4000 },
  )
}

export async function editImage(options: EditImageOptions): Promise<GeneratedMedia> {
  // A social size is not an edit with a bigger canvas — it is the AI Resize outpaint
  // with a fixed frame, and it owns its own upload/composite steps.
  if (options.action === 'socialGenerate' && options.targetSize) {
    return socialGenerate(options, options.targetSize)
  }

  // Build the `input_files` entry as a full https URL (the URL-only protocol). For an
  // existing canvas image, send its display url (un-proxied + absolute). For a local
  // blob/data source, upload it first and send the stored url the backend returns.
  let inputFile: string | null = null
  const source = options.sourceImageUrl
  if (source.startsWith('blob:') || source.startsWith('data:')) {
    try {
      const uploaded = await uploadLocalImage(source)
      if (uploaded) {
        inputFile = uploaded.url
      }
    }
    catch (error) {
      console.error('[EditImage] Failed to upload local image:', error)
    }
  }
  else {
    inputFile = toInputFileUrl(source)
  }

  if (!mediaBaseUrl() || !inputFile) {
    await new Promise((resolve) => window.setTimeout(resolve, 800))
    return { url: fallbackUrl(options.sourceImageUrl), artifactId: '' }
  }

  return runJob(requestForEdit(options, inputFile))
}

/**
 * Reframe onto a social placement, via the AI Resize engine (see socialOutpaint.ts).
 *
 * The pipeline lives there because it is raster work; this function is only the job
 * plumbing the canvas editor owns — the user's selected image model, `POST /jobs`, and
 * storing the finished picture as an artifact so it survives a reload.
 *
 * The returned url is ALWAYS an image at exactly the chosen pixel size, which is what
 * lets the canvas element pin itself to 1080×1920 without stretching what it renders.
 */
async function socialGenerate(
  options: EditImageOptions,
  target: SocialMediaSize,
): Promise<GeneratedMedia> {
  const label = `${target.platform} ${target.ratio} ${target.width}×${target.height}`

  // No backend (dev): the frame is still honoured, just without the outpaint.
  if (!mediaBaseUrl()) {
    console.warn(`[SocialGenerate] no media backend — local reframe only (${label})`)
    const url = await renderSocialFallback(options.sourceImageUrl, target)
      .catch(() => fallbackUrl(options.sourceImageUrl))
    return { url, artifactId: '' }
  }

  const prompt = buildSocialOutpaintPrompt(target, options.userPrompt)

  const result = await runSocialOutpaint({
    sourceImageUrl: options.sourceImageUrl,
    targetSize: target,
    uploadPng: async (file) => (await uploadArtifactFile(file))?.url ?? null,
    generate: async (inputFileUrl) => {
      const { url } = await runJob({
        type: 'image',
        prompt,
        input_files: [inputFileUrl],
        style: null,
        // Prompt-driven, exactly like the resize node: `operation` would route this to
        // a deterministic tool, and no `aspect_ratio` is sent because the canvas we
        // hand over already IS the target frame.
        operation: null,
        ...(options.model ? { model: options.model } : {}),
        options: {},
      })
      return url
    },
  })

  const stored = await uploadArtifactFile(
    new File([result.blob], result.fileName, { type: result.blob.type }),
  )
  if (!stored) throw new Error(SOCIAL_OUTPAINT_MESSAGES.resultUploadFailed)

  console.log(
    `[SocialGenerate] ✔ ${label}${result.painted ? '' : ' (source already filled the frame — no job run)'}`,
    { url: stored.url, seam: result.seam?.score.toFixed(2) ?? null },
  )
  return { url: stored.url, artifactId: stored.artifactId }
}

/** The gateway's error body when it sent one — `mapUploadFailure` reads a `code`
 *  out of it, and a non-JSON body (an nginx 413 page) must not throw here. */
function safeJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return undefined
  }
}

export async function uploadArtifactFile(
  file: File,
  typeUpload?: string,
  // What the file is for; the chat composer sends `chat_attachment`, which the
  // backend keeps out of the Library (BUG-AI-0668). Absent for everyone else.
  purpose?: string,
): Promise<{ artifactId: string; url: string } | null> {
  const baseUrl = mediaBaseUrl()
  if (!baseUrl) return null

  // Every picker that calls this (Face Swap, Avatar Studio, Brand Kit, the canvas…)
  // used to send whatever it was handed. A file whose bytes are not what its name says
  // is refused here, once, instead of in each of them.
  await assertUploadContent(file)

  const formData = new FormData()
  formData.append('file', file)
  if (typeUpload) formData.append('type_upload', typeUpload)
  if (purpose) formData.append('purpose', purpose)
  // The conversation this file was uploaded from, so the Material Center can
  // link the asset back to it. Absent outside a chat (the workflow editor, the
  // media studio), which the backend reads as "no conversation".
  const conversationId = currentChatSessionId()
  if (conversationId) formData.append('conversation_id', conversationId)

  // mediaFetch replaces the previous manual 401 → refresh → retry: it heals an
  // expired access token itself. FormData carries no content-type (the browser sets
  // the multipart boundary), and mediaFetch never adds one, so the upload is preserved.
  const uploadResponse = await mediaFetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    body: formData,
  })

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '')
    console.error('[uploadArtifactFile] failed', uploadResponse.status, detail)
    // An UploadRejectedError, not a bare Error: the composer renders whatever a
    // failed row carries, and `Upload failed (413)` is not a sentence to show a
    // user. `mapUploadFailure` gives the same translated copy the pre-flight
    // check produces, and the status rides along so a retry can tell a transient
    // 502 from a file that will be rejected identically forever.
    throw new UploadRejectedError(
      mapUploadFailure(uploadResponse.status, safeJson(detail)),
      uploadResponse.status,
    )
  }

  // The gateway now replies with the storage envelope `{ success, data: { id,
  // mimeType, storageKey, url, ... } }` — `data.id` is the HOSTED FILE ID (a ULID),
  // the real id we return to the client. (The old response's fabricated
  // top-level `artifact_id`/`art_*` ref is gone; keep the legacy fields as a
  // fallback so an older gateway still works.)
  const payload = await uploadResponse.json() as UploadedFilePayload
  return readUploadedFile(payload)
}

type UploadedFilePayload = {
  success?: boolean
  data?: { id?: string, url?: string }
  id?: string
  artifact_id?: string
  url?: string
  file_name?: string
  file_id?: string
  output_refs?: string[]
}

/**
 * One uploaded file's id + loadable url, out of whichever response shape arrived.
 *
 * Shared by the single-file and batch paths so the two cannot drift: the id
 * ladder spans the current storage envelope (`data.id`, a hosted-file ULID) and
 * the legacy fabricated `artifact_id`/`art_*` ref, and the url ladder prefers the
 * inline url, then resolves an authorized download URL from the id, then derives
 * a display path — so a caller always persists a resolvable url, never a blob:.
 */
async function readUploadedFile(
  payload: UploadedFilePayload,
): Promise<{ artifactId: string, url: string } | null> {
  const artifactId =
    payload.data?.id
    ?? payload.id
    ?? payload.artifact_id
    ?? payload.file_id
    ?? payload.output_refs?.[0]
    ?? null
  if (!artifactId) return null
  const url =
    payload.url
    ?? payload.data?.url
    ?? (await resolveHostedDownloadUrl(artifactId))
    ?? artifactUrl(undefined, artifactId)
  return { artifactId, url }
}

/** One file's outcome inside a batch. Settled, never thrown: a rejected file
 *  must leave its siblings alone. */
export type ArtifactUploadResult =
  | { ok: true, artifactId: string, url: string }
  | { ok: false, copy: UploadCopy }

// The gateway may not have STORAGE_GATEWAY_BATCH_UPLOAD on, in which case a
// multi-file body is answered as "no such thing". Latched per page load so a
// stale env costs one wasted body, not one per pick.
let batchUnsupported = false

export const isBatchUploadUnsupported = () => batchUnsupported

export function markBatchUploadUnsupported(): void {
  batchUnsupported = true
}

/**
 * Upload several files in ONE multipart request.
 *
 * Results are index-aligned with `files` — the composer holds one optimistic row
 * per file and file names collide, so there is no other way to reconcile them.
 * A whole-request failure fans the same copy out to every row rather than
 * throwing, so one bad chunk cannot lose the rows that landed in another.
 *
 * Metadata fields are appended BEFORE the files: the gateway reads parts in
 * stream order, and a field arriving after a file cannot reach that blob's
 * storage-side metadata.
 */
export async function uploadArtifactFiles(
  files: readonly File[],
  typeUpload?: string,
  /** See uploadArtifactFile. */
  purpose?: string,
): Promise<ArtifactUploadResult[]> {
  const fanOut = (copy: UploadCopy): ArtifactUploadResult[] =>
    files.map(() => ({ ok: false as const, copy }))

  // Files whose bytes are not what their name says are answered here, in place; the
  // rest still go up, and every result stays aligned with the file it belongs to.
  const verdicts = await Promise.all(files.map((file) => inspectUploadContent(file)))
  if (verdicts.some(Boolean)) {
    const sound = files.filter((_, index) => !verdicts[index])
    const soundResults = sound.length > 0 ? await uploadArtifactFiles(sound, typeUpload, purpose) : []
    let next = 0
    return files.map((_, index) => {
      const verdict = verdicts[index]
      return verdict ? { ok: false as const, copy: verdict } : soundResults[next++]
    })
  }

  const baseUrl = mediaBaseUrl()
  if (!baseUrl) return fanOut(mapUploadFailure(0))

  const formData = new FormData()
  if (typeUpload) formData.append('type_upload', typeUpload)
  if (purpose) formData.append('purpose', purpose)
  const conversationId = currentChatSessionId()
  if (conversationId) formData.append('conversation_id', conversationId)
  for (const file of files) formData.append('files', file)

  const response = await mediaFetch(`${baseUrl}/artifacts`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    if (response.status === 404 || response.status === 405) {
      markBatchUploadUnsupported()
    }
    console.error('[uploadArtifactFiles] failed', response.status, detail)
    throw new UploadRejectedError(
      mapUploadFailure(response.status, safeJson(detail)),
      response.status,
    )
  }

  const payload = await response.json() as
    | UploadedFilePayload
    | { count?: number, items?: UploadedFilePayload[], failed?: { code?: string }[] }

  // A single-file request is answered with the flat object, so it is read the
  // same way the single-file path reads it.
  const items = 'items' in payload && Array.isArray(payload.items)
    ? payload.items
    : [payload as UploadedFilePayload]

  const results: ArtifactUploadResult[] = []
  for (let index = 0; index < files.length; index += 1) {
    const entry = items[index]
    const read = entry ? await readUploadedFile(entry) : null
    results.push(
      read
        ? { ok: true, artifactId: read.artifactId, url: read.url }
        : { ok: false, copy: mapUploadFailure(502) },
    )
  }
  return results
}

export async function uploadLocalImage(imageUrl: string): Promise<{ artifactId: string; url: string } | null> {
  try {
    // Both data: and blob: URLs resolve to a Blob the same way.
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    const file = new File([blob], 'uploaded-image.png', { type: blob.type || 'image/png' })
    return await uploadArtifactFile(file)
  }
  catch (error) {
    console.error('[UploadLocalImage] Error:', error)
    return null
  }
}

export async function detectTextRegions(
  imageUrl: string,
  onProgress?: (progress: OcrProgress) => void,
): Promise<DetectedTextRegion[]> {
  const result = await textRecognitionService.recognize(imageUrl, onProgress)
  return result.regions
}

function makePrompt(options: EditImageOptions) {
  const userPrompt = options.userPrompt?.trim() ?? ''
  if (options.action === 'upscale') {
    const scale = options.scale ?? 2
    return userPrompt ? `Upscale ${scale}x. Extra instructions: ${userPrompt}` : `Upscale ${scale}x`
  }

  if (options.action === 'removeBackground') {
    const basePrompt = 'Remove the background from this image and keep only the primary subject with clean edges. Output must be a transparent PNG background with preserved alpha.'
    return userPrompt ? `${basePrompt} Extra instructions: ${userPrompt}` : basePrompt
  }

  // Reached only if a caller routes a social size through the generic edit request —
  // editImage sends them down the outpaint path instead (see socialGenerate), which
  // builds the same prompt against a canvas that is already the target frame.
  if (options.action === 'socialGenerate' && options.targetSize) {
    return buildSocialOutpaintPrompt(options.targetSize, userPrompt)
  }

  if (options.action === 'commentEdit') {
    const commentPrompt = makeCommentEditPrompt(options.commentPoints ?? [], userPrompt)
    // Debug: the exact prompt sent to the backend router. Copy this if the router
    // still errors so the next fix is based on what it actually receives.
    console.log(
      `[CommentEdit] ${options.commentPoints?.length ?? 0} point(s) → prompt:\n${commentPrompt}`,
    )
    return commentPrompt
  }

  return makeEditTextPrompt(options.textRegions ?? [], userPrompt)
}

function makeEditTextPrompt(textRegions: DetectedTextRegion[], userPrompt: string) {
  const editedRegions = textRegions.filter(
    (region) => region.originalText.trim() !== region.modifiedText.trim(),
  )

  const payload = editedRegions.map((region) => {
    const rect = region.normalizedRect

    return {
      id: region.id,
      original_text: region.originalText,
      new_text: region.modifiedText.trim(),
      image_size_pixels: region.imagePixelSize,
      normalized_rect: roundObject(rect),
      normalized_center: roundObject(region.normalizedCenter ?? {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      }),
      normalized_corners: roundObject(region.normalizedCorners ?? {
        top_left: { x: rect.x, y: rect.y },
        top_right: { x: rect.x + rect.width, y: rect.y },
        bottom_right: { x: rect.x + rect.width, y: rect.y + rect.height },
        bottom_left: { x: rect.x, y: rect.y + rect.height },
      }),
      pixel_rect: region.pixelRect,
      pixel_corners: region.pixelCorners,
    }
  })

  const extraInstructions = userPrompt ? `\nExtra user instructions: ${userPrompt}` : ''

  return `Operation: edit_text

You are editing text inside an existing image.

Strict requirements:
- The JSON below lists ONLY the text regions the user changed. Edit exactly these regions and nothing else.
- For each region, replace only the visible text content from original_text to new_text.
- Do NOT change, redraw, translate, remove, blur, or reposition any other text or element in the image that is not listed below. Treat all unlisted text as protected.
- Preserve the original font family, font style, font weight, color, size, spacing, alignment, perspective, texture, shadow, outline, and placement of the edited text.
- Preserve the image layout, background, products, graphics, lighting, colors, quality, and all non-edited details exactly as the source image.
- Use normalized coordinates with origin at the top-left of the image.
- Treat normalized_corners as the exact 4-point text area boundary: top_left, top_right, bottom_right, bottom_left.
- When image_size_pixels, pixel_rect, or pixel_corners are present, use pixel_corners as the primary exact boundary in the original source image pixel coordinate system. Do not edit any text outside those pixel corners.
- If the same original_text or visually similar text appears elsewhere, edit only the occurrence whose glyphs fall inside the provided pixel_corners.

Text regions to edit:
${JSON.stringify(payload, null, 2)}${extraInstructions}`
}

// Comment-driven edits: the user pins instructions on points of the image — each pin
// carries a normalized 0..1 position (origin top-left, same contract as edit_text)
// plus free-text instruction, e.g. "thêm logo apple". Split single vs multi on
// purpose: same coordinate logic, but separate prompts so each stays focused and is
// easy to read/diff when debugging a bad result.
function makeCommentEditPrompt(points: CommentPoint[], userPrompt: string) {
  // A lone pin reads better as a plain sentence; many pins read better as a list.
  return points.length === 1
    ? makeSingleCommentPrompt(points[0], userPrompt)
    : makeMultiCommentPrompt(points, userPrompt)
}

function makeSingleCommentPrompt(point: CommentPoint, userPrompt: string) {
  const position = roundObject({ x: point.relX, y: point.relY })
  const extraInstructions = userPrompt ? `\n\nExtra user instructions: ${userPrompt}` : ''

  return `Operation: comment_edit_single

You are editing an existing image based on ONE instruction the user pinned on it.
Use normalized coordinates with the origin at the top-left of the image (0..1 on each axis).

Instruction: ${JSON.stringify(point.prompt)}
Apply it centered at normalized_position ${JSON.stringify(position)}.

Strict requirements:
- Apply the change at the given position and blend it naturally into the scene — match the existing lighting, perspective, color, scale, shadows, and style so it looks original.
- Keep everything else EXACTLY as the source image: subject, layout, background, other objects, text, colors, and quality. Do not move, recolor, restyle, crop, or redraw anything that was not requested.
- Do NOT add watermarks or any content the user did not ask for.${extraInstructions}`
}

function makeMultiCommentPrompt(points: CommentPoint[], userPrompt: string) {
  // Merge every pin into ONE combined instruction (not a numbered list of separate
  // tasks): the backend router rewrites a single edit intent fine — as the 1-comment
  // case proves — but returns a null rewritten_prompt when the prompt reads as several
  // distinct operations. So we fold all pins into one request, mirroring the single
  // prompt's envelope.
  const combined = points
    .map((point) => {
      const x = Number(point.relX.toFixed(2))
      const y = Number(point.relY.toFixed(2))
      return `${point.prompt} (near x=${x}, y=${y})`
    })
    .join('; ')
  const extraInstructions = userPrompt ? `\n\nExtra user instructions: ${userPrompt}` : ''

  return `Operation: comment_edit_multi

You are editing an existing image based on instructions the user pinned on it.
Use normalized coordinates with the origin at the top-left of the image (0..1 on each axis).

In a single edit, apply all of these changes together: ${combined}.

Strict requirements:
- Apply each change near its given position and blend it naturally — match the existing lighting, perspective, color, scale, shadows, and style so it looks original.
- Keep everything else EXACTLY as the source image: subject, layout, background, other objects, text, colors, and quality. Do not move, recolor, restyle, crop, or redraw anything that was not requested.
- Do NOT add watermarks or any content the user did not ask for.${extraInstructions}`
}

function roundObject<T>(obj: T, decimals = 6): T {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'number') {
    return Number(obj.toFixed(decimals)) as unknown as T
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => roundObject(item, decimals)) as unknown as T
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = roundObject(value, decimals)
    }
    return result as T
  }
  return obj
}
