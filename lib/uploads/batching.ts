/**
 * How several file uploads are paced.
 *
 * The composer accepts up to a tab's whole material budget in one pick (9
 * product images), and every one of them used to leave as its own `fetch` fired
 * from a bare `Promise.all` — unbounded parallelism, no retry. On a phone
 * connection that is 9 multipart bodies competing for the same uplink, and one
 * transient 502 permanently marked its row failed while its siblings landed.
 *
 * These helpers are pure and take no store, so they are unit-testable and can be
 * shared by the batch path (chunks, sequential) and the per-file fallback.
 */

import { UploadRejectedError } from "./limits";
import { sleep } from "@/lib/utils";

/** How many single-file uploads run at once when the batch endpoint is not in
 *  play. 3 keeps a phone uplink usable while still overlapping latency. */
export const UPLOAD_FALLBACK_CONCURRENCY = 3;

/** Attempts in total, not retries after the first: 2 means one retry. */
export const UPLOAD_RETRY_ATTEMPTS = 2;
export const UPLOAD_RETRY_BACKOFF_MS = 500;

/**
 * Whether to send one multipart request per chunk instead of one per file.
 *
 * On unless explicitly disabled, and paired with a runtime latch (see
 * `markBatchUnsupported`): the gateway's own `STORAGE_GATEWAY_BATCH_UPLOAD` may
 * be off, and a failed feature detection costs a whole wasted body — so the
 * latch is what makes defaulting ON safe. It flips once, on the first gateway
 * refusal, and every later pick in that session takes the per-file path.
 *
 * It defaulted OFF while the composer only held ten files, where one request per
 * file at concurrency 3 is four round-trips. At the server's real cap of fifty it
 * is seventeen, each paying full handshake and auth, and the per-file path is the
 * reason a batch of screenshots feels broken rather than slow.
 */
export const UPLOAD_BATCH_ENABLED: boolean =
  process.env.NEXT_PUBLIC_UPLOAD_BATCH_ENABLED !== "false";

/** Files per request. */
export const UPLOAD_BATCH_MAX_FILES = 5;

/**
 * Bytes per request. Must stay at or under the gateway's and the edge's own body
 * limits: nine files at the 25 MiB per-file ceiling is 225 MiB in one body, which
 * is not survivable on a phone connection even where the server would allow it.
 */
export const UPLOAD_BATCH_MAX_BYTES = 52_428_800; // 50 MiB

/**
 * Pack files into requests, greedily and in pick order.
 *
 * Order is preserved across chunks so the flattened results stay index-aligned
 * with the input. A single file over the byte budget gets a chunk of its own
 * rather than being dropped — it already passed `preflightUpload`, so it is
 * within the per-file limit and the budget here is about one request's size.
 */
export function chunkByBudget(
  files: readonly File[],
  limits?: { maxFiles?: number; maxBytes?: number },
): File[][] {
  const maxFiles = Math.max(1, limits?.maxFiles ?? UPLOAD_BATCH_MAX_FILES);
  const maxBytes = Math.max(1, limits?.maxBytes ?? UPLOAD_BATCH_MAX_BYTES);
  const chunks: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const file of files) {
    const wouldExceed =
      current.length >= maxFiles || (current.length > 0 && currentBytes + file.size > maxBytes);
    if (wouldExceed) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Statuses worth trying again.
 *
 * 4xx that describe the FILE (413 too large, 415 wrong type) or the CALLER (400,
 * 401, 403, 422) will fail identically forever, and `mapUploadFailure` already
 * turns each into a sentence the user can act on — retrying only delays that
 * sentence. 401 in particular must not be retried here: `mediaFetch` already
 * refreshes the token and replays the request once, so a 401 reaching us means
 * the refresh itself failed.
 *
 * Everything else — a network error with no status at all, 429, and 5xx — is the
 * transport or the far side having a bad moment.
 */
export function isRetryableUploadFailure(error: unknown): boolean {
  const status =
    error instanceof UploadRejectedError ? error.status : statusFromUnknown(error);
  // No status: a TypeError from fetch (DNS, offline, connection reset). Worth one
  // more try. A pre-flight rejection also has no status, but it is thrown before
  // any request and never reaches a retry wrapper.
  if (status === undefined) return !(error instanceof UploadRejectedError);
  if (status === 429) return true;
  return status >= 500;
}

function statusFromUnknown(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Run `work` again once if it fails retryably.
 *
 * The delay is fixed rather than exponential: with 2 attempts there is only one
 * wait, and a backoff curve with a single point is just a number.
 */
export async function withRetry<T>(
  work: () => Promise<T>,
  options?: { attempts?: number; backoffMs?: number },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? UPLOAD_RETRY_ATTEMPTS);
  const backoffMs = options?.backoffMs ?? UPLOAD_RETRY_BACKOFF_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableUploadFailure(error)) throw error;
      if (backoffMs > 0) await sleep(backoffMs);
    }
  }
  throw lastError;
}

/** One item's outcome. Settled, never thrown: a batch reports per-row. */
export type SettledResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

/**
 * Run `worker` over every item with at most `limit` in flight, and return the
 * outcomes **in input order**.
 *
 * Index alignment is the whole point: the caller holds one optimistic row per
 * item and has no other key to reconcile by (file names collide). So this
 * settles every item rather than rejecting on the first failure, and never
 * reorders by completion.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<SettledResult<R>[]> {
  const results = new Array<SettledResult<R>>(items.length);
  if (items.length === 0) return results;
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: width }, run));
  return results;
}
