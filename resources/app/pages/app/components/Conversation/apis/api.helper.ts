import { getActiveChatSessionId } from '@/lib/media/activeChatSession'
import { cdpApiConfig, getCdpBackendUrl } from '@/config/cdp-api'
import { currentLanguage } from '@/i18n/language-state'
import { getHtmlLang } from '@/i18n/config'
import {
  buildCdpHeaders,
  clearCdpSession,
  CluegaUnauthorizedError,
} from '@/lib/ai-agent/cluega-session-auth'
import { redirectToLogin } from '@/lib/cdp/auth-redirect'
import { refreshCdpAccessToken } from '@/lib/cdp/session'
import { hasCdpSupportSession } from '@/lib/cdp/support-session'
import {
  isMediaRequestLogEnabled,
  recordMediaRequest,
} from '@/lib/media/requestLog'
import { displayableErrorMessage } from '@/lib/stores/media/session/jobStatus'

// All media-ai traffic now flows through the CDP gateway
// (frontend → CDP /api/v1/media/* → media-ai-service). The CDP backend
// validates the user JWT, derives tenant/user from its claims, and injects
// the server-side media API key — so the browser never talks to media-ai
// directly and no media-specific credentials live in the frontend.
const MEDIA_PREFIX = '/api/v1/media'
// Where media-ai's own generated/uploaded artifacts are served from, under the
// media mount. media-ai returns these as root-relative paths.
const ARTIFACTS_PREFIX = '/artifacts-output'

export function mediaBaseUrl() {
  return `${cdpApiConfig.baseUrl}${MEDIA_PREFIX}`
}

function mediaAssetBaseUrl() {
  return `${getCdpBackendUrl()}${MEDIA_PREFIX}`
}

export function mediaHeaders(accept: string) {
  // Reuse the shared CDP auth headers (Bearer token + X-Team-Id). Tenant is
  // derived server-side from the JWT, so we no longer send x-tenant-id.
  //
  // Accept-Language carries the UI locale for every user-facing progress string
  // media-ai streams back (phase titles, tool labels, reasoning lines). This is
  // the one funnel all media traffic passes through — job creation, polling,
  // uploads and the block-stream GETs — so setting it here covers the storyboard
  // and workflow-node paths that never took a `locale` argument. CDP forwards the
  // header upstream untouched.
  //
  // Sent as a real BCP-47 tag: our internal Vietnamese code is "vn", a country
  // code, which media-ai cannot resolve to a language.
  return buildCdpHeaders({
    Accept: accept,
    'Accept-Language': getHtmlLang(currentLanguage()),
  })
}

// Header names are case-insensitive on the wire but a plain object is not, and
// callers spell it both ways ('content-type' and 'Content-Type').
function hasContentType(headers: Record<string, string>) {
  return Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
}

