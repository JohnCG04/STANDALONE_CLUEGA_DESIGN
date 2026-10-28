// The Usage Analytics view MODEL: the types every block renders from, and the
// coercions that keep a renamed wire field from becoming a confident zero.
//
// The page no longer reads through this module's source seam — it reads the real
// endpoints, in usage-analytics.api.ts:
//
//   GET /api/v1/usage-analytics          → the four KPI cards
//   GET /api/v1/usage-analytics/series   → all three chart blocks, one request
//   GET /api/v1/usage-analytics/facets   → the filter vocabularies
//   GET /api/v1/ai-spend                 → the ledger, keyset-paged
//
// `UsageAnalyticsSource` and the seeded mock (usage-analytics.mock.ts) stay for
// what they are still good for: a deterministic ledger to develop and test the
// view math against without a backend. Nothing in the running page reads them.
//
// Figure definitions (one source of truth, so no two blocks can disagree):
//   credits_in   = topup + subscription + community additions in the window
//   credits_out  = design-job consumption + expired credits in the window
//   Credits Summary's total_consumed is job consumption ONLY — expiry is its
//   own figure, never folded in (US-04's "hết hạn" rule).
//
// Current Credits deliberately has NO endpoint here: it is the live wallet/plan
// figure, read from the REAL readWalletBalance()/readBillingSummary() pair.

import { createMockUsageAnalyticsSource } from "./usage-analytics.mock";

// --- Envelope & pagination (mirror FlowEnvelope/FlowPagination; declared here
// rather than imported so a mock-only feature does not couple to Flow's
// transport stack) ---

