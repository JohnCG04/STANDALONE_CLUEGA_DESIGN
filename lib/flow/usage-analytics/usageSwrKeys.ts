/**
 * SWR keys for the Usage Analytics page — both the DATA keys and the UI-STATE
 * keys.
 *
 * A leaf module (the flowQueryKeys pattern) so any Flow surface can read or
 * write these caches without importing the page.
 *
 * Two things live here for one reason: on this page the UI state IS cache state.
 * The range pill, the chart facets and the ledger's cursor are held in the SWR
 * cache rather than in React state, so a component subscribes to exactly the
 * slices it renders from. Changing the ledger's cursor then re-renders the
 * ledger and nothing else — where a `useState` in the page container re-renders
 * every block under it, chart included, on every keystroke of a filter.
 *
 * Every DATA key starts with the prefix and the ACTIVE TEAM: usage is per tenant
 * and every request carries X-Team-Id, so a key without the team would quote one
 * tenant's spending to another after a team switch. UI keys are per team too —
 * a filter naming a model the new team never ran is worse than a reset.
 */

import type { UsageDateWindow } from "@/lib/flow/usage-analytics/timeRange";

export const USAGE_SWR_PREFIX = "usage-analytics";

/** Namespace of the UI-state keys, kept apart from the data keys so a
 *  cache-wide revalidate can never try to "refetch" a filter selection. */
const USAGE_UI_PREFIX = "usage-analytics-ui";

/** Facet selections, sorted so the same selection hashes to the same key no
 *  matter what order the boxes were ticked in. */
function sorted(values: readonly string[] | undefined): string[] {
  return values && values.length > 0 ? [...values].sort() : [];
}

export interface UsageSeriesKeyFilters {
  user_ids?: readonly string[];
  feature_ids?: readonly string[];
  model_ids?: readonly string[];
}

export interface UsageGenerationsKeyFilters extends UsageSeriesKeyFilters {
  platforms?: readonly string[];
  credit_outcomes?: readonly string[];
}

function seriesKeyPart(filters: UsageSeriesKeyFilters) {
  return {
    users: sorted(filters.user_ids),
    features: sorted(filters.feature_ids),
    models: sorted(filters.model_ids),
  };
}

export const usageSwrKeys = {
  /** The four KPI cards — GET /api/v1/usage-analytics. */
  overview: (teamId: string | null, window: UsageDateWindow) =>
    [USAGE_SWR_PREFIX, teamId, "overview", window] as const,
  /** The live wallet + plan pair behind Current Credits. */
  wallet: (teamId: string | null) => [USAGE_SWR_PREFIX, teamId, "wallet"] as const,
  /**
   * ONE key for three blocks — GET /api/v1/usage-analytics/series returns the
   * per-model curves, the per-model totals and the daily bars together, because
   * they are three views of one aggregate. Three keys would mean three requests
   * that can disagree about the same window.
   */
  series: (
    teamId: string | null,
    window: UsageDateWindow,
    filters: UsageSeriesKeyFilters,
  ) => [USAGE_SWR_PREFIX, teamId, "series", window, seriesKeyPart(filters)] as const,
  /** One page of the ledger — GET /api/v1/ai-spend at a cursor. */
  generations: (
    teamId: string | null,
    window: UsageDateWindow,
    filters: UsageGenerationsKeyFilters,
    cursor: string,
    direction: "next" | "prev",
    limit: number,
  ) =>
    [
      USAGE_SWR_PREFIX,
      teamId,
      "generations",
      window,
      {
        ...seriesKeyPart(filters),
        platforms: sorted(filters.platforms),
        outcomes: sorted(filters.credit_outcomes),
      },
      // The cursor is part of the key, so a walked page is cached and stepping
      // back is instant. The direction is too: the same cursor read forwards and
      // backwards are two different pages.
      cursor,
      direction,
      // The page size is part of the key: the same cursor read twenty rows at a
      // time and fifty at a time are two different pages.
      limit,
    ] as const,
  /**
   * The filter vocabularies. Keyed on the WINDOW as well as the team: the
   * endpoint offers the values that appear in the period on screen, so caching
   * one window's answer under every window would offer models from a range the
   * user is no longer looking at.
   */
  facets: (teamId: string | null, window: UsageDateWindow) =>
    [USAGE_SWR_PREFIX, teamId, "facets", window] as const,
  /**
   * The tenant roster, for turning the user ids the cost book stores into the
   * people they belong to. NOT window-scoped: membership is reference data that
   * outlives any range on screen, and re-fetching it per window would refetch a
   * list the directory client already caches.
   */
  members: (teamId: string | null) => [USAGE_SWR_PREFIX, teamId, "members"] as const,
};

/**
 * UI-state keys. One key per independently-changing slice — that granularity is
 * the whole point: the chart subscribes to the range and the chart facets, the
 * ledger to the range, its own facets and its cursor, so a page step never
 * touches the chart and a chart facet never resets the ledger's page.
 */
export const usageUiKeys = {
  range: (teamId: string | null) => [USAGE_UI_PREFIX, teamId, "range"] as const,
  chartFilters: (teamId: string | null) =>
    [USAGE_UI_PREFIX, teamId, "chart-filters"] as const,
  generationsFilters: (teamId: string | null) =>
    [USAGE_UI_PREFIX, teamId, "generations-filters"] as const,
  generationsCursor: (teamId: string | null) =>
    [USAGE_UI_PREFIX, teamId, "generations-cursor"] as const,
  /** How many rows a ledger page holds — the footer's "Rows per page". */
  generationsLimit: (teamId: string | null) =>
    [USAGE_UI_PREFIX, teamId, "generations-limit"] as const,
};
