/**
 * What moved each headline number on a board, and why some were not explained.
 *
 * The dashboard lane decomposes every compared metric's change into per-campaign
 * contributions and ships them on the `dashboard_widgets` event as `drivers`
 * (CLUEGA_AI_CDP plan 2026-09-23 §P1.4). Until this file the front end never
 * read the field, so the only trace of the cause engine was one sentence of the
 * analyst's prose.
 *
 * Three parts, all pure:
 *   - `parseDashboardDrivers` — the wire shape, read defensively. A malformed
 *     row is dropped, never repaired, and nothing here throws: a board must
 *     render even when its explanation is broken.
 *   - `driversDisplay` / `formatDriverChange` — what the panel prints.
 *   - `driverActions` / `needsCreativeReview` — which next steps a row offers
 *     (plan §P4a; the budget move §P4b). Decided here so the panel cannot offer
 *     a write the data does not justify.
 *
 * Names come off the payload and ONLY off the payload. A campaign is never
 * named from the model's text, which is the whole point of showing this.
 */
import { formatMetric, isNonAdditiveMetric } from "@/components/dashboard/widgets/widgetFormat";
import { goodDirectionFor, type DashboardMetricMeta } from "@/lib/dashboard/vocabulary";
import { serviceIdFromKey } from "@/lib/integrations/catalog";
import {
  ACCOUNT_REPORT_PLATFORM_SERVICE_ID,
  isAccountReportPlatformSupported,
  type AccountReportPlatform,
} from "@/resources/app/pages/app/components/AccountReport/lib/account-report-route.lib";

type DriverEffect = "additive" | "entered" | "exited" | "mix_rate" | "unallocated";

interface DashboardDriver {
  /** Campaign id. "" only for `unallocated`, which is not a campaign. */
  id: string;
  /** Display name from the payload. "" only for `unallocated`. */
  name: string;
  effect: DriverEffect;
  /** This campaign's contribution to the metric's delta, in the delta's unit. */
  change: number | null;
  /** `mix_rate` only: the part from budget moving between campaigns … */
  mix?: number;
  /** … and the part from the campaign's own rate changing. */
  rate?: number;
  interaction?: number;
  lowVolume?: true;
}

interface DashboardDriverStage {
  stage: string;
  pushedMetric: "up" | "down" | "none";
}

interface DashboardMetricDrivers {
  metric: string;
  baseline: number | null;
  current: number | null;
  drivers: DashboardDriver[];
  stages: DashboardDriverStage[];
}

interface DashboardDriversWithheld {
  metric: string;
  /** Open-ended on the wire; unknown values display a generic reason. */
  reason: string;
}

export interface DashboardDrivers {
  metrics: DashboardMetricDrivers[];
  withheld: DashboardDriversWithheld[];
}

const EFFECTS: Record<DriverEffect, true> = {
  additive: true,
  entered: true,
  exited: true,
  mix_rate: true,
  unallocated: true,
};

const PUSHED: Record<DashboardDriverStage["pushedMetric"], true> = {
  up: true,
  down: true,
  none: true,
};

// ── Wire-parse helpers, shared with analysisClaims.ts ─────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `number | null` fields: a non-number is "not measured", never zero. */
export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Ids are strings on the wire; a numeric id is the same id, not a malformed one. */
export function idString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return numberOrNull(value) === null ? null : String(value);
}

export function member<T extends string>(table: Record<T, true>, value: unknown): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

/** Every row `parse` accepts; a non-array is no rows. */
export function rows<T>(value: unknown, parse: (raw: unknown) => T | null): T[] {
  return Array.isArray(value)
    ? value.map(parse).filter((row): row is T => row !== null)
    : [];
}

function parseDriver(raw: unknown): DashboardDriver | null {
  if (!isRecord(raw) || !member(EFFECTS, raw.effect)) return null;
  const effect = raw.effect;
  const unallocated = effect === "unallocated";
  const name = nonEmptyString(raw.name);
  // A campaign row with no name has nothing honest to print — the name is
  // never reconstructed from anywhere else.
  if (!name && !unallocated) return null;
  const id = idString(raw.id) ?? "";
  if (!id && !unallocated) return null;
  const driver: DashboardDriver = {
    id,
    name: name ?? "",
    effect,
    change: numberOrNull(raw.change),
  };
  if (effect === "mix_rate") {
    // The split IS the reading ("budget mix" vs "performance"); a mix_rate row
    // without both halves cannot be labelled either way, so it is malformed.
    const mix = numberOrNull(raw.mix);
    const rate = numberOrNull(raw.rate);
    if (mix === null || rate === null) return null;
    driver.mix = mix;
    driver.rate = rate;
    const interaction = numberOrNull(raw.interaction);
    if (interaction !== null) driver.interaction = interaction;
  }
  if (raw.low_volume === true) driver.lowVolume = true;
  return driver;
}

