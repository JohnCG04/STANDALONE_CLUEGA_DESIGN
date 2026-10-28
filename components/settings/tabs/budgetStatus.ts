/** Ad-spend budget status, as returned by CDP `GET /api/v1/budget/status`.
 *
 *  Amounts are decimal STRINGS denominated in `currency`. They are never USD by
 *  assumption — a Cluega advertiser may bill in THB, VND, SGD and others — and
 *  they must never be coerced through `Number` on the way to the screen: the
 *  boundary Core enforces is an exact decimal, and a number that differs from
 *  it, however slightly, is worse than an ugly one. */
export type BudgetScope = {
  scope: "tenant" | "advertiser";
  advertiser_id?: string;
  currency: string;
  period_start: string;
  period_end: string;
  budget_amount: string;
  spent_amount: string;
  remaining_amount: string;
  hard_stop: boolean;
  allowed: boolean;
};

export type BannerState = "blocked" | "warning" | "none";

/** The fraction of a budget at which the customer is warned. Matches Core's
 *  `thresholdRatio`; if one moves, move both. */
const WARN_AT_PERCENT = 80;

/** Converts a decimal string to whole minor units (cents).
 *
 *  Amounts arrive with at most 2 decimal places (Core stores `NUMERIC(18,2)`),
 *  so scaling by 100 is lossless and keeps every comparison in integers. */
export function toMinorUnits(amount: string): number {
  const trimmed = amount.trim();
  if (trimmed === "") return 0;
  const negative = trimmed.startsWith("-");
  const [whole = "0", frac = ""] = trimmed.replace(/^[-+]/, "").split(".");
  const value = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -value : value;
}

/** True once spend has reached WARN_AT_PERCENT of the budget.
 *
 *  Compared in integer minor units rather than as `Number(spent) >=
 *  Number(budget) * 0.8`: floating point can disagree with Core's exact decimal
 *  right at the edge, which would either warn about a scope Core considers
 *  fine, or stay quiet about one it does not. Cross-multiplying keeps it in
 *  integers so there is no rounding step at all. */
function isNearCap(s: BudgetScope): boolean {
  const budget = toMinorUnits(s.budget_amount);
  // A zero or negative cap is blocked, never "approaching" — and this also
  // keeps the comparison meaningful rather than trivially true.
  if (budget <= 0) return false;
  return toMinorUnits(s.spent_amount) * 100 >= budget * WARN_AT_PERCENT;
}

/** Which banner the billing tab should show.
 *
 *  `blocked` outranks `warning`: a tenant can be approaching the cap on one
 *  advertiser while already stopped on another, and the state that has actually
 *  halted their spend is the one they need to see first.
 *
 *  Only a `hard_stop` scope can produce either banner. An advisory scope is
 *  reported but never denies, so showing "blocked" for one would tell the
 *  customer their spend had stopped when it has not. */
export function bannerStateFor(scopes: BudgetScope[]): BannerState {
  if (scopes.some((s) => s.hard_stop && !s.allowed)) return "blocked";
  if (scopes.some((s) => s.hard_stop && s.allowed && isNearCap(s))) return "warning";
  return "none";
}

/** Renders an amount beside its currency code.
 *
 *  Never a `$`: these amounts are denominated in the advertiser's own currency.
 *  The string is passed through untouched — Core's decimal already dropped any
 *  trailing zeros, so "500.00" arrives as "500", and reformatting it risks
 *  displaying a number that differs from the one the boundary enforced. */
export function formatAmount(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/** The scopes that are currently stopping spend, for the blocked banner's copy. */
export function blockedScopes(scopes: BudgetScope[]): BudgetScope[] {
  return scopes.filter((s) => s.hard_stop && !s.allowed);
}
