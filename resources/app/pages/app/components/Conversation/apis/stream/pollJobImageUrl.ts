
import { isFatalPollError } from '../api.helper'
import { fetchJobStatus } from '../apis'
import { outputUrlsFromResult } from '../fetch.api'
import type { MediaJobResult, MediaJobStatusResponse } from '../types'
import { delay } from "@/lib/delay"
import { waitForPollSlot } from './jobPollPacer'

// A brief token-expiry window costs 1–2 failing ticks before the refreshed token
// lands; give up only after this many CONSECUTIVE hard errors so a genuinely broken
// endpoint fails fast instead of polling the full budget in vain.
const MAX_CONSECUTIVE_ERRORS = 5

/**
 * The budget ran out while the job was STILL RUNNING — distinct from a job that
 * succeeded with no artifact. Callers name the feature and soften the wording;
 * `LogoCompositing`'s best-effort matte just swallows it.
 */
export class JobPollTimeoutError extends Error {
  readonly jobId: string
  readonly budgetMs: number

  constructor(jobId: string, budgetMs: number) {
    super(`Image job ${jobId} is still running after ${Math.round(budgetMs / 60_000)} minutes.`)
    this.name = 'JobPollTimeoutError'
    this.jobId = jobId
    this.budgetMs = budgetMs
  }
}

/**
 * The job was STOPPED and left nothing to deliver — cancelled with
 * `discard_outputs`, or stopped before its first output. Named `AbortError` on
 * purpose: the workflow editor settles a node that rejects with one as stopped,
 * never as failed.
 */
export class JobStoppedError extends Error {
  readonly jobId: string

  constructor(jobId: string) {
    super(`Job ${jobId} was stopped.`)
    this.name = 'AbortError'
    this.jobId = jobId
  }
}

/** One terminal state, spelled three ways across media-ai's surfaces. */
export function isStoppedJobStatus(status: string | null | undefined): boolean {
  const value = (status ?? '').trim().toLowerCase()
  return value === 'stopped' || value === 'cancelled' || value === 'canceled'
}

/**
 * What a stopped job kept. A stop that kept its outputs (the reaper, a cancel
 * without discard) delivers them like a success; a discarded stop, or one that
 * beat the first output, throws {@link JobStoppedError}. Until this existed a
 * stopped job was simply not terminal here, and its poll spun out the budget.
 */
export function stoppedJobUrls(jobId: string, job: MediaJobStatusResponse): string[] {
  const urls = !job.discarded && job.result ? outputUrlsFromResult(job.result) : []
  if (urls.length === 0) throw new JobStoppedError(jobId)
  return urls
}

// Abortable delay used between polls (rejects on abort so a superseded run / unmount
// stops the loop immediately).

/** What a finished job produced, and what it said about it. */
export type JobImageResult = {
  urls: string[]
  /**
   * Why there are fewer pictures than asked for, or none — verbatim from the
   * service, empty when it said nothing. The urls being empty is not itself a
   * reason, and a caller that throws on `[]` without this is throwing away the
   * only sentence the user could act on.
   */
  reason: string
  /** The job's whole result, for callers that read more than the pictures (Split Layers). */
  result: MediaJobResult | null
}

/** The reason a finished job carries, in decreasing order of how specific it is.
 *
 * Exported so it can be asserted without polling: the loop below takes a
 * global pacing slot on every read, which costs six seconds a call in a test
 * that only wants to know which field wins.
 */
export function reasonFromResult(result: MediaJobResult | null | undefined): string {
  if (!result) return ''
  const candidates = [
    result.awaiting?.reason,
    result.fidelity_release?.reason,
    result.fidelity?.feedback,
  ]
  for (const candidate of candidates) {
    const text = (candidate ?? '').trim()
    if (text) return text
  }
  return ''
}

/**
 * Poll a job's status (GET /jobs/{id}) until it finishes, then resolve ALL image
 * urls from its result. With `n > 1` (batch generation) the job's
 * `result.output_urls` holds every variant, so this returns the full list.
 * Returns `[]` ONLY when the job succeeds without producing any url. Throws when
 * the job reports `failed`, on abort, `JobStoppedError` for a stop with nothing
 * kept, and `JobPollTimeoutError` when the budget runs out while the job is
 * still running.
 */
export async function pollJobImageUrls(jobId: string, signal?: AbortSignal): Promise<string[]> {
  return (await pollJobImageResult(jobId, signal)).urls
}

/**
 * As `pollJobImageUrls`, and keeps the reason a finished job stated.
 *
 * Split out because the plural form's `string[]` discards the rest of
 * `result`, and a job that finishes with no pictures always says why — it was
 * off-reference, or it stopped and is waiting on something. Dropping that left
 * the canvas showing "Something went wrong. Please try again." for a job that
 * reported success, 100%, and a reason.
 */
export async function pollJobImageResult(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobImageResult> {
  // 5 minutes of polling, matching Face Swap: a queued job can wait minutes before it
  // starts, and the old 2-minute budget expired on healthy runs — which callers then
  // reported as "finished without an image url". Poll every 6s at most — and see the
  // shared pacer below, which stretches the cadence further whenever other jobs are
  // polling concurrently, so N jobs never burst the gateway into a 429.
  const POLL_INTERVAL_MS = 6_000
  const POLL_BUDGET_MS = 300_000
  const startedAt = Date.now()
  let consecutiveErrors = 0

  while (true) {
    // Take a global slot before every read — including the first — so
    // simultaneous jobs interleave instead of firing on the same tick.
    await waitForPollSlot(signal)
    let job: Awaited<ReturnType<typeof fetchJobStatus>>
    try {
      job = await fetchJobStatus(jobId, signal)
      consecutiveErrors = 0
    } catch (err) {
      // Abort or a dead session is terminal; a transient auth/network error is not —
      // wait and re-poll (the next tick carries the refreshed token) while budget remains.
      if (isFatalPollError(err) || ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw err
      if (Date.now() - startedAt > POLL_BUDGET_MS) throw new JobPollTimeoutError(jobId, POLL_BUDGET_MS)
      await delay(POLL_INTERVAL_MS, signal)
      continue
    }
    const status = job.status ?? ''

    if (status === 'succeeded') {
      return {
        urls: job.result ? outputUrlsFromResult(job.result) : [],
        reason: reasonFromResult(job.result),
        result: job.result ?? null,
      }
    }

    if (status === 'failed') {
      throw new Error(job.error || 'Image generation job failed.')
    }

    if (isStoppedJobStatus(status)) {
      return { urls: stoppedJobUrls(jobId, job), reason: reasonFromResult(job.result), result: job.result ?? null }
    }

    // Still `queued` / `running` (or an unknown non-terminal status) — wait and
    // re-poll while budget remains.
    if (Date.now() - startedAt > POLL_BUDGET_MS) throw new JobPollTimeoutError(jobId, POLL_BUDGET_MS)
    await delay(POLL_INTERVAL_MS, signal)
  }
}

/**
 * Single-url convenience wrapper over `pollJobImageUrls` — resolves the FIRST
 * image url (or `null`). Kept for callers that only render one image per node.
 * Propagates `JobPollTimeoutError` like the plural form does.
 */
export async function pollJobImageUrl(jobId: string, signal?: AbortSignal): Promise<string | null> {
  const urls = await pollJobImageUrls(jobId, signal)
  return urls[0] ?? null
}
