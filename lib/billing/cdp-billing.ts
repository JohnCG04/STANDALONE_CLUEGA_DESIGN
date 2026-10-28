import { cdpApiConfig } from "@/config/cdp-api";
import { cdpFetch, getActiveTeamId } from "@/lib/ai-agent/cluega-session-auth";
import type { BudgetScope } from "@/components/settings/tabs/budgetStatus";

/** Tenant CDP token wallet balance (mirrors the backend ModuleBalance DTO). */
export interface WalletBalance {
  officialTokenBalance: number;
  temporaryTokenBalance: number;
  tokenBalance: number;
  temporaryExpiresAt: string | null;
}

/** A purchasable token package (subset of mid-platform's package shape). */
export interface TokenPackage {
  id: string;
  name: string;
  priceUsd: number | null;
  totalToken: number | null;
  baseToken: number | null;
  giftToken: number | null;
  description: string | null;
}

/** A created recharge order awaiting payment confirmation. */
export interface RechargeOrder {
  orderNo: string | null;
  paymentStatus: string | null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${res.status}`);
  }
  return (body.data ?? (body as unknown as T)) as T;
}

/** getWalletBalance reads the tenant's CDP token wallet balance. */
export async function getWalletBalance(signal?: AbortSignal): Promise<WalletBalance> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/wallet/balance`, {
    cache: "no-store",
    signal,
  });
  const raw = await unwrap<Record<string, unknown>>(res);
  return {
    officialTokenBalance: toNumber(raw.official_token_balance) ?? 0,
    temporaryTokenBalance: toNumber(raw.temporary_token_balance) ?? 0,
    tokenBalance: toNumber(raw.token_balance) ?? 0,
    temporaryExpiresAt: toString(raw.temporary_token_expires_at),
  };
}

/** getBudgetStatus reads the tenant's ad-spend caps and how much of each is
 *  used. Amounts come back as decimal STRINGS denominated in each scope's own
 *  currency — deliberately not parsed into numbers here, because the boundary
 *  Core enforces is an exact decimal and the screen must show that exact value.
 *
 *  A tenant with no budget configured gets an empty `scopes` list, which is not
 *  an error: an unconfigured cap denies nothing. */
export async function getBudgetStatus(): Promise<BudgetScope[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/budget/status`, {
    cache: "no-store",
  });
  const raw = await unwrap<Record<string, unknown>>(res);
  const scopes = Array.isArray(raw.scopes) ? raw.scopes : [];
  return scopes.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      scope: r.scope === "advertiser" ? "advertiser" : "tenant",
      // Core omits advertiser_id on a tenant-wide scope; normalise the helper's
      // null to undefined so the optional field means one thing, not two.
      advertiser_id: toString(r.advertiser_id) ?? undefined,
      currency: toString(r.currency) ?? "",
      period_start: toString(r.period_start) ?? "",
      period_end: toString(r.period_end) ?? "",
      budget_amount: toString(r.budget_amount) ?? "0",
      spent_amount: toString(r.spent_amount) ?? "0",
      remaining_amount: toString(r.remaining_amount) ?? "0",
      hard_stop: r.hard_stop === true,
      allowed: r.allowed !== false,
    } satisfies BudgetScope;
  });
}

/** getTokenPackages lists the packages the tenant can purchase for the CDP wallet. */
export async function getTokenPackages(): Promise<TokenPackage[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/billing/token-packages`, {
    cache: "no-store",
  });
  const raw = await unwrap<unknown>(res);
  // Mid-platform returns { packages: [...] }; tolerate { items: [...] } / a bare array too.
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as { packages?: unknown[] }).packages ??
        (raw as { items?: unknown[] }).items ??
        [])
      : [];
  return list
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      id: String(p.package_id ?? p.id ?? ""),
      name: typeof p.name === "string" ? p.name : "",
      priceUsd: toNumber(p.price_usd),
      totalToken: toNumber(p.total_token),
      baseToken: toNumber(p.base_token),
      giftToken: toNumber(p.gift_token),
      description: toString(p.description),
    }))
    .filter((p) => p.id !== "");
}

/** createRechargeOrder submits a recharge order for a package. Payment is
 *  confirmed out-of-band (ops mark-paid / future gateway webhook). */
export async function createRechargeOrder(packageId: string): Promise<RechargeOrder> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/billing/recharge-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package_id: packageId }),
  });
  const raw = await unwrap<Record<string, unknown>>(res);
  return {
    orderNo: toString(raw.order_no),
    paymentStatus: toString(raw.payment_status),
  };
}

/** Dunning/account-status info for the tenant (may be absent if not yet computed upstream). */
export interface DunningStatus {
  stage: string;
  suspended: boolean;
  fullStop: boolean;
}

/** The CDP module's active plan/subscription, if any. */
export interface CdpPlanSummary {
  planCode: string | null;
  packageName: string | null;
  priceUsd: number | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  creditsAvailable: number | null;
  creditsTotal: number | null;
  /** The credit the plan grants each cycle; null if unknown or a token package sets the total. */
  creditsCycleQuota: number | null;
  /** When that cycle ends (RFC 3339): a monthly boundary even on an annual plan. */
  creditsCycleEndsAt: string | null;
}

/** The next invoice due, if one is upcoming. */
export interface UpcomingInvoice {
  status: string | null;
  totalUsd: number | null;
  amountDueUsd: number | null;
  dueAt: string | null;
}

/** Tenant billing overview: dunning status, CDP plan, and the next invoice. */
export interface BillingSummary {
  dunning: DunningStatus | null;
  plan: CdpPlanSummary | null;
  upcomingInvoice: UpcomingInvoice | null;
}

