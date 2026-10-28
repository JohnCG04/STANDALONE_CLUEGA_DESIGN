import { platformApiConfig } from '@/config/platform-api';
import { cdpFetchRaw } from '@/lib/cdp';
import { CdpApiError } from '@/lib/cdp/errors';

/**
 * Subscription billing against the Mid Platform (Core) API.
 *
 * Separate from cdp-billing.ts on purpose. That file talks to the CDP backend for
 * the wallet, the one-off credit packs and the usage summary; subscriptions live on
 * Core, behind a different base URL. Putting them in one module would make it easy
 * to send a Core path to the CDP host, which fails as a 404 that looks like a
 * missing feature rather than a wrong address.
 *
 * The transport is the app's existing one — cdpFetchRaw with auth "auto" — so token
 * refresh, headers and the active-team context all behave exactly as they do
 * everywhere else. There is deliberately no second HTTP client here.
 */

/** One live subscription, as Core reports it. Carries no provider identifiers. */
/**
 * When a plan change takes effect.
 *
 * "next_cycle" charges and refunds nothing today and moves the plan at the
 * renewal, so the workspace keeps the allowance it paid for. "immediately"
 * charges the prorated difference now and moves the allowance now.
 */
export type PlanChangeWhen = 'next_cycle' | 'immediately';

/** A change the customer asked for that has not taken effect yet. */
export interface PendingPlanChange {
  toPlanCode: string;
  effectiveAfter: string | null;
}

export interface PlatformSubscription {
  moduleCode: string;
  planCode: string;
  creditTierCredits: number | null;
  status: string;
  billingInterval: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  pendingChange: PendingPlanChange | null;
}

/** One selectable credit rung on a CDP plan. */
export interface PlanCreditTier {
  credits: number;
  monthlyPriceUsd: number;
  /** Annual for THIS rung; null when no yearly Price is mapped for it. */
  annual: PlanAnnualPricing | null;
}

/**
 * A plan the tenant can subscribe to right now.
 *
 * The shape differs by module because the plans do: a CDP plan sells credits at a
 * rung, an IM plan sells a session quota with overage beyond it. `creditTiers` is
 * empty when there is no choice to make, which is what tells the UI not to render a
 * selector — it mirrors the backend rule that a single-rung plan takes no tier.
 */
/**
 * What paying for a year costs, exactly as Core resolved it.
 *
 * Every figure here is computed by the backend from the two stored prices --
 * the monthly rate and the discounted per-month annual rate -- because the
 * discount is not a constant: it is about 20% but the price sheet prices 5 of
 * 12 CDP rungs off it. A UI applying its own percentage would quote a number
 * the card is never charged.
 */
export interface PlanAnnualPricing {
  /** The discounted rate per month, for a "$160/mo billed yearly" line. */
  pricePerMonthUsd: number;
  /** What the card is charged once a year. */
  totalUsd: number;
  /** What twelve months at the monthly rate would have cost. */
  monthlyTotalUsd: number;
  savingUsd: number;
  /** Already rounded to one decimal by Core. */
  discountPercent: number;
}

export interface PlanCatalogEntry {
  moduleCode: string;
  planCode: string;
  monthlyPriceUsd: number;
  creditTiers: PlanCreditTier[];
  baseCreditQuota: number | null;
  sessionQuota: number | null;
  /** 0 means this plan charges no overage at all. Not the same as "unknown". */
  overageFactor: number | null;
  /**
   * Annual for a plan with no rung to choose. Null when this deployment has no
   * yearly Price mapped for it, which is what tells the UI not to offer yearly.
   */
  annual: PlanAnnualPricing | null;
}

/** One invoice the tenant can see, as Core reports it. */
export interface PlatformInvoice {
  id: string;
  invoiceNo: string | null;
  status: string;
  currency: string;
  totalUsd: number;
  /**
   * The provider's SIGNED total, when a provider issued the invoice. A credit
   * note is a negative total, and totalUsd cannot go below zero (Core's money
   * columns carry a >= 0 check), so without this a -$987.54 credit note reads
   * as $0.00.
   */
  providerTotalUsd: number | null;
  /**
   * What the card actually paid. Not the same as the total: an invoice settled
   * from a credit balance is "paid" with nothing paid, and there is nothing to
   * refund on it.
   */
  amountPaidUsd: number;
  /** Money already sent back, and money the bank took back. Kept apart: one is
   * us returning it, the other is a chargeback, and a customer reading their
   * own invoice should be told which happened. */
  refundedUsd: number;
  chargedBackUsd: number;
  issuedAt: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  moduleCode: string | null;
  /**
   * Where the customer opens it. Present for a provider-issued invoice, null for
   * one Cluega generated itself -- so a row without it shows no link rather than
   * a link that goes nowhere.
   */
  hostedInvoiceUrl: string | null;
}