function parseStage(raw: unknown): DashboardDriverStage | null {
  if (!isRecord(raw)) return null;
  const stage = nonEmptyString(raw.stage);
  if (!stage) return null;
  return { stage, pushedMetric: member(PUSHED, raw.pushed_metric) ? raw.pushed_metric : "none" };
}

function parseMetric(raw: unknown): DashboardMetricDrivers | null {
  if (!isRecord(raw)) return null;
  const metric = nonEmptyString(raw.metric);
  if (!metric) return null;
  return {
    metric,
    baseline: numberOrNull(raw.baseline),
    current: numberOrNull(raw.current),
    drivers: rows(raw.drivers, parseDriver),
    stages: rows(raw.stages, parseStage),
  };
}

function parseWithheld(raw: unknown): DashboardDriversWithheld | null {
  if (!isRecord(raw)) return null;
  const metric = nonEmptyString(raw.metric);
  const reason = nonEmptyString(raw.reason);
  return metric && reason ? { metric, reason } : null;
}

/**
 * The `drivers` field of a `dashboard_widgets` payload, or undefined when it is
 * absent, not an object, or carries nothing usable. Never throws.
 */
export function parseDashboardDrivers(raw: unknown): DashboardDrivers | undefined {
  if (!isRecord(raw)) return undefined;
  const metrics = rows(raw.metrics, parseMetric);
  const withheld = rows(raw.withheld, parseWithheld);
  if (metrics.length === 0 && withheld.length === 0) return undefined;
  return { metrics, withheld };
}

// ── Display ────────────────────────────────────────────────────────────────

/** Suffixes of `dashboard.drivers.effect.*`. */
export type DriverEffectKey =
  | "mix"
  | "performance"
  | "volume"
  | "entered"
  | "exited"
  | "unallocated";

/** Suffixes of `dashboard.drivers.withheld.*`. */
type WithheldReasonKey =
  | "recent_conversions_incomplete"
  | "levels_disagree"
  | "entity_cap"
  | "population_narrowed"
  | "unknown";

const REASON_KEYS: Record<Exclude<WithheldReasonKey, "unknown">, true> = {
  recent_conversions_incomplete: true,
  levels_disagree: true,
  entity_cap: true,
  population_narrowed: true,
};

/** A wire effect (or, on an analysis fact, a part of a change) → its label.
 *  `mix_rate` is absent: which label it reads as depends on its split. */
export const EFFECT_KEY: Record<string, DriverEffectKey> = {
  mix: "mix",
  rate: "performance",
  additive: "volume",
  entered: "entered",
  exited: "exited",
  unallocated: "unallocated",
};

export interface DriverDisplayRow {
  id: string;
  /** "" for an unallocated row — the panel names it with its own label. */
  name: string;
  effectKey: DriverEffectKey;
  change: number | null;
  lowVolume: boolean;
  /**
   * Where this campaign's own rate sits against the ACCOUNT's baseline rate, in
   * raw numbers ("above" = a higher ROAS, and equally a higher CPA — which way
   * is good is the metric's business, decided in `driverActions`). Absent when
   * the payload does not settle it. See `rateVsAverage`.
   */
  vsAverage?: "above" | "below";
}

interface DriverMetricDisplay {
  metric: string;
  baseline: number | null;
  current: number | null;
  drivers: DriverDisplayRow[];
}

interface DriversDisplay {
  metrics: DriverMetricDisplay[];
  withheld: { metric: string; reasonKey: WithheldReasonKey }[];
}

/** Rows shown per metric. More than three stops being "what moved it". */
const DRIVER_ROWS_PER_METRIC = 3;

/**
 * How one driver reads. A `mix_rate` change is "mix" (budget shifted between
 * campaigns) when the mix part is at least as large as the rate part, else
 * "performance" (the campaign itself did better or worse).
 */
function driverEffectKey(driver: DashboardDriver): DriverEffectKey {
  if (driver.effect !== "mix_rate") return EFFECT_KEY[driver.effect];
  return Math.abs(driver.mix ?? 0) >= Math.abs(driver.rate ?? 0) ? "mix" : "performance";
}

