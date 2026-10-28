"use client";

import useSWR from "swr";

import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { STALE_MS } from "../constants";
import { useTeamScope } from "./useTeamScope";
import { usageSource } from "./useUsageSource";
import { useUsageDateWindow } from "./useUsageUiState";

/**
 * The stat cards' row — GET /api/v1/usage-analytics.
 *
 * The hook reads the window out of the SWR cache rather than taking it as a
 * prop, which is what lets the page render `<StatCardsRow />` with no data props
 * at all: the container then holds nothing that a filter or a page step can
 * change, so those actions cannot re-render the chart beside it.
 *
 * Keyed on the WINDOW only. The KPI row answers "what did this tenant do in this
 * period" — narrowing it by the chart's model facet would make the headline
 * numbers disagree with the wallet they are read against.
 */
export function useUsageOverview() {
  const { teamId, enabled } = useTeamScope();
  const window = useUsageDateWindow();

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? usageSwrKeys.overview(teamId, window) : null,
    () => usageSource().getOverview({ window }),
    { dedupingInterval: STALE_MS },
  );

  return { overview: data, isLoading, failed: Boolean(error), retry: mutate };
}
