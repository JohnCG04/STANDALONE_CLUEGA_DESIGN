import type {
  BillingInterval,
  PlanAnnualPricing,
  PlanCatalogEntry,
  PlatformSubscription,
  SubscriptionCheckoutRequest,
} from '@/lib/billing/platform-subscriptions';

/**
 * The rules behind the subscription purchase UI, kept out of the component so they
 * can be tested without rendering anything.
 *
 * Every rule here mirrors one the backend already enforces. The point is not to
 * validate on the client's authority -- Core refuses a bad request regardless --
 * but to stop the UI offering a choice that will only fail after the click.
 */

/** A plan with several rungs makes the customer choose; one rung or none does not. */
export function requiresTierSelection(plan: PlanCatalogEntry): boolean {
  return plan.creditTiers.length > 1;
}

/**
 * defaultTierFor picks the rung a plan should open on -- and, for a plan with a
 * single buyable rung, the rung it will be bought at.
 *
 * The cheapest, which is the first: it is the one the catalogue advertises as the
 * plan's price, so opening on anything dearer would show a total the customer did
 * not ask for.
 *
 * # WHY ONE RUNG IS STILL A RUNG
 *
 * This used to return null unless the customer had a CHOICE, and that conflated
 * two different questions. The catalogue lists only rungs that are actually
 * mapped to a provider price, while Core decides whether a rung is REQUIRED from
 * the plan's full ladder. Measured on 2026-09-08: Max publishes four rungs, only
 * 40,000 was price-mapped in that deployment, so the panel saw one rung, hid the
 * chooser, sent no rung at all, and Core answered
 * `400 plan "max" requires credit_tier_credits, one of [40000 63000 85000
 * 110000]` -- "We could not start the checkout" on a plan that was perfectly
 * buyable at the one mapped rung.
 *
 * So: send the rung you were offered. Null only when you were offered none,
 * which is the shape of a plan that has no ladder at all (IM's plans) and the
 * one case where Core refuses a rung rather than requiring one.
 */
export function defaultTierFor(plan: PlanCatalogEntry): number | null {
  return plan.creditTiers[0]?.credits ?? null;
}

/**
 * priceForSelection is what the customer will actually be charged per month.
 *
 * Read from the catalogue for display only. The amount charged is decided by Core
 * from its own price map; this figure exists so the button does not say "Subscribe"
 * with no number next to it.
 */
export function priceForSelection(
  plan: PlanCatalogEntry,
  tier: number | null,
): number {
  if (!requiresTierSelection(plan)) return plan.monthlyPriceUsd;
  const chosen = plan.creditTiers.find((t) => t.credits === tier);
  return chosen ? chosen.monthlyPriceUsd : plan.monthlyPriceUsd;
}

/** Why a selection cannot be submitted, or null when it can. */
export type SelectionProblem = 'tier_required' | 'tier_not_on_plan' | null;

/**
 * validateSelection mirrors Core's validateAssignCreditTier.
 *
 * A laddered plan requires a rung; a plan without a ladder refuses one. Getting
 * this wrong client-side does not create a security hole -- Core checks again --
 * but it does turn a valid purchase into a 400 the customer cannot act on.
 */
export function validateSelection(
  plan: PlanCatalogEntry,
  tier: number | null,
): SelectionProblem {
  if (!requiresTierSelection(plan)) return null;
  if (tier == null) return 'tier_required';
  if (!plan.creditTiers.some((t) => t.credits === tier))
    return 'tier_not_on_plan';
  return null;
}

/**
 * buildCheckoutRequest turns a selection into the request body.
 *
 * The interval is the customer's, and it is filtered: 'year' survives only when
 * the catalogue carried annual figures for this exact selection, because Core
 * resolves the amount from the Price mapped for (module, plan, rung, interval)
 * and refuses an interval it has no Price for.
 *
 * The rung is omitted for a plan that offers none, never sent as null: Core refuses
 * a tier supplied for such a plan rather than ignoring it.
 *
 * # WHY IT IS NOT KEYED ON WHETHER THE CUSTOMER HAD A CHOICE
 *
 * This read `requiresTierSelection(plan) ? tier : null`, which threw away a
 * perfectly good rung whenever the plan offered exactly one. Measured on
 * 2026-09-08 against a deployment where one of Max's four rungs was
 * price-mapped: the request went out as {module, plan_code, interval} and Core
 * answered `400 plan "max" requires credit_tier_credits, one of [40000 63000
 * 85000 110000]`. "We could not start the checkout", on a plan that was buyable.
 *
 * Whether the customer CHOOSES and whether a rung is SENT are different
 * questions. What is sent is what the catalogue offered: the chosen rung, or the
 * only one on offer, and nothing at all when nothing was offered.
 */