function sign(value: number | null | undefined): -1 | 0 | 1 {
  return !value ? 0 : value > 0 ? 1 : -1;
}

/**
 * Whether a campaign's rate was above or below the account's baseline rate,
 * read off the decomposition's own terms (CLUEGA_AI_CDP `decompose.py`, with
 * `R⁰` the account's baseline ratio, `w` the campaign's share of the ratio's
 * denominator, `r` its own ratio):
 *
 *   entered:   change = w¹·(r¹ − R⁰)                    → sign(r¹ − R⁰) = sign(change)
 *   mix_rate:  mix = Δw·(r⁰ − R⁰), rate = w⁰·Δr, interaction = Δw·Δr
 *              w⁰ > 0 on a row that ran in both windows, so
 *              sign(Δw) = sign(rate)·sign(interaction), and
 *              sign(r⁰ − R⁰) = sign(mix)·sign(Δw)
 *
 * WHY NOT JUST "the mix pushed the metric the bad way → spend less". A bad mix
 * has two causes with OPPOSITE fixes: budget flowed TO a campaign worse than
 * average (lower it), or AWAY from one better than average (raise it back). The
 * sign of `mix` alone cannot tell them apart; the campaign's standing can, and
 * it is the same answer whichever way the budget moved. When a term the
 * derivation needs rounded to zero on the wire, the standing is left unknown
 * rather than guessed — the panel then suggests reviewing, not a direction.
 */
function rateVsAverage(driver: DashboardDriver): "above" | "below" | undefined {
  let standing = 0;
  if (driver.effect === "entered") standing = sign(driver.change);
  else if (driver.effect === "mix_rate")
    standing = sign(driver.mix) * sign(driver.rate) * sign(driver.interaction);
  return standing > 0 ? "above" : standing < 0 ? "below" : undefined;
}

/** Largest |change| first; an unmeasured change sorts after every measured one. */
function byMagnitude(a: DashboardDriver, b: DashboardDriver): number {
  if (a.change === null) return b.change === null ? 0 : 1;
  if (b.change === null) return -1;
  return Math.abs(b.change) - Math.abs(a.change);
}

/** What the drivers panel prints. Empty for absent drivers. */
export function driversDisplay(drivers: DashboardDrivers | undefined): DriversDisplay {
  if (!drivers) return { metrics: [], withheld: [] };
  const metrics: DriverMetricDisplay[] = [];
  for (const m of drivers.metrics) {
    if (m.drivers.length === 0) continue;
    metrics.push({
      metric: m.metric,
      baseline: m.baseline,
      current: m.current,
      drivers: [...m.drivers]
        .sort(byMagnitude)
        .slice(0, DRIVER_ROWS_PER_METRIC)
        .map((d) => {
          const vsAverage = rateVsAverage(d);
          return {
            id: d.id,
            name: d.name,
            effectKey: driverEffectKey(d),
            change: d.change,
            lowVolume: d.lowVolume === true,
            ...(vsAverage ? { vsAverage } : {}),
          };
        }),
    });
  }
  return {
    metrics,
    withheld: drivers.withheld.map((w) => ({
      metric: w.metric,
      reasonKey: member(REASON_KEYS, w.reason) ? w.reason : "unknown",
    })),
  };
}

/** `magnitude` (already formatted, unsigned) with `value`'s sign: "+$12.00",
 *  "−0.40x". Zero carries no sign — it moved nothing. */
export function signed(magnitude: string, value: number): string {
  return value > 0 ? `+${magnitude}` : value < 0 ? `\u2212${magnitude}` : magnitude;
}

/** A contribution with its sign, in the metric's own format. */
export function formatDriverChange(change: number, metric: string): string {
  return signed(formatMetric(Math.abs(change), metric), change);
}

// ── Actions (plan §P4a) ────────────────────────────────────────────────────

/**
 * Which way is good for a metric: the served vocabulary's word, or undefined
 * when it states none — then no move is judged good or bad.
 */
function metricGoodDirection(
  metric: string,
  meta: DashboardMetricMeta | undefined,
): "up" | "down" | undefined {
  return goodDirectionFor(metric, undefined, meta);
}

/**
 * The Account report platform whose campaigns a board's ids address, or null.
 *
 * The board's source id is the integration catalog key it was connected under;
 * the report platform is the one served by that same integration, and only a
 * platform the report (and ad_manager behind it) can actually read counts. Any
 * other source gets no row actions: a campaign id sent to the wrong platform's
 * routes would name a campaign that does not exist, or a different one.
 */
