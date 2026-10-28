// Transient-failure retry for the template-library reads.
//
// The template catalog is four proxy hops away from the browser — Next.js route
// handler → CDP gateway → Cloudflare → media-ai — and NOTHING on that path
// retries: `mediaFetch` re-sends only on 401, and the modal's own Retry button
// is a human. media-ai's list handler does no I/O at all (its registry is frozen
// at import time), so a failure here is never "the catalog is slow": it is a
// cold or dropped connection on a hop, reported as a 502/503/504. The user saw
// it as "templates list failed: 502 on first open, fine after clicking Retry" —
// which is exactly what a connection pool looks like before and after it warms.
//
// Scoped to this client rather than added to `mediaFetch` on purpose: a blanket
// retry would also re-send job creates and chat turns, where a second attempt
// after an ambiguous failure can bill twice. Template reads are pure GETs.

/** Statuses worth a second attempt: a hop failed, the request never ran. */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** Backoff before attempt 2 and attempt 3. Short enough that the dialog still
 *  feels like it is loading rather than hanging. */
const RETRY_DELAYS_MS = [400, 1200];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Run `attempt` up to `RETRY_DELAYS_MS.length + 1` times, retrying only when the
 * response carries a gateway status or the fetch itself threw.
 *
 * A 4xx is returned as-is: it is an answer, not a failed delivery. An aborted
 * signal ends the ladder immediately — the caller has moved on.
 */
export async function fetchWithGatewayRetry(
  attempt: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i += 1) {
    if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1], signal);
    try {
      const res = await attempt();
      if (!RETRYABLE_STATUS.has(res.status) || i === RETRY_DELAYS_MS.length) {
        return res;
      }
      // Drain the body of the response being discarded so the socket can be
      // reused for the retry instead of being torn down.
      await res.text().catch(() => undefined);
      lastError = new Error(`gateway status ${res.status}`);
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw err;
      if (i === RETRY_DELAYS_MS.length) throw err;
      lastError = err;
    }
  }
  // Unreachable: the final iteration either returns or throws.
  throw lastError instanceof Error ? lastError : new Error("templates unreachable");
}
