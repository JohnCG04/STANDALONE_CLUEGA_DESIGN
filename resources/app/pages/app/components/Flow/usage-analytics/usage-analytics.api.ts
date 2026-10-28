// The REAL Usage Analytics client. Four reads, three endpoints:
//
//   GET /api/v1/usage-analytics          → the four KPI cards
//   GET /api/v1/usage-analytics/series   → all three chart blocks, one request
//   GET /api/v1/usage-analytics/facets   → the filter vocabularies
//   GET /api/v1/ai-spend                 → the generations ledger, cursor-paged
//
// Every read but the ledger carries `type` — the bucket the window's span asks
// for (hour under a week, day up to ~2 months, month beyond; see
// lib/flow/usage-analytics/timeRange). The backend groups by it and answers with
// one record per bucket, so the `date` on a series point is an hour, a day or a
// month key depending on what was asked, and nothing here re-buckets it.
//
// Two things about the backend shape are load-bearing here:
//
// 1. `/series` returns the per-model curves, the per-model totals and the daily
//    totals TOGETHER, because they are three views of one aggregate. So this
//    module issues one request and the three blocks select from its answer —
//    that is where the page's fetch budget went from four requests to two.
//
// 2. `/ai-spend` is keyset-paged (created_at, job_id) with opaque cursors and no
//    total count: a job's fan-out siblings share a millisecond, so a page bound
//    on the timestamp alone silently skipped them. There is therefore no page
//    number and no "page 7 of 12" to render — prev/next only.
//
// Credits are mid-platform wallet TOKENS end to end. The backend's own numbers
// are floors it declares in `coverage`: `credits_out` excludes AI chat turns
// (not booked in the cost book) and `credits_in` misses a recharge credited
// inside mid-platform (invisible to that service). Nothing here inflates them.

import { cdpFetch, cdpFetchPaginated } from "@/lib/cdp/fetch";

import { formatActionLabel } from "@/lib/flow/usage-analytics/actionLabel";
import { formatModelLabel } from "@/lib/flow/usage-analytics/modelLabel";
import { toBucketKey, type UsageDateWindow } from "@/lib/flow/usage-analytics/timeRange";

import type {
  CreditsSummary,
  CreditsSummaryDay,
  Generation,
  GenerationCreditOutcome,
  GenerationPlatform,
  GenerationStatus,
  ModelUsageSeries,
  ModelUsageTotal,
  UsageFacets,
  UsageOverview,
} from "./usage-analytics.service";

const USAGE_ANALYTICS_PATH = "/api/v1/usage-analytics";
const USAGE_SERIES_PATH = "/api/v1/usage-analytics/series";
const USAGE_FACETS_PATH = "/api/v1/usage-analytics/facets";
const AI_SPEND_PATH = "/api/v1/ai-spend";

/** One page of the ledger. 20 rows is the table's own page size. */
export const GENERATIONS_PAGE_LIMIT = 20;

// --- Request params -------------------------------------------------------

/**
 * The filters the API accepts. SINGLE-valued per facet, deliberately: the
 * backend matches one model / one action / one member, and sending an array
 * would silently apply only part of a selection. The UI state clamps each facet
 * to one value for the same reason — see useUsageUiState.
 */
export interface UsageApiFilters {
  userId?: string;
  action?: string;
  model?: string;
}

export interface UsageApiRangeParams extends UsageApiFilters {
  window: UsageDateWindow;
  signal?: AbortSignal;
}

export interface UsageApiGenerationsParams extends UsageApiRangeParams {
  /** Opaque cursor from a previous page. Empty means the newest page. */
  cursor?: string;
  /** Which side of the cursor to read. "next" walks toward OLDER rows. */
  direction?: "next" | "prev";
  limit?: number;
}

/** The tenant's own zone, so the day buckets match the dates the pill asked for. */
function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The range every read shares.
 *
 * `all_time` sends no start_date; the API then applies its own lookback, which
 * is the honest answer — this service cannot promise "everything" over a book it
 * bounds for its own protection.
 */