/** What the customer chose. Never a price — Core decides the money. */
export interface SubscriptionCheckoutRequest {
  module: string;
  planCode: string;
  creditTierCredits: number | null;
  interval: BillingInterval;
}

/** What the customer is buying a year or a month of. */
export type BillingInterval = 'month' | 'year';

export interface SubscriptionCheckoutResult {
  checkoutUrl: string;
  /** Present when an existing session was resumed rather than a new one opened. */
  resumed: boolean;
}

/** Why a checkout could not start, in terms the UI can act on. */
export type CheckoutFailureKind =
  | 'conflict' // 409: a live subscription already holds this module -- terminal
  | 'busy' // 409: transient, and it survived an automatic retry
  // 409 from plan-change: the module IS held, but by a plan granted by hand with
  // nothing at the provider behind it, so there is no subscription to move. The
  // way forward is a checkout, which is the caller's to start -- not an error to
  // show. See the fallback in SubscriptionPanel.
  | 'no_provider_subscription'
  | 'unavailable' // 422 (409 plan_not_purchasable from plan-change): this plan/interval cannot be purchased right now
  | 'forbidden' // 403: this member may not buy or change plans -- an administrator can
  | 'not_configured' // 503: payments are not switched on in this deployment
  | 'unknown';

export class SubscriptionCheckoutError extends Error {
  readonly kind: CheckoutFailureKind;
  constructor(kind: CheckoutFailureKind, message: string) {
    super(message);
    this.name = 'SubscriptionCheckoutError';
    this.kind = kind;
  }
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Core answers two very different 409s, and says which in a `code`.
 *
 * `subscription_exists` is terminal: the tenant holds this module already and
 * asking again cannot help. `checkout_retry` means Core just retired a stale
 * attempt, or another request briefly held the slot -- the next call starts
 * clean. Telling a customer "there is already a subscription in progress" when
 * one more click would have worked is the failure this distinction exists to
 * prevent.
 *
 * Read from the raw body rather than CdpApiError.code, which carries CDP's own
 * error taxonomy from a different envelope shape. A 409 with no code at all is
 * treated as terminal: refusing to retry is the safe way to be wrong.
 */
function conflictCode(err: unknown): string | null {
  if (!(err instanceof CdpApiError) || err.status !== 409) return null;
  try {
    const body = JSON.parse(err.rawBody ?? '{}') as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

function unwrapData(json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as { data?: unknown };
  return (body.data ?? {}) as Record<string, unknown>;
}

/** Null when nothing is pending, which is the ordinary case. */
function toPendingChange(raw: unknown): PendingPlanChange | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const to = str(o.to_plan_code);
  if (!to) return null;
  return { toPlanCode: to, effectiveAfter: str(o.effective_after) };
}

function toSubscription(raw: Record<string, unknown>): PlatformSubscription {
  return {
    moduleCode: String(raw.module_code ?? ''),
    planCode: String(raw.plan_code ?? ''),
    creditTierCredits: num(raw.credit_tier_credits),
    status: String(raw.status ?? ''),
    billingInterval: String(raw.billing_interval ?? 'month'),
    currentPeriodStart: str(raw.current_period_start),
    currentPeriodEnd: str(raw.current_period_end),
    autoRenew: raw.auto_renew === true,
    cancelAt: str(raw.cancel_at),
    canceledAt: str(raw.canceled_at),
    pendingChange: toPendingChange(raw.pending_plan_change),
  };
}

/**
 * Annual pricing, or null when Core sent none.
 *
 * Absent means "this deployment cannot sell it yearly" -- a rung with a monthly
 * Price and no yearly one -- and the UI has to read that as "no yearly option"
 * rather than fill the gap with arithmetic of its own.
 */
function toAnnual(raw: unknown): PlanAnnualPricing | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const perMonth = num(a.price_per_month_usd);
  const total = num(a.total_usd);
  if (perMonth == null || total == null) return null;
  return {
    pricePerMonthUsd: perMonth,
    totalUsd: total,
    monthlyTotalUsd: num(a.monthly_total_usd) ?? 0,
    savingUsd: num(a.saving_usd) ?? 0,
    discountPercent: num(a.discount_percent) ?? 0,
  };
}

function toCatalogEntry(raw: Record<string, unknown>): PlanCatalogEntry {
  const tiers = Array.isArray(raw.credit_tiers) ? raw.credit_tiers : [];
  return {
    moduleCode: String(raw.module_code ?? ''),
    planCode: String(raw.plan_code ?? ''),
    monthlyPriceUsd: num(raw.monthly_price_usd) ?? 0,
    creditTiers: tiers.map((t) => {
      const tier = t as Record<string, unknown>;
      return {
        credits: num(tier.credits) ?? 0,
        monthlyPriceUsd: num(tier.monthly_price_usd) ?? 0,
        annual: toAnnual(tier.annual),
      };
    }),
    baseCreditQuota: num(raw.base_credit_quota),
    sessionQuota: num(raw.session_quota),
    overageFactor: num(raw.overage_factor),
    annual: toAnnual(raw.annual),
  };
}

/**
 * readTenantSubscriptions returns the tenant's live subscriptions.
 *
 * This is the ONLY authority on whether a subscription is active. The post-Checkout
 * page polls it rather than trusting the redirect, and the billing screen renders
 * from it rather than inferring a plan from the wallet balance.
 */
export async function readTenantSubscriptions(
  tenantId: string,
): Promise<PlatformSubscription[]> {
  const { json } = await cdpFetchRaw(
    `/v1/tenants/${encodeURIComponent(tenantId)}/billing/subscriptions`,
    {
      auth: { kind: 'auto' },
      baseUrl: platformApiConfig.baseUrl,
      cache: 'no-store',
    },
  );
  const items = unwrapData(json).items;
  if (!Array.isArray(items)) return [];
  return items.map((i) => toSubscription(i as Record<string, unknown>));
}

function toInvoice(raw: Record<string, unknown>): PlatformInvoice {
  return {
    id: String(raw.id ?? ''),
    invoiceNo: str(raw.invoice_no),
    status: String(raw.status ?? ''),
    currency: str(raw.currency) ?? 'USD',
    totalUsd: num(raw.total_usd) ?? 0,
    providerTotalUsd: num(raw.provider_total_usd) ?? null,
    amountPaidUsd: num(raw.amount_paid_usd) ?? 0,
    refundedUsd: num(raw.refunded_usd) ?? 0,
    chargedBackUsd: num(raw.charged_back_usd) ?? 0,
    issuedAt: str(raw.issued_at),
    dueDate: str(raw.due_date),
    periodStart: str(raw.period_start),
    periodEnd: str(raw.period_end),
    moduleCode: str(raw.module_code),
    hostedInvoiceUrl: str(raw.hosted_invoice_url),
  };
}

/**
 * readTenantInvoices returns the tenant's invoices, newest first.
 *
 * For a Stripe-managed subscription these are the invoices STRIPE issued: the
 * monthly worker skips those tenants so the same period is never billed twice,
 * and the webhook records what Stripe charged. Nothing here re-derives an amount.
 */
export async function readTenantInvoices(
  tenantId: string,
  options: { modules?: readonly string[] } = {},
): Promise<PlatformInvoice[]> {
  // The products this screen is about. A tenant has ONE billing account and
  // every product's invoices hang off it, so without this the Cluega AI
  // billing tab listed a $999 Inbox Manager charge -- money the customer
  // cannot explain from the page they are looking at.
  //
  // Sent to Core rather than filtered here, because filtering a page in the
  // browser leaves the pagination counting rows the browser then throws away.
  // One request, whatever the number of modules, for the same reason: two
  // lists stitched together client-side cannot be paged as one.
  const params = new URLSearchParams();
  for (const moduleCode of options.modules ?? []) {
    if (moduleCode.trim()) params.append('module', moduleCode.trim());
  }
  const query = params.toString();
  const { json } = await cdpFetchRaw(
    `/v1/tenants/${encodeURIComponent(tenantId)}/billing/invoices${query ? `?${query}` : ''}`,
    {
      auth: { kind: 'auto' },
      baseUrl: platformApiConfig.baseUrl,
      cache: 'no-store',
    },
  );
  const items = unwrapData(json).invoices;
  if (!Array.isArray(items)) return [];
  return items.map((i) => toInvoice(i as Record<string, unknown>));
}

/** readPlanCatalog returns the plans this tenant can buy today. */
export async function readPlanCatalog(
  tenantId: string,
): Promise<PlanCatalogEntry[]> {
  const { json } = await cdpFetchRaw(
    `/v1/tenants/${encodeURIComponent(tenantId)}/billing/plan-catalog`,
    { auth: { kind: 'auto' }, baseUrl: platformApiConfig.baseUrl },
  );
  const plans = unwrapData(json).plans;
  if (!Array.isArray(plans)) return [];
  return plans.map((p) => toCatalogEntry(p as Record<string, unknown>));
}

/**
 * createSubscriptionCheckout asks Core to open a Stripe Checkout Session and
 * returns the URL to send the browser to.
 *
 * # WHAT THIS DELIBERATELY DOES NOT SEND
 *
 * No price id, no unit amount, no customer or subscription id. The request carries
 * business choices only; Core resolves the plan and rung to a Stripe Price through
 * its own mapping. A frontend that could name an amount is a frontend that could
 * name a smaller one.
 *
 * The rung is omitted entirely — not sent as null — for a plan that has no rung to
 * choose, because Core refuses a tier supplied for such a plan rather than ignoring
 * it.
 */
export async function createSubscriptionCheckout(
  tenantId: string,
  request: SubscriptionCheckoutRequest,
): Promise<SubscriptionCheckoutResult> {
  const body: Record<string, unknown> = {
    module: request.module,
    plan_code: request.planCode,
    // Whatever the customer chose. Core resolves the amount from the Price it
    // has mapped for (module, plan, rung, interval); this names the interval and
    // never an amount.
    interval: request.interval,
  };
  if (request.creditTierCredits != null) {
    body.credit_tier_credits = request.creditTierCredits;
  }

  const send = async (): Promise<SubscriptionCheckoutResult> => {
    const { json } = await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/subscription/checkout-session`,
      {
        method: 'POST',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    const data = unwrapData(json);
    const url = str(data.checkout_url);
    if (!url) {
      throw new SubscriptionCheckoutError(
        'unknown',
        'No checkout URL was returned.',
      );
    }
    return { checkoutUrl: url, resumed: data.resumed === true };
  };

  try {
    return await send();
  } catch (err) {
    if (err instanceof SubscriptionCheckoutError) throw err;

    // Core retires a stale attempt and asks the caller to try again. Doing that
    // for the customer is the whole point: the retire has already committed, so
    // this second call starts from a clean slot. Exactly once -- a loop here
    // would turn a persistent fault into a hammering client.
    if (conflictCode(err) === 'checkout_retry') {
      try {
        return await send();
      } catch (retryErr) {
        if (retryErr instanceof SubscriptionCheckoutError) throw retryErr;
        throw toCheckoutError(retryErr);
      }
    }
    throw toCheckoutError(err);
  }
}

/**
 * toCheckoutError maps a transport failure onto something the UI can say out loud.
 *
 * The backend's message is not passed through. Core is careful not to put Stripe
 * identifiers in customer-facing errors, but "careful" is not a guarantee to build a
 * UI on, and a billing screen has no use for an upstream string anyway.
 */
function toCheckoutError(err: unknown): SubscriptionCheckoutError {
  const status = err instanceof CdpApiError ? err.status : 0;
  switch (status) {
    case 409:
      // A transient conflict that survived the automatic retry is a "try again
      // shortly", not "you already own this" -- saying the latter would tell a
      // customer to stop when the plan is still theirs to buy.
      if (conflictCode(err) === 'checkout_retry') {
        return new SubscriptionCheckoutError(
          'busy',
          'Another checkout is finishing. Please try again in a moment.',
        );
      }
      // The plan is held, but no provider subscription stands behind it -- a
      // plan granted by hand. Saying "you already have a subscription" here
      // tells the customer to stop at the exact moment buying one is what they
      // need to do, so it gets its own kind and the caller offers the checkout.
      if (conflictCode(err) === 'no_live_subscription') {
        return new SubscriptionCheckoutError(
          'no_provider_subscription',
          'This plan was not bought through the payment provider, so there is nothing to change.',
        );
      }
      // Plan change says "this plan cannot be bought" with a 409 where checkout
      // uses a 422. Left to the generic conflict, it told a customer asking for an
      // unpriced plan that they already had a subscription.
      if (conflictCode(err) === 'plan_not_purchasable') {
        return new SubscriptionCheckoutError(
          'unavailable',
          'This plan is not available for purchase right now.',
        );
      }
      return new SubscriptionCheckoutError(
        'conflict',
        'You already have a subscription for this product.',
      );
    case 403:
      // Buying and changing plans need billing rights. "Please try again" would
      // send the customer back to a button that refuses them every time.
      return new SubscriptionCheckoutError(
        'forbidden',
        'You do not have permission to buy or change plans.',
      );
    case 422:
      return new SubscriptionCheckoutError(
        'unavailable',
        'This plan is not available for purchase right now.',
      );
    case 503:
      return new SubscriptionCheckoutError(
        'not_configured',
        'Card payment is temporarily unavailable.',
      );
    default:
      return new SubscriptionCheckoutError(
        'unknown',
        'We could not start the checkout. Please try again.',
      );
  }
}

/**
 * Asks for a plan change on a live subscription.
 *
 * "next_cycle" charges and refunds nothing today: Core moves the Stripe price now
 * with no proration and moves the plan the workspace HOLDS at the next paid
 * renewal, so a customer keeps the allowance they paid for until the period they
 * paid for ends.
 *
 * "immediately" charges the prorated difference now and moves the allowance now.
 * Only offered for a dearer plan: moving down immediately would mean refunding,
 * and dropping an allowance under a workspace that may already be past the
 * smaller one -- neither is built.
 *
 * As with checkout, the request names a module and a plan code and nothing else.
 * No amount, no Stripe Price id, no customer id -- Core resolves all of it from
 * its own catalogue.
 */
export async function requestPlanChange(
  tenantId: string,
  request: SubscriptionCheckoutRequest & { when?: PlanChangeWhen },
): Promise<PendingPlanChange | null> {
  const body: Record<string, unknown> = {
    module: request.module,
    plan_code: request.planCode,
    when: request.when ?? 'next_cycle',
  };
  if (request.creditTierCredits != null) {
    body.credit_tier_credits = request.creditTierCredits;
  }
  try {
    const { json } = await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/subscription/plan-change`,
      {
        method: 'POST',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    // An immediate move is already done, so there is nothing pending to report:
    // returning null keeps a plan from being badged as scheduled when the
    // workspace is already on it.
    if ((request.when ?? 'next_cycle') === 'immediately') return null;
    const data = unwrapData(json);
    return toPendingChange(data);
  } catch (err) {
    throw toCheckoutError(err);
  }
}

/** What Core answered when the customer asked for their money back. */
export interface InvoiceRefundOutcome {
  /** "refunded" means the money is already on its way back to the card. */
  status: 'refunded' | 'pending_review';
  amountUsd: string;
  /** How much of the period had been used, when Core could measure it. */
  usedPercent: string | null;
  thresholdPercent: string | null;
}

/**
 * Why an ask could not be taken, in Core's own words.
 *
 * The code is carried so the screen can say something specific about the cases
 * a customer can act on -- the window has closed, a request is already open --
 * and fall back to Core's sentence for the rest. Core writes these for
 * customers to read; it does not put provider identifiers in them.
 */
export class InvoiceRefundError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'InvoiceRefundError';
    this.code = code;
  }
}

