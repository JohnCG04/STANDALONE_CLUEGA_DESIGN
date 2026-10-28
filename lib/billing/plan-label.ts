/** The subset of the billing summary's plan this label needs. Declared locally
 * rather than importing CdpPlanSummary so the helper stays testable without the
 * shared billing client and its fetch layer. */
export type LabelledPlan = {
  /** All three are nullable because `CdpPlanSummary`'s are, and this helper is
   *  handed that summary directly: `/api/v1/billing/summary` reports a null for
   *  every field a tenant on no plan has no answer for. Declared as bare
   *  strings, the panel did not compile at all. */
  planCode: string | null;
  packageName: string | null;
  subscriptionStatus: string | null;
};

/** Statuses where the tenant no longer holds the plan. Naming the old plan for
 * these would tell the customer they still have something they do not.
 * `trialing` and `past_due` are deliberately absent: those are still the plan
 * the customer is on, and `past_due` already carries its own dunning banner
 * directly above this heading. */
const ENDED = new Set(["canceled", "cancelled", "expired", "incomplete_expired", "unpaid"]);

/** Names the plan shown in the billing panel's heading.
 *
 * The panel used to print the free-plan label unconditionally while
 * `/api/v1/billing/summary` was already returning the real plan, so a tenant on
 * a paid plan was told they were on the free one. */
export function planLabel(plan: LabelledPlan | null, freeLabel: string): string {
  if (!plan) return freeLabel;
  if (ENDED.has((plan.subscriptionStatus ?? "").trim().toLowerCase())) return freeLabel;
  const name = plan.packageName?.trim() ?? "";
  if (name) return name;
  const code = plan.planCode?.trim() ?? "";
  return code || freeLabel;
}

/** Whether the tenant is on the Free plan: no plan at all, one that has ended, or a plan
 * that names itself free. Callers that could not ask at all (a null summary) must not call
 * this with null — that is "unknown", and `planLabel`'s null means "no plan". */
export function isFreePlan(plan: LabelledPlan | null): boolean {
  if (!plan) return true;
  if (ENDED.has((plan.subscriptionStatus ?? "").trim().toLowerCase())) return true;
  const named = `${plan.packageName ?? ""} ${plan.planCode ?? ""}`.trim();
  return named.length === 0 || /\bfree\b/i.test(named);
}