function rangeParams(params: UsageApiRangeParams): Record<string, string | number> {
  const search: Record<string, string | number> = {
    end_date: params.window.end_date,
    timezone: timezone(),
    // The GRANULARITY the answer is grouped at — hour, day or month, decided
    // from the span of the window (resolveBucket). The client never re-buckets
    // what comes back: rolling days into months in the browser means
    // downloading a quarter of days to draw three bars, and the rolled figure
    // would disagree with the KPI cards the moment a bucket is partly synced.
    type: params.window.bucket,
  };
  if (params.window.start_date) search.start_date = params.window.start_date;
  if (params.userId) search.user_id = params.userId;
  if (params.action) search.action = params.action;
  if (params.model) search.model = params.model;
  return search;
}

/**
 * The same window as the half-open UTC instants `/ai-spend` takes.
 *
 * That endpoint is the row list, not a dashboard: it filters on `from`/`to`
 * RFC3339 rather than on calendar dates, so sending start_date/end_date to it
 * would be silently ignored and every page would come back over the API's own
 * default lookback instead of the selected range.
 *
 * Built from LOCAL date parts on purpose. The dates in the window are local
 * (see timeRange.toIsoDate) and the timezone this module sends is the browser's
 * own, so constructing midnight locally and letting toISOString shift it is the
 * one conversion that keeps the ledger's range identical to the charts'.
 */
function rangeToUtcBounds(
  // The DAYS only: the ledger lists rows, so it has nothing to group and takes
  // no bucket.
  window: Pick<UsageDateWindow, "start_date" | "end_date">,
): { from?: string; to: string } {
  const startOfLocalDay = (date: string, dayOffset = 0): Date => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, (day ?? 1) + dayOffset, 0, 0, 0, 0);
  };
  return {
    ...(window.start_date
      ? { from: startOfLocalDay(window.start_date).toISOString() }
      : {}),
    // `end_date` is inclusive for the caller, and `to` is exclusive: the bound
    // is the start of the following day, or the last day loses its rows.
    to: startOfLocalDay(window.end_date, 1).toISOString(),
  };
}

// --- Wire shapes ----------------------------------------------------------

interface UsageAnalyticsWire {
  total_jobs?: number;
  credits_in?: number | null;
  credits_out?: number;
  current_credits?: number | null;
}

interface SeriesPointWire {
  date?: string;
  credits_out?: number;
  jobs?: number;
}

interface SeriesModelWire {
  model?: string;
  jobs?: number;
  credits_out?: number;
  points?: SeriesPointWire[];
}

interface SeriesDayWire {
  date?: string;
  credits_out?: number;
  jobs?: number;
}

interface CreditsInDayWire {
  date?: string;
  credits_in?: number;
  by_kind?: Record<string, number>;
}

interface UsageSeriesWire {
  models?: SeriesModelWire[];
  days?: SeriesDayWire[];
  /** null when a filter makes it unanswerable, or the ledger read failed. */
  credits_in_by_day?: CreditsInDayWire[] | null;
}

interface UsageFacetWire {
  value?: string;
  jobs?: number;
  credits_out?: number;
}

interface UsageFacetsWire {
  models?: UsageFacetWire[];
  actions?: UsageFacetWire[];
  users?: UsageFacetWire[];
}

interface AISpendRowWire {
  job_id?: string;
  surface?: string;
  action?: string;
  model?: string;
  user_id?: string;
  status?: string;
  credits_out?: number;
  created_at?: string;
  finished_at?: string;
}

interface AISpendPaginationWire {
  next_cursor?: string;
  prev_cursor?: string;
  has_next?: boolean;
  has_prev?: boolean;
  limit?: number;
}

// --- Public shapes --------------------------------------------------------

/** Everything the three chart blocks draw, from one read. */
export interface UsageSeriesBundle {
  /** Per-model curves, densified over the window's day axis. */
  series: ModelUsageSeries[];
  /** Per-model totals for the ranked list. */
  totals: ModelUsageTotal[];
  /** The stacked daily bars. */
  summary: CreditsSummary;
}