/**
 * requestInvoiceRefund asks for a paid invoice to be refunded.
 *
 * # THE RULE IS CORE'S, NOT THIS SCREEN'S
 *
 * Inside a short window after paying, an invoice whose period is barely used
 * refunds itself; otherwise the ask becomes a request a human answers. None of
 * that is computed here -- the window length and the usage threshold are
 * configuration on the server, and a copy of the rule in a browser is a promise
 * the server may refuse. This sends the reason and reports what came back.
 */
export async function requestInvoiceRefund(
  tenantId: string,
  invoiceId: string,
  reason: string,
): Promise<InvoiceRefundOutcome> {
  try {
    const { json } = await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/billing/invoices/${encodeURIComponent(
        invoiceId,
      )}/refund-request`,
      {
        method: 'POST',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
        headers: { 'Content-Type': 'application/json' },
        body: { reason },
      },
    );
    const data = unwrapData(json);
    return {
      // Anything that is not an outright refund is waiting for a person, and
      // saying "refunded" for one of those would be a promise about money.
      status: data.status === 'refunded' ? 'refunded' : 'pending_review',
      amountUsd: str(data.amount_usd) ?? '',
      usedPercent: str(data.used_percent),
      thresholdPercent: str(data.threshold_percent),
    };
  } catch (err) {
    throw toRefundError(err);
  }
}

function toRefundError(err: unknown): InvoiceRefundError {
  if (err instanceof InvoiceRefundError) return err;
  if (err instanceof CdpApiError) {
    let code = '';
    let message = '';
    try {
      const body = JSON.parse(err.rawBody ?? '{}') as {
        code?: unknown;
        error?: unknown;
      };
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // A body that is not JSON says nothing useful; the status still does.
    }
    return new InvoiceRefundError(code || 'unknown', message);
  }
  return new InvoiceRefundError('unknown', '');
}
