'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  createSubscriptionCheckout,
  readPlanCatalog,
  readTenantSubscriptions,
  requestPlanChange,
  SubscriptionCheckoutError,
  type PlanCatalogEntry,
  type PlatformSubscription,
} from '@/lib/billing/platform-subscriptions';
import type {
  BillingInterval,
  PlanChangeWhen,
} from '@/lib/billing/platform-subscriptions';
import { rememberCheckoutModule } from '@/lib/billing/checkout-return';
import {
  annualAvailable,
  annualForSelection,
  canStartCheckout,
  buildCheckoutRequest,
  creditsForSelection,
  displayPricePerMonth,
  defaultTierFor,
  openingTierFor,
  findSubscription,
  overageNote,
  priceForPlanCode,
  priceForSelection,
  requiresTierSelection,
  groupPlansForApp,
} from '@/lib/billing/subscription-selection';

/**
 * The subscription half of the billing tab.
 *
 * Everything here reads from Core, not CDP: the wallet, the credit packs and the
 * usage summary above are CDP's, but a subscription is Core's, and the two must
 * not be conflated. In particular, a credit balance is NOT evidence of a plan —
 * this panel renders a plan only when Core reports a live subscription for it.
 *
 * # WHAT IS DELIBERATELY NOT HERE
 *
 * No price is ever sent back. The catalogue's amounts are for display; the money
 * is decided by Core from its own price map. Nothing on this screen can name an
 * amount, so nothing on this screen can name a smaller one.
 *
 * The interval toggle sends a cadence, not a price: Core maps
 * (plan, rung, interval) to its own yearly Stripe Price. The discount, the
 * yearly total and the saving all come back from the catalogue, so this screen
 * never computes a second answer to what a year costs.
 */

type Translate = (key: string) => string;



function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, value),
    template,
  );
}

/**
 * The interval a live subscription is already on, so a plan change stays on it.
 * Monthly when there is no subscription: that is what a purchase defaults to.
 */
function subscriptionInterval(
  subscriptions: PlatformSubscription[],
  moduleCode: string,
): BillingInterval {
  const live = subscriptions.find((s) => s.moduleCode === moduleCode);
  return live?.billingInterval === 'year' ? 'year' : 'month';
}

/**
 * The largest annual discount on offer, for the toggle's label.
 *
 * Read from Core's figures rather than assumed: the sheet prices five of twelve
 * CDP rungs off the round 20%, so "save 20%" would be wrong on those.
 */
function bestAnnualDiscount(plans: PlanCatalogEntry[]): number {
  // Floored, not rounded: 20.51% rounds up to "save 21%", which is a discount
  // nobody can actually get. Every claim on this toggle has to be one some rung
  // really pays.
  let best = 0;
  for (const plan of plans) {
    const options = plan.creditTiers.length
      ? plan.creditTiers.map((tier) => tier.annual)
      : [plan.annual];
    for (const annual of options) {
      if (annual && annual.discountPercent > best) best = annual.discountPercent;
    }
  }
  return Math.floor(best);
}