// Auth-aware fetch for ALL media traffic (create job, poll status, upload,
// prompt-enhance). The raw `fetch` these calls used before attached the Bearer
// token via `mediaHeaders` but had NO 401 handling, so when the CDP access token
// expired mid-flow (image polls run ~2 min, video polls ~30 min) the request
// threw and the node errored — effectively kicking the user out.
//
// `mediaFetch` mirrors `cdpFetch` (lib/ai-agent/cluega-session-auth.ts): on a 401
// it refreshes the access token ONCE (via the singleton in lib/cdp/session — so
// concurrent 401s spend the rotating refresh token exactly once) and retries with
// the new token; only if the refresh itself fails (dead refresh token) does it
// clear the session and redirect to /login.
//
// Auth headers are rebuilt fresh on EVERY attempt (the retry must carry the new
// token), so callers pass only their EXTRA headers in `init.headers` — never
// `mediaHeaders(...)`. Bodies used here are JSON strings or `FormData` (both
// re-sendable), so the single retry is safe; SSE callers get a fresh, unconsumed
// `Response` to read `body` from.
//
// A STRING body without a `content-type` gets `application/json`. The browser
// otherwise labels a string body `text/plain`, which CDP forwards verbatim and
// FastAPI then refuses to parse as JSON — the request arrives as raw bytes and
// every field of the model reads as missing (a 422 that looks like a bad
// payload). `FormData`/`Blob` bodies are not strings, so multipart still passes
// no `content-type` and keeps the browser's boundary; a caller-supplied header
// always wins.
export async function mediaFetch(
  input: string,
  init: RequestInit = {},
  accept = 'application/json',
  allowRetry = true,
): Promise<Response> {
  const headers = {
    ...mediaHeaders(accept),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  }
  if (typeof init.body === 'string' && !hasContentType(headers)) {
    headers['content-type'] = 'application/json'
  }
  // Only the JSON calls are logged, and only while the studio's Debug tab has
  // switched the log on. The stream path must never be touched: it hands the
  // caller an unconsumed Response to read `body` from, and it stays open for
  // the length of a render.
  const logging = isMediaRequestLogEnabled() && accept === 'application/json'
  const startedAt = logging ? Date.now() : 0
  let res: Response
  try {
    res = await fetch(input, { ...init, headers })
  } catch (error) {
    // An abort is the caller changing its mind (a re-render, a cancelled poll),
    // not a failure worth a red line in the log.
    const aborted = error instanceof Error && error.name === 'AbortError'
    if (logging && !aborted) {
      recordMediaRequest({
        method: (init.method ?? 'GET').toUpperCase(),
        url: input,
        status: 0,
        durationMs: Date.now() - startedAt,
        transportError: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
  if (logging) {
    recordMediaRequest({
      method: (init.method ?? 'GET').toUpperCase(),
      url: input,
      status: res.status,
      durationMs: Date.now() - startedAt,
    })
  }

  if (res.status === 401 && allowRetry) {
    if (hasCdpSupportSession()) return res
    const refreshed = await refreshCdpAccessToken()
    if (refreshed) return mediaFetch(input, init, accept, false)
    // Token loss, not a sign-out (LF3b-11).
    clearCdpSession('expired')
    redirectToLogin()
    throw new CluegaUnauthorizedError()
  }

  return res
}

// Thrown when opening an SSE stream gets a non-2xx response. Carries the HTTP
// status so the reconnect loop can tell a rate limit (429 — back off until the
// window resets) from a plain transport drop (reconnect on the normal backoff),
// plus the limiter's X-RateLimit-Reset hint (epoch seconds) when present.
export class StreamOpenError extends Error {
  status: number
  // Epoch seconds when the rate-limit window resets (from X-RateLimit-Reset),
  // or undefined when the response carried no usable hint.
  rateLimitResetAt?: number

  constructor(message: string, status: number, rateLimitResetAt?: number) {
    super(message)
    this.name = 'StreamOpenError'
    this.status = status
    this.rateLimitResetAt = rateLimitResetAt
  }
}

// Read a failed response's body as a message that is safe to put in front of a
// user. Every non-2xx on this path becomes an Error whose message is rendered
// as the turn's failure text, so the body of whatever hop actually failed —
// including a CDN's own error page — would otherwise be shown verbatim.
export async function upstreamErrorMessage(response: Response): Promise<string> {
  let body = ''
  try {
    body = await response.text()
  } catch {
    body = ''
  }
  return displayableErrorMessage(body, response.status)
}

// Build a StreamOpenError from a failed stream-open Response, consuming its body
// for the message. Shared by the image and video block-stream openers.
export async function streamOpenError(response: Response): Promise<StreamOpenError> {
  const reset = Number(response.headers.get('X-RateLimit-Reset'))
  return new StreamOpenError(
    await upstreamErrorMessage(response),
    response.status,
    Number.isFinite(reset) && reset > 0 ? reset : undefined,
  )
}

// Classify an error thrown while POLLING a job's status. A poll loop calls
// `fetchJobStatus` (→ mediaFetch) once per tick over a long budget (video ~30 min),
// so the access token can expire mid-loop. mediaFetch heals a single 401, but a
// residual 401 (retried request still 401s during a refresh race across
// concurrently-polling nodes) or a transient network blip surfaces as a thrown
// error. Those are RECOVERABLE — the next tick rebuilds auth headers from the freshly
// refreshed token and succeeds — so the loop should wait and re-poll rather than die.
//
// Only two conditions are genuinely fatal: an abort (unmount / superseded run must
// stop immediately), and a dead session (`CluegaUnauthorizedError` — mediaFetch
// already cleared the session and redirected to /login, so there is nothing left to
// poll for).
export function isFatalPollError(err: unknown): boolean {
  if (err instanceof CluegaUnauthorizedError) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return false
}

export function resolveMediaUrl(value: string) {
  if (value.startsWith('http://') || value.startsWith('https://')) return value

  try {
    // An artifact path is root-relative ("/artifacts-output/x.png") but lives
    // UNDER the media mount, and `new URL` would resolve a leading slash against
    // the origin — dropping /api/v1/media and 404ing. Other root-relative values
    // (e.g. CDP's own /media/by-id/...) really are origin-relative, so only the
    // artifact prefix is re-rooted.
    const relative = value.startsWith(`${ARTIFACTS_PREFIX}/`)
      ? value.slice(1)
      : value
    return new URL(relative, `${mediaAssetBaseUrl()}/`).toString()
  } catch {
    return value
  }
}

// Inverse of `artifactUrl` for the common case: turn a resolved artifact URL
// back into the `output_ref` the backend issued (the filename under
// /artifacts-output/). The media job's image-edit tool resolves an input image
// by this ref, NOT by a fully-qualified URL — passing the URL fails with
// "cannot resolve input image '<url>'". Non-artifact values pass through.
export function mediaUrlToRef(value: string) {
  if (!value) return value
  let path = value
  const base = mediaAssetBaseUrl()
  if (path.startsWith(`${base}/`)) {
    path = path.slice(base.length + 1)
  } else {
    const match = /^https?:\/\/[^/]+\/(.*)$/.exec(path)
    if (match) {
      // Only reduce foreign URLs that actually point at the artifacts-output
      // mount. Anything else — e.g. the CDP `/media/artifact-files/...`
      // storage proxy a generated video resolves to — must stay an absolute
      // URL: the backend resolves those by URL, and the origin-stripped
      // relative path only ever worked by accident.
      const candidate = match[1].split('?')[0] ?? match[1]
      if (!/^(?:api\/v1\/media\/)?artifacts-output\//.test(candidate)) {
        return value
      }
      path = match[1]
    }
  }
  // Strip a query string if any.
  path = path.split('?')[0] ?? path
  // Drop the artifacts-output mount segment → the bare ref (filename). Only
  // strip when it leads the path (optionally nested under the CDP media
  // prefix, …/api/v1/media/artifacts-output/<file>); other values pass
  // through unchanged.
  return path.replace(/^(?:api\/v1\/media\/)?artifacts-output\//, '')
}

export function artifactUrl(toolId: string | undefined, outputRef: string) {
  if (outputRef.startsWith('http://') || outputRef.startsWith('https://') || outputRef.startsWith('/')) {
    return resolveMediaUrl(outputRef)
  }

  const filename = outputRef.includes('.')
    ? outputRef
    : toolId
      ? `${toolId}-${outputRef}.png`
      : `${outputRef}.png`

  return resolveMediaUrl(`/artifacts-output/${filename}`)
}

// A chat session id in a URL path segment. Sessions are UUIDs server-side (the
// backend parses them as one before it will open a conversation), so anything
// else in that position — `workflow`, `knowledge-base`, the `video-*` / `image-*`
// prefixed ids the media studio mints locally — is not one.
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The conversation the user is currently in, or "" when they are not in one.
 *
 * Read from the URL rather than threaded through the callers: a generation is
 * kicked off several layers below the page (composer → stream driver → job
 * request), none of which carry the session today, and the route segment IS the
 * session — `/app/<sessionId>` is what the app navigates to and what the source
 * badge links back to. Threading it would mean widening four signatures to move
 * a value the browser already has.
 *
 * It is sent to media-ai, which forwards it to the backend as the artifact's
 * `conversation_id`, so a file generated in a chat can be traced back to that
 * chat. Empty is a normal answer — the workflow editor, the media studio, and a
 * brand-new chat that has not been given an id yet — and simply means the asset
 * gets its badge without a jump target.
 */
export function currentChatSessionId(): string {
  const fromUrl = chatSessionIdFromUrl()
  if (fromUrl) return fromUrl
  // The first turn of a new conversation submits from `/app`: the id exists (the
  // store has it back from POST /api/v1/sessions) but the route has not caught up
  // when the driver creates the job. Without this the opening generation of every
  // new chat reached the library with no conversation to jump back to.
  const bound = getActiveChatSessionId()
  return SESSION_ID_PATTERN.test(bound) ? bound : ''
}

/**
 * The conversation in the ADDRESS BAR, and only that. "" anywhere else.
 *
 * The stricter half of currentChatSessionId, for the one caller whose answer is
 * PERSISTED and therefore cannot be corrected later: POST /video-projects stores
 * the id on the storyboard project, and every phase of that project (plan, render,
 * stitch, scene edit) reads it back from there.
 *
 * Why the in-memory fallback is deliberately not consulted: it is bound when a
 * chat is opened and never cleared (nothing calls clearActiveChatSessionId), so on
 * a surface that is not a chat it still holds whichever conversation was last
 * open. A /jobs request survives that — its body field is re-bound per job by
 * media-ai, and a workflow job sends an empty one — but a value written onto a
 * stored project stays wrong for the life of the project. A missing origin is a
 * visible gap; a wrong one is a lie nobody notices.
 */
export function chatSessionIdFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const [surface, candidate] = window.location.pathname.split('/').filter(Boolean)
  if (surface === 'app' && candidate && SESSION_ID_PATTERN.test(candidate)) {
    return candidate
  }
  return ''
}
