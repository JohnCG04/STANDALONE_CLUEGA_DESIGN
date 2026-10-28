/**
 * What the Flow sidebar's credits pill shows.
 *
 * The design says "100% Left", which needs a numerator AND a denominator. The
 * only pair the platform exposes is the plan's `creditsAvailable` /
 * `creditsTotal` (BillingSummary.plan, module AI). A tenant without a billing
 * account has no plan at all — the summary endpoint answers 404 and the client
 * deliberately maps that to `plan: null` — and the wallet balance is a plain
 * number with nothing to divide it by. So the pill has three honest states:
 *
 *   percent  — a plan with a total: "N% Left"
 *   tokens   — no plan, but a wallet: the raw balance
 *   null     — neither known: a dash, never "0%" (null means unknown, not zero;
 *              see how the settings tabs render "—" for a failed wallet read)
 *
 * Pure functions so the arithmetic and the fallback order are testable without
 * React or the network.
 */

export type CreditsRemaining =
  | { kind: "percent"; percent: number }
  | { kind: "tokens"; tokens: number }
  | null;

/** The slice of BillingSummary.plan this module reads. */
export type CreditsQuota = {
  creditsAvailable: number | null;
  creditsTotal: number | null;
};

/**
 * `available / total` as a whole percentage, clamped to 0..100.
 *
 * Null when either figure is unknown or the total is not a positive finite
 * number — a zero or negative total has no meaningful "percent left", and NaN
 * must never reach the DOM as "NaN% Left".
 */
export function percentLeft(
  available: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (available == null || total == null) return null;
  if (!Number.isFinite(available) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;
  const percent = Math.round((available / total) * 100);
  return Math.min(100, Math.max(0, percent));
}

/**
 * Fold the two possible sources into one display state, plan first.
 *
 * The plan wins when it can produce a percentage; otherwise the wallet balance
 * stands in; otherwise unknown. A plan whose total is null (a package without a
 * fixed allowance) falls through to the wallet rather than showing nothing.
 */
export function resolveCreditsRemaining(
  plan: CreditsQuota | null | undefined,
  tokenBalance: number | null | undefined,
): CreditsRemaining {
  const percent = percentLeft(plan?.creditsAvailable, plan?.creditsTotal);
  if (percent !== null) return { kind: "percent", percent };
  if (tokenBalance != null && Number.isFinite(tokenBalance)) {
    return { kind: "tokens", tokens: Math.max(0, Math.round(tokenBalance)) };
  }
  return null;
}