function boardReportPlatform(source: string | undefined): AccountReportPlatform | null {
  const serviceId = source ? serviceIdFromKey(source) : undefined;
  if (!serviceId) return null;
  const platform = (Object.keys(ACCOUNT_REPORT_PLATFORM_SERVICE_ID) as AccountReportPlatform[]).find(
    (candidate) => ACCOUNT_REPORT_PLATFORM_SERVICE_ID[candidate] === serviceId,
  );
  return platform && isAccountReportPlatformSupported(platform) ? platform : null;
}

/** "Adjust budget" on one campaign, with the way the data points. */
export interface DriverBudgetAction {
  campaignId: string;
  campaignName: string;
  /**
   * Raise a campaign that beats the account average on this metric, lower one
   * that trails it; null when the payload does not settle its standing. A
   * SUGGESTION shown beside the editor — never a value applied for the reader.
   */
  direction: "decrease" | "increase" | null;
}

interface DriverActions {
  /** "Open in Account report", scoped to this campaign, on this platform; null when not offered. */
  reportPlatform: AccountReportPlatform | null;
  /** "Pause campaign" — still subject to the reader's ad-management right. */
  pause: boolean;
  /** "Adjust budget" — still subject to the right AND to the campaign having
   *  a budget ad_manager can change (Smart+ only; the panel reads it first). */
  adjustBudget: DriverBudgetAction | null;
}

/**
 * Which actions one driver row offers.
 *
 * All need a real campaign on a board whose source the Account report reads
 * (`boardReportPlatform`): an id, the board's
 * advertiser, and not the `unallocated` remainder. Pausing additionally needs
 * the row to have pushed an efficiency metric the WRONG way, and a campaign
 * that is still there to stop — an `exited` one already stopped.
 *
 * A budget move is offered only where budget IS the reading: a `mix` row (the
 * metric moved because spend shifted to or from this campaign) or an `entered`
 * one (a new campaign's money came in at a rate above or below the account's).
 * A `performance` row moved on the campaign's own rate — more or less budget
 * does not change that — and an `exited` one has nothing left to fund. Additive
 * (volume) metrics are excluded for the reason pause excludes them: more spend
 * or more clicks from a campaign says nothing about whether its money is well
 * spent. Only a non-additive (efficiency) metric moved the bad way does.
 */
export function driverActions(
  row: DriverDisplayRow,
  metric: string,
  meta: DashboardMetricMeta | undefined,
  board: { advertiserId?: string; platform?: string },
): DriverActions {
  const reportPlatform = boardReportPlatform(board.platform);
  const addressable =
    row.effectKey !== "unallocated" &&
    Boolean(row.id.trim()) &&
    Boolean(board.advertiserId?.trim()) &&
    reportPlatform !== null;
  if (!addressable) return { reportPlatform: null, pause: false, adjustBudget: null };
  const good = metricGoodDirection(metric, meta);
  const worsened =
    row.change !== null &&
    good !== undefined &&
    (good === "down" ? row.change > 0 : row.change < 0);
  const efficiency = isNonAdditiveMetric(metric);
  const budgetRow = row.effectKey === "mix" || row.effectKey === "entered";
  const betterThanAverage =
    row.vsAverage === undefined || good === undefined
      ? null
      : (row.vsAverage === "above") === (good === "up");
  return {
    reportPlatform,
    pause: worsened && row.effectKey !== "exited" && efficiency,
    adjustBudget:
      efficiency && budgetRow
        ? {
            campaignId: row.id,
            campaignName: row.name,
            direction:
              betterThanAverage === null
                ? null
                : betterThanAverage
                  ? "increase"
                  : "decrease",
          }
        : null,
  };
}

/**
 * Whether the panel links to the creative list: some metric's `ctr` stage
 * pushed it the bad way — fewer people clicking what they see, which is a
 * creative question before it is a campaign one.
 */
export function needsCreativeReview(
  drivers: DashboardDrivers | undefined,
  metaOf: (metric: string) => DashboardMetricMeta | undefined,
): boolean {
  if (!drivers) return false;
  return drivers.metrics.some((m) => {
    const good = metricGoodDirection(m.metric, metaOf(m.metric));
    if (good === undefined) return false;
    const bad = good === "down" ? "up" : "down";
    return m.stages.some((s) => s.stage === "ctr" && s.pushedMetric === bad);
  });
}
