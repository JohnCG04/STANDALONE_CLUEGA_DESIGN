"use client";

import useSWR from "swr";

import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { FACETS_STALE_MS } from "../constants";
import { useTeamScope } from "./useTeamScope";
import { usageSource } from "./useUsageSource";
import { useUsageDateWindow } from "./useUsageUiState";

/**
 * The filter vocabularies — GET /api/v1/usage-analytics/facets.
 *
 * Keyed on the window because the answer is window-scoped: the endpoint offers
 * the models and members that actually appear in the period on screen, so a
 * picker never lists a model nobody here has run. Held longer than the data
 * (FACETS_STALE_MS): a vocabulary moves when a model ships, not per interaction.
 */
export function useUsageFacets() {
  const { teamId, enabled } = useTeamScope();
  const window = useUsageDateWindow();

  const { data, error, isLoading } = useSWR(
    enabled ? usageSwrKeys.facets(teamId, window) : null,
    () => usageSource().getFacets({ window }),
    { dedupingInterval: FACETS_STALE_MS },
  );

  return { facets: data, isLoading, failed: Boolean(error) };
}