/** One keyset page of the ledger. No total count — see the header note. */
export interface GenerationsPage {
  items: Generation[];
  nextCursor: string;
  prevCursor: string;
  hasNext: boolean;
  hasPrev: boolean;
  limit: number;
}

/** The API-backed source the page reads. */
export interface UsageApiSource {
  getOverview(params: UsageApiRangeParams): Promise<UsageOverview>;
  getSeries(params: UsageApiRangeParams): Promise<UsageSeriesBundle>;
  getFacets(params: UsageApiRangeParams): Promise<UsageFacets>;
  listGenerations(params: UsageApiGenerationsParams): Promise<GenerationsPage>;
}

// --- Mapping --------------------------------------------------------------

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `has_any_activity` has no endpoint: the API answers for a WINDOW, and an
 * all-time flag would be a second read on every page load. Derived from the
 * window instead, which is right for the case the flag exists for — a
 * brand-new account has no activity in any window — and wrong only for an
 * account that was busy last year and idle since, which sees the welcome
 * state until it picks a wider range.
 */
function derivedActivity(wire: UsageAnalyticsWire): boolean {
  return (
    toCount(wire.total_jobs) > 0 ||
    toCount(wire.credits_out) > 0 ||
    toCount(wire.credits_in) > 0
  );
}

/**
 * The bucket axis a chart draws, oldest first.
 *
 * The keys are whatever the requested `type` returns — `2026-09` for a month,
 * `2026-09-13` for a day, an RFC3339 instant for an hour — and they are sorted
 * as STRINGS, which is chronological for all three shapes.
 */
function dayAxis(wire: UsageSeriesWire, window: UsageDateWindow): string[] {
  const days = (wire.days ?? [])
    .map((day) => String(day?.date ?? ""))
    .filter((date) => date !== "");
  if (days.length > 0) return [...days].sort();
  // A window with no activity still needs an axis, or the chart has no ground
  // to draw an empty state against — in the same shape the bucket would have
  // come back in, so the labels read the same as a populated window's.
  const end = toBucketKey(window.end_date, window.bucket);
  if (!window.start_date) return [end];
  const start = toBucketKey(window.start_date, window.bucket);
  return start === end ? [start] : [start, end];
}

/**
 * Densifies one model's curve over the shared axis.
 *
 * A bucket the model did not run in is a measured ZERO, not a gap: the backend
 * only returns buckets that exist, and leaving those out would make Chart.js
 * join two distant points into a line that claims usage in between. (null is
 * reserved for "not synced", which this backend never reports.)
 */
function densify(model: SeriesModelWire, axis: readonly string[]): ModelUsageSeries {
  const byDate = new Map<string, number>();
  for (const point of model.points ?? []) {
    byDate.set(String(point?.date ?? ""), toCount(point?.credits_out));
  }
  const id = String(model.model ?? "");
  return {
    modelId: id,
    modelName: modelDisplayName(id),
    points: axis.map((date) => ({ date, credits: byDate.get(date) ?? 0 })),
  };
}

/**
 * The label for spend the cost book never learned a model for — a charge the
 * billing bridge booked alone. Shown rather than dropped: those credits really
 * left the wallet, and hiding them would make the chart disagree with the KPI
 * card above it.
 */
export const UNATTRIBUTED_MODEL = "—";

/**
 * What a block PRINTS for a wire model id.
 *
 * The book stores the id the caller sent, so one house arrives under several
 * spellings — bare from the host's default, router-prefixed from a model picked
 * in the workflow editor. formatModelLabel drops the router and prints
 * "Google - Gemini 3 Pro Image", so the same model reads the same everywhere.
 * The raw id is kept on `modelId`, which is what the filters send back.
 */
function modelDisplayName(id: string): string {
  return id === "" ? UNATTRIBUTED_MODEL : formatModelLabel(id) || UNATTRIBUTED_MODEL;
}

/**
 * What a block PRINTS for a wire action id.
 *
 * The book stores the verb the job performed — "image.generate" — and the set
 * is open, so this is a rewrite of the spelling, never a lookup that can fail:
 * formatActionLabel prints an action it has never seen. The raw value stays on
 * `featureId`, which is what the facet sends back as the `action` filter.
 */
