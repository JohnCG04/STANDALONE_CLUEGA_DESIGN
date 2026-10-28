// Read the finished video url off a job by POLLING its status snapshot.
//
// The poll-based twin of `fetchJobVideoUrlFromBlocks` (blockVideoUrl.ts): instead
// of subscribing to the GET /jobs/{id}/stream/blocks SSE stream and parsing frames,
// it re-reads GET /jobs/{id} on a fixed interval until the job reaches a terminal
// state. Video runs on the SAME media-ai-service as image, so the status snapshot
// carries the finished artifact in `result.output_urls` exactly like an image job —
// the only difference from `pollJobImageUrls` is the far larger poll budget (video
// averages ~270s and can run up to ~900s) and resolving the url as video-relative.
//
// Used by hosts that only need the finished video and prefer a simple request loop
// over a long-lived, reconnecting stream (e.g. the workflow VideoNode).

import { isFatalPollError } from '../api.helper'
import { fetchJobStatus } from '../apis'
import { outputUrlsFromResult } from '../fetch.api'
import { resolveVideoUrl } from '../video.helper'
import { delay } from "@/lib/delay"
import { waitForPollSlot } from './jobPollPacer'
import { isStoppedJobStatus, stoppedJobUrls } from './pollJobImageUrl'

// A brief token-expiry window costs 1–2 failing ticks before the refreshed token
// lands; give up only after this many CONSECUTIVE hard errors so a genuinely broken
// endpoint fails fast instead of polling the full budget in vain.
const MAX_CONSECUTIVE_ERRORS = 5

// Abortable delay used between polls (rejects on abort so a superseded run / unmount
// stops the loop immediately).

/** A finished video job: its first url, and whatever the render said about it. */
export interface JobVideoResult {
  url: string | null
  /**
   * Translated one-liners from `result.notices` — the render reporting how the
   * delivery differs from the ask ("4K is not available … rendered at the
   * model's default instead"). The job SUCCEEDED; these are not errors, and the
   * caller shows them verbatim.
   */
  notices: string[]
}

/**
 * Poll a job's status (GET /jobs/{id}) until it finishes, then resolve the FIRST
 * video url from its result, with whatever the render said about the delivery.
 * `url` is `null` when the job succeeds without producing any, or when the poll
 * budget is exhausted while it is still running. Throws when the job reports
 * `failed`, on abort, and `JobStoppedError` for a stop that kept nothing (a stop
 * that kept its clip delivers it).
 */
export async function pollJobVideoResult(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobVideoResult> {
  // Poll every 8s so the node updates without hammering the gateway (halved
  // from 4s to reduce sustained load on the CDP gateway's per-user "media"
  // rate-limit bucket, shared with every other media action). The 30-minute
  // wall-clock budget below is unaffected — fewer polls fit in the same window;
  // the provider averages ~270s and can run up to ~900s, and a queued job may
  // wait before it starts.
  const POLL_INTERVAL_MS = 8_000
  const POLL_BUDGET_MS = 30 * 60_000
  const startedAt = Date.now()
  let consecutiveErrors = 0

  while (true) {
    // Global pacing on top of the 8s cadence: concurrent jobs (image or video)
    // interleave their reads instead of bursting the gateway on one tick.
    await waitForPollSlot(signal)
    let job: Awaited<ReturnType<typeof fetchJobStatus>>
    try {
      job = await fetchJobStatus(jobId, signal)
      consecutiveErrors = 0
    } catch (err) {
      // Abort or a dead session is terminal; a transient auth/network error is not —
      // wait and re-poll (the next tick carries the refreshed token) while budget remains.
      if (isFatalPollError(err) || ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw err
      if (Date.now() - startedAt > POLL_BUDGET_MS) return { url: null, notices: [] }
      await delay(POLL_INTERVAL_MS, signal)
      continue
    }
    const status = job.status ?? ''

    if (status === 'succeeded') {
      // `outputUrlsFromResult` resolves urls with the media base; video shares that
      // base, but pass each through `resolveVideoUrl` so an already-absolute url is
      // preserved and a relative one resolves against the video base explicitly.
      const urls = job.result ? outputUrlsFromResult(job.result).map(resolveVideoUrl) : []
      return { url: urls[0] ?? null, notices: noticesOf(job.result) }
    }

    if (status === 'failed') {
      throw new Error(job.error || 'Video generation job failed.')
    }

    if (isStoppedJobStatus(status)) {
      return { url: stoppedJobUrls(jobId, job).map(resolveVideoUrl)[0] ?? null, notices: [] }
    }

    // Still `queued` / `running` (or an unknown non-terminal status) — wait and
    // re-poll while budget remains.
    if (Date.now() - startedAt > POLL_BUDGET_MS) return { url: null, notices: [] }
    await delay(POLL_INTERVAL_MS, signal)
  }
}

/** media-ai's `result.notices`, tolerating a result shaped otherwise. */
function noticesOf(result: unknown): string[] {
  const raw = (result as { notices?: unknown } | null)?.notices
  return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string' && !!n) : []
}

/**
 * Poll a job's status until it finishes, then resolve the FIRST video url.
 * The url-only face of `pollJobVideoResult`, kept for callers that show no
 * delivery notes. Returns `null`, throws and budgets exactly as it does.
 */
export async function pollJobVideoUrl(jobId: string, signal?: AbortSignal): Promise<string | null> {
  return (await pollJobVideoResult(jobId, signal)).url
}
