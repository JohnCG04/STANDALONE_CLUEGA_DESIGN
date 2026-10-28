"use client";

import useSWR from "swr";

import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { STALE_MS } from "../constants";
import { toApiFilters, toKeyFilters } from "../helpers";
import { useTeamScope } from "./useTeamScope";
import { usageSource } from "./useUsageSource";
import { useUsageChartFilters, useUsageDateWindow } from "./useUsageUiState";

/**
 * The charts' single read — GET /api/v1/usage-analytics/series.
 *
 * ONE request for three blocks. The endpoint returns the per-model curves, the
 * per-model totals and the daily bars together because they are three views of
 * one aggregate, and the three hooks below all subscribe to THIS key: SWR
 * dedupes them into one in-flight request and one cache entry, so the page
 * issues two requests on mount (this and the KPI row) rather than four.
 *
 * It also means the three blocks can never disagree about a window — they are
 * literally reading the same object.
 */
export function useUsageSeries() {
  const { teamId, enabled } = useTeamScope();
  const window = useUsageDateWindow();
  const { filters } = useUsageChartFilters();

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? usageSwrKeys.series(teamId, window, toKeyFilters(filters)) : null,
    () => usageSource().getSeries({ window, ...toApiFilters(filters) }),
    { dedupingInterval: STALE_MS },
  );

  return { bundle: data, isLoading, failed: Boolean(error), retry: mutate };
}

/** US-02's chart: one densified curve per model. */
export function useCreditsUsage() {
  const { bundle, isLoading, failed, retry } = useUsageSeries();
  return { series: bundle?.series, isLoading, failed, retry };
}

/** US-03's ranked list: per-model totals for the same window. */
export function useModelsUsage() {
  const { bundle, isLoading, failed, retry } = useUsageSeries();
  return { totals: bundle?.totals, isLoading, failed, retry };
}

/** US-04's stacked bars: consumption against the credits that came in. */
export function useCreditsSummary() {
  const { bundle, isLoading, failed, retry } = useUsageSeries();
  return { summary: bundle?.summary, isLoading, failed, retry };
}