export function buildCheckoutRequest(
  plan: PlanCatalogEntry,
  tier: number | null,
  interval: BillingInterval = 'month',
): SubscriptionCheckoutRequest {
  return {
    module: plan.moduleCode,
    planCode: plan.planCode,
    creditTierCredits:
      plan.creditTiers.length > 0 ? (tier ?? defaultTierFor(plan)) : null,
    // Yearly only where Core said it is on offer: asking for an interval this
    // deployment has no Price for is a click that fails afterwards.
    interval: interval === 'year' && annualAvailable(plan, tier) ? 'year' : 'month',
  };
}

/**
 * The rung a plan's row should OPEN on.
 *
 * For a plan the customer is considering, the cheapest rung (see defaultTierFor).
 * For the plan they are already ON, the rung they actually bought -- anything else
 * describes somebody else's subscription.
 *
 * Measured on 2026-09-08 with a tenant on Max at 63,000 ($300): the row opened on
 * 40,000, showed "$200/mo", and put a "current plan" badge next to it. The
 * customer's own screen understated what they pay by a third.
 *
 * A rung the catalogue no longer offers -- a price deactivated after they bought
 * it -- falls back to the cheapest, because the alternative is a selector holding
 * a value that is not in its own list.
 */
export function openingTierFor(
  plan: PlanCatalogEntry,
  subscription: PlatformSubscription | null,
): number | null {
  const rung = subscription?.creditTierCredits;
  if (
    subscription &&
    subscription.moduleCode === plan.moduleCode &&
    subscription.planCode === plan.planCode &&
    rung != null &&
    plan.creditTiers.some((t) => t.credits === rung)
  ) {
    return rung;
  }
  return defaultTierFor(plan);
}

/**
 * The annual pricing for what is currently selected, or null when yearly is not
 * on offer for it.
 *
 * A laddered plan carries annual per rung (they differ per rung); a plan with no
 * ladder carries it once. Nothing is computed here -- every figure comes from
 * Core, so the price the screen quotes and the price the card is charged cannot
 * come from two different formulas.
 */
export function annualForSelection(
  plan: PlanCatalogEntry,
  tier: number | null,
): PlanAnnualPricing | null {
  if (plan.creditTiers.length === 0) return plan.annual;
  const chosen = tier ?? defaultTierFor(plan);
  return plan.creditTiers.find((t) => t.credits === chosen)?.annual ?? null;
}

/** Whether the customer may choose to pay yearly for this selection. */
export function annualAvailable(
  plan: PlanCatalogEntry,
  tier: number | null,
): boolean {
  return annualForSelection(plan, tier) != null;
}

/**
 * The per-month figure to print for an interval.
 *
 * Both intervals are quoted per month -- "$300/mo" against "$240/mo billed
 * yearly" -- because that is the comparison a customer makes. The yearly TOTAL
 * is shown next to it, from the same backend figures, so nobody has to multiply
 * anything to know what will be charged.
 */
export function displayPricePerMonth(
  plan: PlanCatalogEntry,
  tier: number | null,
  interval: BillingInterval,
): number | null {
  if (interval === 'year') {
    return annualForSelection(plan, tier)?.pricePerMonthUsd ?? null;
  }
  return priceForSelection(plan, tier);
}

/**
 * The credits a plan gives per month at this selection.
 *
 * For a laddered plan the credits ARE the rung, so they move with the choice;
 * for a plan without a ladder they are the plan's own quota. Core sends only one
 * of the two -- a laddered plan carries no base quota, because there is no single
 * answer until a rung is picked.
 *
 * Measured on 2026-09-08: the panel read the base quota only, so Max -- offered
 * at one mapped rung, hence no selector -- rendered no credits line at all. The
 * price stood on its own and the customer could not see what $200 bought.
 */
export function creditsForSelection(
  plan: PlanCatalogEntry,
  tier: number | null,
): number | null {
  if (plan.creditTiers.length > 0) return tier ?? defaultTierFor(plan);
  return plan.baseCreditQuota;
}

/** findSubscription returns the tenant's live subscription for a module, if any. */
export function findSubscription(
  subscriptions: PlatformSubscription[],
  moduleCode: string,
): PlatformSubscription | null {
  return subscriptions.find((s) => s.moduleCode === moduleCode) ?? null;
}

