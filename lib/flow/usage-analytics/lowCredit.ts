/**
 * When the Usage Analytics page shows its "credits running low" banner (US-06).
 *
 * Only a PERCENT state can be low: a raw token balance has no denominator, so
 * "low" is unknowable, and an unknown state must never nag — the same rule as
 * the credits pill, which renders a dash for unknown rather than "0%".
 */

import type { CreditsRemaining } from "@/lib/flow/creditsRemaining";

/** The PRD's proposed threshold: below 10% of the period's total. */
export const LOW_CREDIT_THRESHOLD_PERCENT = 10;

export function isLowCredit(remaining: CreditsRemaining): boolean {
  return (
    remaining?.kind === "percent" &&
    remaining.percent < LOW_CREDIT_THRESHOLD_PERCENT
  );
}