function toDunning(raw: unknown): DunningStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    stage: typeof r.stage === "string" ? r.stage : "current",
    suspended: r.suspended === true,
    fullStop: r.full_stop === true,
  };
}

/** Empty billing overview for tenants that have not been onboarded to billing
 *  yet (mid-platform returns 404 "billing account not found"). */
const EMPTY_BILLING_SUMMARY: BillingSummary = { dunning: null, plan: null, upcomingInvoice: null };

/** getBillingSummary reads the tenant's dunning status, CDP plan, and upcoming invoice.
 *  A 404 means the tenant has no billing account yet (not onboarded) — treated as
 *  an empty overview rather than an error, so the billing tab renders cleanly. */
export async function getBillingSummary(): Promise<BillingSummary> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/billing/summary`, { cache: "no-store" });
  if (res.status === 404) return EMPTY_BILLING_SUMMARY;
  const raw = await unwrap<Record<string, unknown>>(res);

  const modulePlans = Array.isArray(raw.module_plans) ? (raw.module_plans as Record<string, unknown>[]) : [];
  // The self-serve plan-lifecycle actions (start/cancel trial, downgrade) apply to
  // the CDP module's plan. Core's module_code for it is uppercase "CDP" — it was
  // "AI" until the 2026-09-03 standardization, which retired that module because
  // every CDP charge drains the CDP wallet, leaving an AI-granted quota unspendable.
  const cdpPlan = modulePlans.find((p) => p.module_code === "CDP") ?? null;
  const plan: CdpPlanSummary | null = cdpPlan
    ? {
        planCode: toString(cdpPlan.plan_code),
        packageName: toString(cdpPlan.package_name),
        priceUsd: toNumber(cdpPlan.price_usd),
        subscriptionStatus: toString(cdpPlan.subscription_status),
        currentPeriodEnd: toString(cdpPlan.current_period_end),
        creditsAvailable: toNumber(cdpPlan.credits_available),
        creditsTotal: toNumber(cdpPlan.credits_total),
        creditsCycleQuota: toNumber(cdpPlan.credits_cycle_quota),
        creditsCycleEndsAt: toString(cdpPlan.credits_cycle_ends_at),
      }
    : null;

  const upcoming = raw.upcoming_invoice as Record<string, unknown> | null | undefined;
  const upcomingInvoice: UpcomingInvoice | null = upcoming
    ? {
        status: toString(upcoming.status),
        totalUsd: toNumber(upcoming.total_usd),
        amountDueUsd: toNumber(upcoming.amount_due_usd),
        dueAt: toString(upcoming.due_at),
      }
    : null;

  return { dunning: toDunning(raw.dunning), plan, upcomingInvoice };
}

/**
 * How long a fetched summary is reused.
 *
 * A plan, a dunning state and an upcoming invoice are not figures that move while
 * someone reads them: they change when a payment settles or an admin changes the
 * plan, both of which are far apart in time.
 */
const SUMMARY_FRESH_MS = 60_000;

/** How long a FAILURE is remembered. Short, so a flaky upstream recovers on its
 *  own — this endpoint has been seen answering 502 intermittently. */
const SUMMARY_FAILED_MS = 15_000;

interface SummaryCacheEntry {
  /** null when the last attempt failed. */
  value: BillingSummary | null;
  at: number;
  /** The team it belongs to — the request carries X-Team-Id. */
  team: string | null;
}

let summaryCache: SummaryCacheEntry | null = null;
let summaryInFlight: Promise<BillingSummary | null> | null = null;
let summaryInFlightTeam: string | null = null;

/** Test seam: forget everything cached. */
export function resetBillingSummaryCache(): void {
  summaryCache = null;
  summaryInFlight = null;
  summaryInFlightTeam = null;
}

/**
 * getBillingSummary, but shared and briefly cached. Returns null when the request
 * failed, so callers can tell "no billing account" (an empty summary) apart from
 * "we could not ask".
 *
 * Three surfaces read this — the settings modal header, the Profile tab and the
 * Usage & Billing tab — and the modal opens on a tab, so two of them fire in the
 * same tick. Sharing the open request is what collapses that pair; the window is
 * what stops each later tab switch from asking again.
 *
 * Keyed on the active team, because billing is per tenant and the request carries
 * X-Team-Id: reusing one team's summary for another would quote the wrong plan.
 */
export async function readBillingSummary(
  now: number = Date.now(),
): Promise<BillingSummary | null> {
  const team = getActiveTeamId();
  if (summaryCache && summaryCache.team === team) {
    const ttl = summaryCache.value ? SUMMARY_FRESH_MS : SUMMARY_FAILED_MS;
    if (now - summaryCache.at < ttl) return summaryCache.value;
  }
  if (summaryInFlight && summaryInFlightTeam === team) return summaryInFlight;

  // Stamped with the request's START time, so `now` stays meaningful for callers
  // that pass one.
  const request = getBillingSummary()
    .then((summary) => {
      summaryCache = { value: summary, at: now, team };
      return summary;
    })
    .catch((): BillingSummary | null => {
      summaryCache = { value: null, at: now, team };
      return null;
    });
  summaryInFlight = request;
  summaryInFlightTeam = team;
  // Only clear the marker if it is still THIS request: a team switch mid-flight
  // starts a second one, and whichever lands first must not clear the other's.
  void request.finally(() => {
    if (summaryInFlight === request) {
      summaryInFlight = null;
      summaryInFlightTeam = null;
    }
  });
  return request;
}