/**
 * isSubscribedTo reports whether this exact plan and rung is what the tenant
 * already has, so the UI can mark it as the current plan rather than offering it
 * again.
 */
export function isSubscribedTo(
  subscription: PlatformSubscription | null,
  plan: PlanCatalogEntry,
  tier: number | null,
): boolean {
  if (!subscription) return false;
  if (subscription.planCode !== plan.planCode) return false;
  if (!requiresTierSelection(plan)) return true;
  return subscription.creditTierCredits === tier;
}

/**
 * canStartCheckout reports whether the Subscribe button should do anything.
 *
 * A module with a live subscription cannot start another -- Core answers 409 -- so
 * the button is disabled rather than left to fail. Cancelling and resubscribing is
 * not part of this release.
 */
export function canStartCheckout(
  subscription: PlatformSubscription | null,
  plan: PlanCatalogEntry,
  tier: number | null,
  pending: boolean,
): boolean {
  if (pending) return false;
  if (subscription) return false;
  return validateSelection(plan, tier) === null;
}

/**
 * overageNote describes what happens past an IM plan's included sessions.
 *
 * A factor of zero means the plan charges nothing extra -- enterprise -- and must
 * not be described as if it did. Returning null rather than an empty string lets the
 * caller omit the line entirely.
 */
export function overageNote(plan: PlanCatalogEntry): {
  kind: 'charged' | 'included';
  sessionQuota: number;
} | null {
  if (plan.sessionQuota == null) return null;
  const charged = (plan.overageFactor ?? 0) > 0;
  return {
    kind: charged ? 'charged' : 'included',
    sessionQuota: plan.sessionQuota,
  };
}

/**
 * hasConfirmedSubscription is what the post-Checkout page waits for.
 *
 * A subscription counts as confirmed once Core reports it in a live state for the
 * module that was purchased. Deliberately not "the URL said success": the redirect
 * proves the browser came back, not that anybody paid.
 */
export function hasConfirmedSubscription(
  subscriptions: PlatformSubscription[],
  moduleCode: string | null,
): boolean {
  const live = subscriptions.filter((s) =>
    ['trialing', 'active', 'past_due', 'incomplete'].includes(s.status),
  );
  if (!moduleCode) return live.length > 0;
  return live.some((s) => s.moduleCode === moduleCode);
}

/**
 * What a workspace pays today for the plan it holds.
 *
 * Needed to decide whether another plan is an upgrade, because only an upgrade
 * may be taken immediately: moving down mid-cycle would mean refunding, and
 * dropping an allowance under a workspace that may already be past the smaller
 * one. Comparing plan CODES could not answer it -- nothing in a code says which
 * costs more, and the order rows arrive in is not a price order.
 *
 * A tier is matched when the held subscription names one: two rungs of the same
 * plan are different prices, so ignoring the rung would compare against the
 * cheapest and call a sideways move an upgrade.
 */
export function priceForPlanCode(
  catalog: PlanCatalogEntry[],
  moduleCode: string,
  planCode: string,
  tierCredits: number | null,
): number | null {
  const plan = catalog.find(
    (p) => p.moduleCode === moduleCode && p.planCode === planCode,
  );
  if (!plan) return null;
  return priceForSelection(plan, tierCredits);
}

/*
The modules THIS app sells, and the grouping the panel renders.

# WHY IT IS A FILTER AND NOT THE CATALOGUE'S ORDER

This app is CDP. Rendering the catalogue as it arrives put an "Inbox Manager"
section inside CDP's billing tab, with an IM plan announced as CURRENT PLAN
there -- seen on a workspace that holds both. IM billing has its own, fuller
screen in the IM app (session usage against the quota, what overage costs,
invoices, cards), so selling it from here would be a second and thinner place to
buy the same thing.

Filtering through a fixed list rather than rendering what arrives also means a
module added to the price map later cannot appear in this app by accident.
*/
export const APP_MODULES = ['CDP'] as const;

export function groupPlansForApp(
  catalog: PlanCatalogEntry[],
): { code: string; plans: PlanCatalogEntry[] }[] {
  const groups = new Map<string, PlanCatalogEntry[]>();
  for (const plan of catalog) {
    const list = groups.get(plan.moduleCode) ?? [];
    list.push(plan);
    groups.set(plan.moduleCode, list);
  }
  // A module this app does not sell is not shown; a module with nothing to sell
  // has no section either.
  return APP_MODULES.filter((code) => groups.has(code)).map((code) => ({
    code: code as string,
    plans: groups.get(code) ?? [],
  }));
}
