import type { CreditsRemaining } from "@/lib/flow/creditsRemaining";

import type {
  CreditsSummaryDay,
  GenerationCreditOutcome,
  GenerationPlatform,
  ModelUsageSeries,
  ModelUsageTotal,
} from "./usage-analytics.service";

/** The facet selections the chart blocks share. Empty means "all". */
export interface UsageChartFilters {
  users: string[];
  features: string[];
  models: string[];
}

/** The ledger's filters — the chart facets plus its own two. */
export interface UsageGenerationsFilters extends UsageChartFilters {
  platforms: GenerationPlatform[];
  outcomes: GenerationCreditOutcome[];
}

export interface CurrentCredits {
  /** The figure the stat card prints; null renders "—", never a fake 0. */
  credits: number | null;
  /** The 3-state pill logic — drives the low-credit banner. */
  remaining: CreditsRemaining;
}

export interface ModelShare extends ModelUsageTotal {
  /** Whole-number share of the window's consumption; all rows sum to 100. */
  percent: number;
}

export interface LegendGrouping {
  /** The series that get their own legend chip, largest first. */
  visible: ModelUsageSeries[];
  /** Everything folded into the "+n more" chip (still drawn in the plot). */
  more: ModelUsageSeries[];
}

export interface RankedSeries extends ModelUsageSeries {
  /** The rank's colour — fixed while the legend folds or a neighbour is hovered. */
  color: string;
  /** Consumption over the window; gaps (null points) count as nothing. */
  total: number;
}

/** One movement of the Credits Summary stack — every day field but the date. */
export type CreditsSourceKey = Exclude<keyof CreditsSummaryDay, "date">;

/** The tabs of the generations ledger; only "generations" is wired (US-07). */
export type UsageTab = "generations" | "team" | "credits";