function formatUsd(amount: number | null): string {
  // A price we do not have is a dash, never "$0": zero is a real price and
  // saying it when the catalogue said nothing would be a quote we invented.
  if (amount == null) return '—';
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function checkoutErrorKey(err: unknown): string {
  const kind = err instanceof SubscriptionCheckoutError ? err.kind : 'unknown';
  switch (kind) {
    // 'no_provider_subscription' is deliberately absent: changePlan turns that
    // one into a checkout rather than a message, so it never arrives here.

    case 'conflict':
      return 'settings.billing.subscription.errorConflict';
    case 'busy':
      return 'settings.billing.subscription.errorBusy';
    case 'unavailable':
      return 'settings.billing.subscription.errorUnavailable';
    case 'forbidden':
      return 'settings.billing.subscription.errorForbidden';
    case 'not_configured':
      return 'settings.billing.subscription.errorNotConfigured';
    default:
      return 'settings.billing.subscription.errorUnknown';
  }
}

/** The line under a plan that says what the money buys, per module. */
function PlanQuota({
  plan,
  tier,
  t,
}: {
  plan: PlanCatalogEntry;
  tier: number | null;
  t: Translate;
}) {
  const overage = overageNote(plan);
  if (overage) {
    return (
      <div className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        <div>
          {fill(t('settings.billing.subscription.sessionsPerMonth'), {
            sessions: formatCount(overage.sessionQuota),
          })}
        </div>
        <div>
          {overage.kind === 'charged'
            ? t('settings.billing.subscription.overageCharged')
            : t('settings.billing.subscription.overageIncluded')}
        </div>
      </div>
    );
  }
  // Not plan.baseCreditQuota: a laddered plan carries none, because its credits
  // are the rung. Reading only the base quota left a plan offered at a single
  // rung with a price and no idea what it buys.
  const credits = creditsForSelection(plan, tier);
  if (credits != null) {
    return (
      <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
        {fill(t('settings.billing.subscription.creditsPerMonth'), {
          credits: formatCount(credits),
        })}
      </div>
    );
  }
  return null;
}

/**
 * One purchasable plan.
 *
 * The rung selector appears only for a plan the catalogue offers at more than one
 * rung: a selector with one option implies a choice that does not exist. That is
 * a statement about the UI only — the rung is still sent at checkout, and
 * conflating the two is what made Subscribe fail on a plan whose published
 * ladder was only partly price-mapped (see buildCheckoutRequest).
 */
function PlanRow({
  plan,
  subscription,
  pending,
  currentPriceUsd,
  interval,
  onSubscribe,
  onChange,
  t,
}: {
  plan: PlanCatalogEntry;
  subscription: PlatformSubscription | null;
  pending: boolean;
  /** What the workspace pays today, so only a dearer plan offers "now". */
  currentPriceUsd: number | null;
  /** The cadence the customer is shopping in. Purchases only -- a plan CHANGE
   *  keeps the subscription's own interval, because moving between cadences is
   *  not a transition anybody has defined. */
  interval: BillingInterval;
  onSubscribe: (
    plan: PlanCatalogEntry,
    tier: number | null,
    interval: BillingInterval,
  ) => void;
  onChange: (
    plan: PlanCatalogEntry,
    tier: number | null,
    when: PlanChangeWhen,
  ) => void;
  t: Translate;
}) {
  const laddered = requiresTierSelection(plan);
  // The rung they are ON for their own plan, the cheapest for one they are
  // considering. Opening on the cheapest for the current plan showed a price a
  // third below what the customer actually pays.
  const [tier, setTier] = useState<number | null>(() =>
    openingTierFor(plan, subscription),
  );

  // What this plan costs in the cadence being shown. A plan with no annual
  // Price falls back to its monthly figure and says so, rather than showing a
  // blank where a price belongs.
  const annual = annualForSelection(plan, tier);
  const yearlyChosen = interval === 'year' && annual != null;
  const price = displayPricePerMonth(plan, tier, yearlyChosen ? 'year' : 'month');
  const enabled = canStartCheckout(subscription, plan, tier, pending);

  // With a live subscription for this module the action is a CHANGE, not a
  // purchase: Core moves the price now with no proration and the plan itself at
  // the next paid renewal, so the workspace keeps the allowance it paid for.
  const live =
    subscription != null && subscription.moduleCode === plan.moduleCode;
  const isCurrent = live && subscription.planCode === plan.planCode;
  const scheduled =
    live && subscription.pendingChange?.toPlanCode === plan.planCode;
  const currentPrice = currentPriceUsd;

  // A change keeps the subscription's own cadence, so offering one from the
  // OTHER cadence's prices would take a click against a number the customer can
  // read and perform something else. Measured: a monthly Ultra workspace looking
  // at "$400/mo · $4,800 billed once a year" pressed Change and scheduled the
  // MONTHLY Max at $500/mo -- Core wrote the monthly Price, exactly as asked,
  // and nothing on screen said so. Core refuses cadence moves; the screen must
  // refuse to ask for one.
  const shownCadence: BillingInterval = yearlyChosen ? 'year' : 'month';
  const ownCadence: BillingInterval = live
    ? subscription.billingInterval === 'year'
      ? 'year'
      : 'month'
    : shownCadence;
  const cadenceLocked = live && !isCurrent && shownCadence !== ownCadence;

  // "Now" only for a dearer plan. Moving DOWN immediately would mean refunding,
  // and dropping the allowance under a workspace that may already be past the
  // smaller one -- neither is built, so neither is offered.
  const canUpgradeNow =
    live &&
    !isCurrent &&
    !scheduled &&
    !pending &&
    !cadenceLocked &&
    price != null &&
    currentPrice != null &&
    price > currentPrice;

  return (
    <div
      data-testid={`plan-${plan.moduleCode}-${plan.planCode}`}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="text-[13px] font-medium capitalize text-neutral-900 dark:text-neutral-100">
          {plan.planCode}
        </div>
        {/*
          No selector on the plan they are already on: Core refuses a rung
          change within one plan (409 already_on_plan), so a chooser there
          offers a choice the backend will not honour. Their rung is stated
          instead.
        */}
        {laddered && !isCurrent ? (
          <label className="flex flex-col gap-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            {t('settings.billing.subscription.chooseTier')}
            <select
              data-testid={`tier-${plan.moduleCode}-${plan.planCode}`}
              value={tier ?? ''}
              onChange={(e) => setTier(Number(e.target.value))}
              className="w-fit rounded-md border border-neutral-300 bg-white px-2 py-1 text-[13px] text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {plan.creditTiers.map((option) => (
                <option key={option.credits} value={option.credits}>
                  {formatCount(option.credits)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <PlanQuota plan={plan} tier={tier} t={t} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div
          data-testid={`price-${plan.moduleCode}-${plan.planCode}`}
          className="text-[15px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100"
        >
          {formatUsd(price)}
          <span className="text-[12px] font-normal text-neutral-500 dark:text-neutral-400">
            {t('settings.billing.subscription.perMonth')}
          </span>
          {/*
            The yearly total, from Core's own figures. A per-month rate on an
            annual commitment is the comparison a customer makes, but the amount
            the card is charged is the one they need to see before clicking.
          */}
          {yearlyChosen && annual ? (
            <div
              data-testid={`annual-total-${plan.moduleCode}-${plan.planCode}`}
              className="mt-0.5 text-[11px] font-normal text-neutral-500 dark:text-neutral-400"
            >
              {fill(t('settings.billing.subscription.billedYearly'), {
                total: formatUsd(annual.totalUsd),
              })}
            </div>
          ) : null}
          {interval === 'year' && !annual ? (
            <div className="mt-0.5 text-[11px] font-normal text-neutral-500 dark:text-neutral-400">
              {t('settings.billing.subscription.monthlyOnly')}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-1">
          <Button
            type="button"
            variant="primary"
            disabled={
              live ? isCurrent || scheduled || pending || cadenceLocked : !enabled
            }
            data-testid={`subscribe-${plan.moduleCode}-${plan.planCode}`}
            onClick={() =>
              live
                ? onChange(plan, tier, 'next_cycle')
                : onSubscribe(plan, tier, yearlyChosen ? 'year' : 'month')
            }
          >
            {isCurrent
              ? t('settings.billing.subscription.currentPlan')
              : scheduled
                ? t('settings.billing.subscription.scheduled')
                : pending
                  ? live
                    ? t('settings.billing.subscription.changing')
                    : t('settings.billing.subscription.subscribing')
                  : live
                    ? t('settings.billing.subscription.changeTo')
                    : t('settings.billing.subscription.subscribe')}
          </Button>
          {/*
            Why the button is off, and what to do about it. A disabled control
            with no reason beside it is the same dead end as a click that
            silently did the wrong thing.
          */}
          {cadenceLocked ? (
            <div
              data-testid={`cadence-locked-${plan.moduleCode}-${plan.planCode}`}
              className="max-w-[13rem] text-[11px] text-neutral-500 dark:text-neutral-400"
            >
              {ownCadence === 'year'
                ? t('settings.billing.subscription.changeYearlyOnly')
                : t('settings.billing.subscription.changeMonthlyOnly')}
            </div>
          ) : null}
          {/*
            The second, paid option. Its label carries the consequence rather
            than hiding it in a tooltip, because this one takes money now.
          */}
          {canUpgradeNow ? (
            <button
              type="button"
              className="text-[12px] font-medium text-neutral-600 underline underline-offset-4 disabled:opacity-50 dark:text-neutral-300"
              data-testid={`upgrade-now-${plan.moduleCode}-${plan.planCode}`}
              onClick={() => onChange(plan, tier, 'immediately')}
            >
              {t('settings.billing.subscription.upgradeNow')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The plan the tenant already holds, with the state Core reports for it. */
function CurrentPlan({
  subscription,
  t,
}: {
  subscription: PlatformSubscription;
  t: Translate;
}) {
  const endLabel = formatDate(subscription.currentPeriodEnd);
  const ending = subscription.cancelAt != null || !subscription.autoRenew;

  return (
    <div
      data-testid={`current-${subscription.moduleCode}`}
      className="flex flex-col gap-1 rounded-lg border border-neutral-900 p-4 dark:border-neutral-100"
    >
      <div className="text-[12px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {t('settings.billing.subscription.currentPlan')}
      </div>
      <div className="text-[15px] font-semibold capitalize text-neutral-900 dark:text-neutral-100">
        {subscription.planCode}
        {subscription.creditTierCredits != null
          ? ` · ${formatCount(subscription.creditTierCredits)}`
          : ''}
      </div>
      {/*
        Which cadence the customer is actually paying on. The renewal date alone
        does not say it -- a date a year out is easy to read as a long month --
        and the panel used to state "monthly plans" to everyone, which told an
        annual customer something untrue about their own money.
      */}
      <div
        data-testid={`current-interval-${subscription.moduleCode}`}
        className="text-[12px] text-neutral-500 dark:text-neutral-400"
      >
        {subscription.billingInterval === 'year'
          ? t('settings.billing.subscription.billedYearlyPlan')
          : t('settings.billing.subscription.billedMonthly')}
      </div>
      {endLabel ? (
        <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {fill(
            ending
              ? t('settings.billing.subscription.endsOn')
              : t('settings.billing.subscription.renewsOn'),
            { date: endLabel },
          )}
        </div>
      ) : null}
      {/*
        A change the customer has already asked for. Without this the only sign
        was a plan row whose button had gone quiet on "Scheduled", which reads as
        a click that did nothing.
      */}
      {subscription.pendingChange ? (
        <div
          data-testid={`pending-change-${subscription.moduleCode}`}
          className="mt-1 text-[12px] capitalize text-neutral-700 dark:text-neutral-200"
        >
          {fill(t('settings.billing.subscription.pendingChange'), {
            plan: subscription.pendingChange.toPlanCode,
            date: formatDate(subscription.pendingChange.effectiveAfter) ?? '',
          })}
        </div>
      ) : null}
      {subscription.status === 'past_due' ? (
        <div className="mt-1 text-[12px] text-rose-700 dark:text-rose-300">
          {t('settings.billing.subscription.statusPastDue')}
        </div>
      ) : null}
      {subscription.status === 'incomplete' ? (
        <div className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">
          {t('settings.billing.subscription.statusIncomplete')}
        </div>
      ) : null}
    </div>
  );
}

export function SubscriptionPanel({ t }: { t: Translate }) {
  const { tenant } = useCurrentUser();
  const tenantId = tenant?.id ?? null;

  const [plans, setPlans] = useState<PlanCatalogEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    setLoading(true);
    setLoadFailed(false);
    void Promise.all([
      readPlanCatalog(tenantId),
      readTenantSubscriptions(tenantId),
    ])
      .then(([catalog, subs]) => {
        if (!alive) return;
        setPlans(catalog);
        setSubscriptions(subs);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const subscribe = useCallback(
    async (
      plan: PlanCatalogEntry,
      tier: number | null,
      interval: BillingInterval,
    ) => {
      if (!tenantId) return;
      const key = `${plan.moduleCode}:${plan.planCode}`;
      setPendingPlan(key);
      setErrorKey(null);
      try {
        const { checkoutUrl } = await createSubscriptionCheckout(
          tenantId,
          buildCheckoutRequest(plan, tier, interval),
        );
        // The success URL is fixed, so it cannot name the module. Stash it before
        // leaving; the confirming page reads it to know which subscription to
        // wait for rather than accepting any live one.
        rememberCheckoutModule(plan.moduleCode);
        // A full navigation, not a new tab: Stripe owns the next screen and
        // returns the browser here through the success or cancel URL Core set.
        window.location.assign(checkoutUrl);
      } catch (err) {
        setErrorKey(checkoutErrorKey(err));
        setPendingPlan(null);
      }
    },
    [tenantId],
  );

  const changePlan = useCallback(
    async (
      plan: PlanCatalogEntry,
      tier: number | null,
      when: PlanChangeWhen,
    ) => {
      if (!tenantId) return;
      const key = `${plan.moduleCode}:${plan.planCode}`;
      setPendingPlan(key);
      setErrorKey(null);
      // The subscription's OWN interval, never the toggle: moving a live
      // subscription between monthly and yearly is a transition nobody has
      // defined (Core refuses a same-plan change outright), so a change request
      // must not quietly carry a different cadence.
      const ownInterval = subscriptionInterval(subscriptions, plan.moduleCode);
      try {
        await requestPlanChange(tenantId, {
          ...buildCheckoutRequest(plan, tier, ownInterval),
          when,
        });
        // Re-read rather than patch local state: Core decides what is pending
        // and what has already moved, and an immediate change alters the held
        // plan as well as the request.
        setSubscriptions(await readTenantSubscriptions(tenantId));
      } catch (err) {
        // # WHEN THERE IS NOTHING TO CHANGE, BUY ONE
        //
        // The plan on the card can be one granted by hand, with no subscription
        // at the payment provider behind it -- the admin assignment endpoint
        // writes those, and so did every seeded account. Core cannot move a
        // subscription that does not exist, and answers 409
        // no_live_subscription.
        //
        // The customer's intent is not in doubt: they asked for the dearer plan.
        // So the click becomes what it should always have been for this state --
        // a checkout, which is the only thing that can create the subscription
        // they are asking to be on. Measured on staging 2026-09-09: a tenant on
        // a hand-granted CDP/pro clicked "upgrade now" six times and every click
        // answered 409.
        if (
          err instanceof SubscriptionCheckoutError &&
          err.kind === 'no_provider_subscription'
        ) {
          await subscribe(plan, tier, ownInterval);
          return;
        }
        setErrorKey(checkoutErrorKey(err));
      } finally {
        setPendingPlan(null);
      }
    },
    [tenantId, subscriptions, subscribe],
  );

  // Which modules this app sells, and in what order -- see groupPlansForApp.
  const byModule = useMemo(() => groupPlansForApp(plans), [plans]);
  // The cadence being shopped in. Monthly by default: it is the cheaper
  // commitment, and defaulting a customer into a year is not this screen's
  // decision to make.
  const [interval, setIntervalChoice] = useState<BillingInterval>('month');
  const anyAnnual = useMemo(
    () => plans.some((p) => annualAvailable(p, null)),
    [plans],
  );

  if (!tenantId || loading) {
    return (
      <div
        data-testid="subscription-panel-loading"
        className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-5 text-[13px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('settings.billing.subscription.title')}
      </div>
    );
  }

  return (
    <div
      data-testid="subscription-panel"
      className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="border-b border-dashed border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t('settings.billing.subscription.title')}
        </div>
        <div className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
          {t('settings.billing.subscription.subtitle')}
        </div>
      </div>

      {errorKey ? (
        <div
          data-testid="subscription-error"
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
        >
          {t(errorKey)}
        </div>
      ) : null}

      {loadFailed ? (
        <div
          data-testid="subscription-load-failed"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t('settings.billing.subscription.loadFailed')}
        </div>
      ) : byModule.length === 0 ? (
        <div
          data-testid="subscription-empty"
          className="mt-4 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          {t('settings.billing.subscription.noPlans')}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {/*
            Only where something can actually be bought yearly. The saving shown
            is the best one on offer, computed by Core per rung -- the discount
            is not a flat rate (85,000 credits is 20.5% off, not 20%).
          */}
          {anyAnnual ? (
            <div
              data-testid="billing-interval-toggle"
              className="flex items-center gap-2 self-start rounded-xl border border-neutral-200 p-1 dark:border-neutral-800"
            >
              {(['month', 'year'] as BillingInterval[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  data-testid={`interval-${option}`}
                  onClick={() => setIntervalChoice(option)}
                  className={
                    option === interval
                      ? 'rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-600 dark:text-neutral-300'
                  }
                >
                  {option === 'month'
                    ? t('settings.billing.subscription.payMonthly')
                    : fill(t('settings.billing.subscription.payYearly'), {
                        percent: String(bestAnnualDiscount(plans)),
                      })}
                </button>
              ))}
            </div>
          ) : null}
          {byModule.map(({ code, plans: modulePlans }) => {
            const current = findSubscription(subscriptions, code);
            return (
              <div key={code} className="flex flex-col gap-3">
                <div className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  {t(`settings.billing.subscription.module${code}`)}
                </div>
                {current ? <CurrentPlan subscription={current} t={t} /> : null}
                {modulePlans.map((plan) => (
                  <PlanRow
                    key={`${plan.moduleCode}:${plan.planCode}`}
                    plan={plan}
                    subscription={current}
                    pending={
                      pendingPlan === `${plan.moduleCode}:${plan.planCode}`
                    }
                    currentPriceUsd={
                      current
                        ? priceForPlanCode(
                            plans,
                            current.moduleCode,
                            current.planCode,
                            current.creditTierCredits,
                          )
                        : null
                    }
                    interval={interval}
                    onSubscribe={subscribe}
                    onChange={changePlan}
                    t={t}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