function actionDisplayName(action: string): string {
  return action === "" ? UNATTRIBUTED_MODEL : formatActionLabel(action) || UNATTRIBUTED_MODEL;
}

function toModelTotal(model: SeriesModelWire): ModelUsageTotal {
  const id = String(model.model ?? "");
  return {
    modelId: id,
    modelName: modelDisplayName(id),
    credits: toCount(model.credits_out),
    jobs: toCount(model.jobs),
  };
}

/**
 * The stacked bars: consumption from the cost book, the credits that came in
 * from the local ledger, split by the kind the backend actually observed.
 *
 * `subscription` is the monthly plan allowance and `topup` a recharge — both
 * accurate names for what the ledger books. `community` and `expired` stay ZERO
 * because nothing in this system observes them; they are no longer drawn (see
 * CREDITS_SOURCES) rather than shown as a permanent zero that reads as a
 * measurement.
 */
function toSummary(wire: UsageSeriesWire, axis: readonly string[]): CreditsSummary {
  const consumption = new Map<string, number>();
  for (const day of wire.days ?? []) {
    consumption.set(String(day?.date ?? ""), toCount(day?.credits_out));
  }
  const credits = new Map<string, Record<string, number>>();
  for (const day of wire.credits_in_by_day ?? []) {
    credits.set(String(day?.date ?? ""), day?.by_kind ?? {});
  }
  const days: CreditsSummaryDay[] = axis.map((date) => {
    const byKind = credits.get(date) ?? {};
    return {
      date,
      consumption: consumption.get(date) ?? 0,
      subscription: toCount(byKind.monthly_free),
      topup: toCount(byKind.recharge),
      refund: toCount(byKind.refund),
      community: 0,
      expired: 0,
    };
  });
  return {
    days,
    totalConsumed: days.reduce((sum, day) => sum + day.consumption, 0),
    totalAdded: days.reduce(
      (sum, day) => sum + day.subscription + day.topup + day.refund,
      0,
    ),
    totalExpired: 0,
  };
}

const STATUS_BY_WIRE: Record<string, GenerationStatus> = {
  succeeded: "completed",
  failed: "failed",
  // A pause is its own outcome: reading it as a failure invites a retry nobody needs.
  stopped: "stopped",
  queued: "processing",
  running: "processing",
};

/**
 * The ledger row as the table reads it.
 *
 * `credits` is NEGATIVE here: the table paints a deduction in red and an
 * addition in green, and every row of this book is money leaving the wallet.
 * The outcome follows the same fact — a job that moved nothing is "free"
 * (a failure that settled at zero), and "refunded" never appears because a
 * refund is keyed to a charge rather than to a job, so it is credits IN and
 * belongs to the summary block, not to a row here.
 */
function toGeneration(row: AISpendRowWire): Generation {
  const creditsOut = toCount(row.credits_out);
  const model = String(row.model ?? "");
  const action = String(row.action ?? "");
  const userId = String(row.user_id ?? "");
  const outcome: GenerationCreditOutcome = creditsOut > 0 ? "charged" : "free";
  return {
    id: String(row.job_id ?? ""),
    // finished_at when the job ended, created_at while it is still running: the
    // column is "completed", and a running row has no completion to show.
    completedAt: String(row.finished_at ?? row.created_at ?? ""),
    modelId: model,
    modelName: modelDisplayName(model),
    featureId: action,
    featureName: actionDisplayName(action),
    status: STATUS_BY_WIRE[String(row.status ?? "")] ?? "completed",
    userId,
    // The book stores the member's id, not a display name — this service has no
    // user directory. The id is shown rather than a blank cell.
    userName: userId,
    credits: creditsOut > 0 ? -creditsOut : 0,
    creditOutcome: outcome,
    platform: platformOf(String(row.surface ?? "")),
  };
}

/**
 * The "platform" column, derived from the surface the generation came from.
 *
 * The book records WHERE a generation was asked for, not which client binary
 * asked: a server-side workflow run is the web app's Run button, and anything
 * else reaching the billing bridge without a run came in through the API.
 */