export interface UsagePagination {
  page_no: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface UsageEnvelope<T> {
  data: T;
  pagination?: UsagePagination;
}

// --- Shared params ---

/** Inclusive `YYYY-MM-DD` bounds; a null start means "all time". */
export interface UsageRangeParams {
  start_date: string | null;
  end_date: string;
  signal?: AbortSignal;
}

/** Facet filters. Absence means "all" — an omitted filter and an empty one are
 *  the same thing, so builders must drop empty arrays rather than send them. */
export interface UsageSeriesFilters {
  user_ids?: string[];
  feature_ids?: string[];
  model_ids?: string[];
}

// --- Types (mirror the API data models; snake_case = wire) ---

export interface UsageOverviewWire {
  total_jobs?: number;
  credits_in?: number;
  credits_out?: number;
  /** All-time, not range-scoped: drives the brand-new-account empty state. */
  has_any_activity?: boolean;
}

export interface UsageOverview {
  totalJobs: number;
  creditsIn: number;
  creditsOut: number;
  hasAnyActivity: boolean;
}

export interface UsageSeriesPointWire {
  date?: string;
  /** null = day not yet synced. Distinct from 0, which is a measured fact. */
  credits?: number | null;
}

export interface ModelUsageSeriesWire {
  model_id?: string;
  model_name?: string;
  points?: UsageSeriesPointWire[];
}

export interface UsageSeriesPoint {
  date: string;
  credits: number | null;
}

export interface ModelUsageSeries {
  modelId: string;
  modelName: string;
  points: UsageSeriesPoint[];
}

export interface ModelUsageTotalWire {
  model_id?: string;
  model_name?: string;
  credits?: number;
  jobs?: number;
}

/** Per-model consumption in the window. The ranked list's % is CLIENT-derived
 *  (computeModelShares) so the rows always sum to 100. */
export interface ModelUsageTotal {
  modelId: string;
  modelName: string;
  credits: number;
  jobs: number;
}

export interface CreditsSummaryDayWire {
  date?: string;
  consumption?: number;
  topup?: number;
  subscription?: number;
  community?: number;
  /** Credits returned by a reversal — an addition, not a negative consumption. */
  refund?: number;
  /** Its own field — never folded into consumption. */
  expired?: number;
}

export interface CreditsSummaryDay {
  date: string;
  consumption: number;
  topup: number;
  subscription: number;
  community: number;
  refund: number;
  expired: number;
}

export interface CreditsSummaryWire {
  days?: CreditsSummaryDayWire[];
  total_consumed?: number;
  total_added?: number;
  total_expired?: number;
}

export interface CreditsSummary {
  days: CreditsSummaryDay[];
  totalConsumed: number;
  totalAdded: number;
  totalExpired: number;
}

/** `stopped`: the user paused the run — neither a success nor a failure. */
export type GenerationStatus = "completed" | "failed" | "processing" | "stopped";
export type GenerationPlatform = "web" | "api" | "mobile";
export type GenerationCreditOutcome = "charged" | "refunded" | "free";

export interface GenerationWire {
  id?: string;
  completed_at?: string;
  /** Empty on a pure credit event (topup / subscription / expiry rows). */
  model_id?: string;
  model_name?: string;
  feature_id?: string;
  feature_name?: string;
  status?: string;
  user_id?: string;
  user_name?: string;
  /** Negative = deducted, positive = added, 0 = held/refunded. */
  credits?: number;
  credit_outcome?: string;
  platform?: string;
}

export interface Generation {
  id: string;
  completedAt: string;
  modelId: string;
  modelName: string;
  featureId: string;
  featureName: string;
  status: GenerationStatus;
  userId: string;
  userName: string;
  credits: number;
  creditOutcome: GenerationCreditOutcome;
  platform: GenerationPlatform;
}

export const GENERATIONS_PAGE_SIZE = 20;

export interface ListGenerationsParams extends UsageRangeParams, UsageSeriesFilters {
  page_no?: number;
  limit?: number;
  platforms?: GenerationPlatform[];
  credit_outcomes?: GenerationCreditOutcome[];
}

export interface ListGenerationsResult {
  items: Generation[];
  pagination: UsagePagination;
}

export interface UsageFacetOptionWire {
  id?: string;
  name?: string;
}

export interface UsageFacetsWire {
  users?: UsageFacetOptionWire[];
  features?: UsageFacetOptionWire[];
  models?: UsageFacetOptionWire[];
  platforms?: string[];
}

export interface UsageFacetOption {
  id: string;
  name: string;
}

export interface UsageFacets {
  users: UsageFacetOption[];
  features: UsageFacetOption[];
  models: UsageFacetOption[];
  platforms: GenerationPlatform[];
}

// --- Normalizers (defensive: the mock routes its wire payloads through these
// too, so the coercions are exercised long before a real backend exists) ---

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeOverview(raw: UsageOverviewWire): UsageOverview {
  return {
    totalJobs: toCount(raw.total_jobs),
    creditsIn: toCount(raw.credits_in),
    creditsOut: toCount(raw.credits_out),
    hasAnyActivity: raw.has_any_activity === true,
  };
}

export function normalizeModelSeries(raw: ModelUsageSeriesWire): ModelUsageSeries {
  return {
    modelId: String(raw.model_id ?? ""),
    modelName: String(raw.model_name ?? raw.model_id ?? ""),
    points: (Array.isArray(raw.points) ? raw.points : []).map((point) => ({
      date: String(point?.date ?? ""),
      // null survives; anything unparseable also reads as "not synced" rather
      // than as a zero the chart would draw as a fact.
      credits:
        point?.credits == null
          ? null
          : Number.isFinite(Number(point.credits))
            ? Number(point.credits)
            : null,
    })),
  };
}

export function normalizeModelTotal(raw: ModelUsageTotalWire): ModelUsageTotal {
  return {
    modelId: String(raw.model_id ?? ""),
    modelName: String(raw.model_name ?? raw.model_id ?? ""),
    credits: toCount(raw.credits),
    jobs: toCount(raw.jobs),
  };
}

export function normalizeCreditsSummary(raw: CreditsSummaryWire): CreditsSummary {
  return {
    days: (Array.isArray(raw.days) ? raw.days : []).map((day) => ({
      date: String(day?.date ?? ""),
      consumption: toCount(day?.consumption),
      topup: toCount(day?.topup),
      subscription: toCount(day?.subscription),
      community: toCount(day?.community),
      refund: toCount(day?.refund),
      expired: toCount(day?.expired),
    })),
    totalConsumed: toCount(raw.total_consumed),
    totalAdded: toCount(raw.total_added),
    totalExpired: toCount(raw.total_expired),
  };
}

export function normalizeGeneration(raw: GenerationWire): Generation {
  const status: GenerationStatus =
    raw.status === "failed" || raw.status === "processing" || raw.status === "stopped"
      ? raw.status
      : "completed";
  const outcome: GenerationCreditOutcome =
    raw.credit_outcome === "refunded" || raw.credit_outcome === "free"
      ? raw.credit_outcome
      : "charged";
  const platform: GenerationPlatform =
    raw.platform === "api" || raw.platform === "mobile" ? raw.platform : "web";
  return {
    id: String(raw.id ?? ""),
    completedAt: String(raw.completed_at ?? ""),
    modelId: String(raw.model_id ?? ""),
    modelName: String(raw.model_name ?? ""),
    featureId: String(raw.feature_id ?? ""),
    featureName: String(raw.feature_name ?? ""),
    status,
    userId: String(raw.user_id ?? ""),
    userName: String(raw.user_name ?? ""),
    credits: toCount(raw.credits),
    creditOutcome: outcome,
    platform,
  };
}

function normalizeFacetOptions(raw: UsageFacetOptionWire[] | undefined): UsageFacetOption[] {
  return (Array.isArray(raw) ? raw : [])
    .map((option) => ({
      id: String(option?.id ?? ""),
      name: String(option?.name ?? option?.id ?? ""),
    }))
    .filter((option) => option.id !== "");
}

export function normalizeFacets(raw: UsageFacetsWire): UsageFacets {
  return {
    users: normalizeFacetOptions(raw.users),
    features: normalizeFacetOptions(raw.features),
    models: normalizeFacetOptions(raw.models),
    platforms: (Array.isArray(raw.platforms) ? raw.platforms : []).filter(
      (p): p is GenerationPlatform => p === "web" || p === "api" || p === "mobile",
    ),
  };
}

/** Fallback when an envelope omits pagination — same synthesis the Flow lists use. */
export function paginationFallback(
  pagination: UsagePagination | undefined,
  pageNo: number,
  limit: number,
  itemCount: number,
): UsagePagination {
  return (
    pagination ?? {
      page_no: pageNo,
      limit,
      total_items: itemCount,
      total_pages: itemCount > 0 ? 1 : 0,
    }
  );
}

// --- The swap seam ---

export interface UsageAnalyticsSource {
  getOverview(params: UsageRangeParams): Promise<UsageOverview>;
  getCreditsUsage(params: UsageRangeParams & UsageSeriesFilters): Promise<ModelUsageSeries[]>;
  getModelsUsage(params: UsageRangeParams & UsageSeriesFilters): Promise<ModelUsageTotal[]>;
  getCreditsSummary(params: UsageRangeParams): Promise<CreditsSummary>;
  listGenerations(params: ListGenerationsParams): Promise<ListGenerationsResult>;
  getFacets(signal?: AbortSignal): Promise<UsageFacets>;
}

let defaultSource: UsageAnalyticsSource | null = null;

/**
 * The seeded mock, for development and for the tests that exercise the view
 * math over a deterministic ledger. The page itself reads
 * createApiUsageAnalyticsSource() — see the header. Lazy rather than a module
 * constant: the mock imports this module's normalizers back, and creating the
 * source during evaluation would run mock code before its own consts exist.
 */
export function getDefaultUsageAnalyticsSource(): UsageAnalyticsSource {
  defaultSource ??= createMockUsageAnalyticsSource();
  return defaultSource;
}
