/**
 * When a CDP read is worth simply asking again.
 *
 * Its own module, with no app-path imports, so the policy can be unit-tested
 * without dragging the whole fetch client (and its `@/config/*` aliases) in.
 */

// A cold origin behind Cloudflare answers the first request of a session with a
// 502 and serves the second one fine — QA round 7 watched the ads lane die on
// "Couldn't load ad objectives · request_failed_502" twice, and go through on a
// hand-clicked Retry. A gateway error on a READ is not an answer, so the client
// asks again instead of handing the user a dead end.
const RETRYABLE_GATEWAY_STATUS = new Set([502, 503, 504]);
const MAX_GATEWAY_RETRIES = 2;

// A retry budget on top of the per-request cap.
//
// The per-request cap bounds one user's one read. It does nothing about the
// case it was never meant for: the origin is not cold, it is overloaded, and
// every read in the app is failing at once. Each of them then retries twice
// and the client triples the load on a backend already past what it can
// serve — the retry becomes the outage. Worse against this origin than in
// general, because its 502s are usually a query that ran long enough to have
// its connection torn out from under it, so every retry re-runs the expensive
// thing that caused the 502.
//
// A token bucket makes retries a shared, bounded resource: plentiful while
// failures are isolated, spent long before a broad failure can be amplified.
// Same mechanism, and the same reason, as the retry budget the AWS SDK adopted.
const RETRY_BUDGET_TOKENS = 10;
const RETRY_BUDGET_REFILL_PER_SECOND = 1;

let retryTokens = RETRY_BUDGET_TOKENS;
let lastRefillMs = 0;

function takeRetryToken(nowMs: number): boolean {
  if (lastRefillMs === 0) lastRefillMs = nowMs;
  const elapsedSeconds = Math.max(0, (nowMs - lastRefillMs) / 1000);
  if (elapsedSeconds > 0) {
    retryTokens = Math.min(
      RETRY_BUDGET_TOKENS,
      retryTokens + elapsedSeconds * RETRY_BUDGET_REFILL_PER_SECOND,
    );
    lastRefillMs = nowMs;
  }
  if (retryTokens < 1) return false;
  retryTokens -= 1;
  return true;
}

/** Test seam: restore a full budget between cases. */
export function __resetGatewayRetryBudget(): void {
  retryTokens = RETRY_BUDGET_TOKENS;
  lastRefillMs = 0;
}

/** Whether a failed request should simply be asked again. */
export function shouldRetryGateway(
  status: number,
  method: string | undefined,
  attempt: number,
  nowMs: number = Date.now(),
): boolean {
  // GET/HEAD only: a retried POST can create a second campaign, a second job or
  // a second charge. Everything non-idempotent stays a single shot.
  const verb = (method ?? "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;
  if (attempt >= MAX_GATEWAY_RETRIES) return false;
  if (!RETRYABLE_GATEWAY_STATUS.has(status)) return false;
  // Budget spent last, so only an otherwise-retryable request costs a token.
  return takeRetryToken(nowMs);
}

/** Backoff before retry `attempt` (0-based), jittered so a reload of twenty
 *  tiles does not re-hit a waking origin in one synchronised wave. */
export function gatewayRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = 250 * 2 ** attempt;
  return Math.round(base + random() * base);
}