function platformOf(surface: string): GenerationPlatform {
  return surface === "workflow_run" ? "web" : "api";
}

function toFacets(wire: UsageFacetsWire): UsageFacets {
  // `label` renames the OPTION only. The id stays the wire value, because it is
  // what the picker sends back as the `model` / `action` / `user_id` filter.
  const options = (
    values: UsageFacetWire[] | undefined,
    label: (value: string) => string = (value) => value,
  ) =>
    (values ?? [])
      .map((value) => String(value?.value ?? ""))
      .filter((value) => value !== "")
      .map((value) => ({ id: value, name: label(value) }));
  return {
    models: options(wire.models, modelDisplayName),
    features: options(wire.actions, actionDisplayName),
    users: options(wire.users),
    // Derived, not served: the two values platformOf can produce.
    platforms: ["web", "api"],
  };
}

// --- The source -----------------------------------------------------------

/** Wires the page to the real endpoints. */
export function createApiUsageAnalyticsSource(): UsageApiSource {
  return {
    async getOverview(params) {
      const wire = await cdpFetch<UsageAnalyticsWire>(USAGE_ANALYTICS_PATH, {
        searchParams: rangeParams(params),
        signal: params.signal,
      });
      return {
        totalJobs: toCount(wire.total_jobs),
        creditsIn: toCount(wire.credits_in),
        creditsOut: toCount(wire.credits_out),
        hasAnyActivity: derivedActivity(wire),
      };
    },

    async getSeries(params) {
      const wire = await cdpFetch<UsageSeriesWire>(USAGE_SERIES_PATH, {
        searchParams: rangeParams(params),
        signal: params.signal,
      });
      const axis = dayAxis(wire, params.window);
      const models = wire.models ?? [];
      return {
        series: models.map((model: SeriesModelWire) => densify(model, axis)),
        totals: models.map(toModelTotal),
        summary: toSummary(wire, axis),
      };
    },

    async getFacets(params) {
      const wire = await cdpFetch<UsageFacetsWire>(USAGE_FACETS_PATH, {
        searchParams: rangeParams(params),
        signal: params.signal,
      });
      return toFacets(wire);
    },

    async listGenerations(params) {
      // The ledger takes instants, not calendar dates — see rangeToUtcBounds.
      const bounds = rangeToUtcBounds(params.window);
      const search: Record<string, string | number> = {
        ...(bounds.from ? { from: bounds.from } : {}),
        to: bounds.to,
        limit: params.limit ?? GENERATIONS_PAGE_LIMIT,
      };
      if (params.userId) search.user_id = params.userId;
      if (params.action) search.action = params.action;
      if (params.model) search.model = params.model;
      // One cursor parameter, never both: the API rejects that pair rather than
      // guessing, so a client bug reads as a 400 instead of as missing rows.
      if (params.cursor) {
        search[params.direction === "prev" ? "prev_cursor" : "next_cursor"] = params.cursor;
      }
      // The paginated envelope, not the plain one: the cursors and the two
      // has-more flags live in `pagination`, and they are the whole pager.
      const { data, pagination } = await cdpFetchPaginated<
        AISpendRowWire[],
        AISpendPaginationWire
      >(AI_SPEND_PATH, { searchParams: search, signal: params.signal });
      const rows = Array.isArray(data) ? data : [];
      return {
        items: rows.map(toGeneration),
        nextCursor: String(pagination?.next_cursor ?? ""),
        prevCursor: String(pagination?.prev_cursor ?? ""),
        hasNext: pagination?.has_next === true,
        hasPrev: pagination?.has_prev === true,
        limit: toCount(pagination?.limit) || (params.limit ?? GENERATIONS_PAGE_LIMIT),
      };
    },
  };
}

// Exported for the tests: the mapping IS the contract with the backend, and it
// is the part that breaks silently when a field is renamed.
export const usageApiMapping = {
  rangeToUtcBounds,
  derivedActivity,
  dayAxis,
  densify,
  toModelTotal,
  toSummary,
  toGeneration,
  toFacets,
  platformOf,
};
