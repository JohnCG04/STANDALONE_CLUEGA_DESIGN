import type { UsageTimeRangeKey } from "@/lib/flow/usage-analytics/timeRange";

import { VIZ_SERIES } from "../../MarketingReports/shared/viz";
import type {
  CreditsSourceKey,
  UsageChartFilters,
  UsageGenerationsFilters,
} from "./types";
import type { GenerationCreditOutcome, GenerationStatus } from "./usage-analytics.service";

/** The page keeps data fresh for a minute — the global default is Infinity,
 *  which would freeze an analytics page on its first answer. */
export const STALE_MS = 60_000;

/** Vocabularies move when a model or feature ships — minutes, not seconds. */
export const FACETS_STALE_MS = 5 * 60_000;

export const EMPTY_CHART_FILTERS: UsageChartFilters = {
  users: [],
  features: [],
  models: [],
};

export const EMPTY_GENERATIONS_FILTERS: UsageGenerationsFilters = {
  ...EMPTY_CHART_FILTERS,
  platforms: [],
  outcomes: [],
};

/** How many series get a legend chip before the rest fold into "+n more". */
export const MAX_LEGEND_SERIES = 5;

/**
 * How many series the hover card prints before the rest fold into one row.
 *
 * Eight rows is about the height of the plot itself: past that the card stops
 * being a reading of the hovered day and becomes a table floating over the
 * chart it is meant to explain.
 */
export const MAX_TOOLTIP_ROWS = 8;

/** The swatch of that fold row — deliberately NOT a palette colour, so it does
 *  not read as a series of its own. */
export const TOOLTIP_FOLD_COLOR = "#cbd5e1";

/** The i18n key behind each action of the range picker. */
export const RANGE_LABEL_KEYS: Record<UsageTimeRangeKey, string> = {
  today: "usageAnalytics.range.today",
  yesterday: "usageAnalytics.range.yesterday",
  this_week: "usageAnalytics.range.thisWeek",
  last_week: "usageAnalytics.range.lastWeek",
  last_month: "usageAnalytics.range.lastMonth",
  last_3_months: "usageAnalytics.range.last3Months",
  all_time: "usageAnalytics.range.allTime",
  custom: "usageAnalytics.range.custom",
};

/** Plot heights, in px — the credits chart and the summary bars. */
export const CREDITS_CHART_HEIGHT = 260;
export const CREDITS_SUMMARY_HEIGHT = 220;

/** How opaque the area under a credits line is. */
export const AREA_OPACITY = 0.12;

/** Share of a summary category's slot the bar itself takes. */
export const BAR_FRACTION = 0.55;

/** How much colour the hatched (refunded) ground keeps behind its stripes. */
export const HATCH_TINT_ALPHA = 0.3;

/**
 * The page sizes the ledger's footer offers, and which one it opens on.
 *
 * The default matches GENERATIONS_PAGE_LIMIT — the api client's own default —
 * so the footer opens showing the size the request would have used anyway.
 */
export const GENERATIONS_PAGE_SIZES: readonly number[] = [10, 20, 50];
export const GENERATIONS_DEFAULT_PAGE_SIZE = 20;

/** The credit outcomes the ledger can be filtered to. */
export const GENERATION_OUTCOMES: readonly GenerationCreditOutcome[] = [
  "charged",
  "refunded",
  "free",
];

/**
 * The Credits Summary stack, bottom to top — and ONLY the movements this system
 * can actually observe.
 *
 * `consumption` is the cost book's credits out; `subscription` is the monthly
 * plan allowance and `topup` a recharge, both as the credit ledger books them;
 * `refund` is a reversal returning credits, drawn HATCHED rather than in a
 * fifth hue because it is the one addition that must never be mistaken for a
 * purchase, and a texture survives colour blindness where another colour does
 * not.
 *
 * `community` and `expired` are deliberately NOT drawn. Nothing in this
 * backend observes either (see the coverage block the usage endpoints return),
 * so a permanent zero in the legend would read as a measurement — "0 expired"
 * claims we track expiry. The fields stay on the type for the day something
 * does report them.
 */
export const CREDITS_SOURCES: readonly {
  key: CreditsSourceKey;
  color: string;
  hatched?: boolean;
}[] = [
  { key: "consumption", color: VIZ_SERIES[4] },
  { key: "topup", color: VIZ_SERIES[2] },
  { key: "subscription", color: VIZ_SERIES[1] },
  { key: "refund", color: VIZ_SERIES[5], hatched: true },
];

/**
 * The ink of each generation status.
 *
 * Text rather than a filled pill (see StatusText): the column is read down, and
 * a tinted capsule on every row competes with the credits figure beside it. A
 * SUCCESS takes the table's own ink — it is the expected outcome, and colouring
 * the norm leaves nothing for the exception — while a failure and a job still
 * running keep the two hues a reader scans this column for.
 *
 * Written out per status instead of composed from a hue name because Tailwind
 * scans source for whole class names: an interpolated `text-${hue}-700` is not
 * in the built stylesheet, and the cell renders with no colour at all.
 */
export const STATUS_TONE: Record<GenerationStatus, string> = {
  completed: "text-neutral-900 dark:text-neutral-100",
  failed: "text-rose-600 dark:text-rose-400",
  processing: "text-amber-600 dark:text-amber-400",
  // Paused by the user: muted, since it is neither the norm nor something that went wrong.
  stopped: "text-neutral-500 dark:text-neutral-400",
};
