"use client";

import { useTranslate } from "@/hooks/useTranslate";

import { AvatarFacetSelect } from "../../../AvatarStudio/shared/AvatarFacetSelect";
import { useUsageFacets } from "../hooks/useUsageFacets";
import { useCreditsUsage } from "../hooks/useUsageSeries";
import { useUsageChartFilters } from "../hooks/useUsageUiState";
import type { UsageChartFilters } from "../types";
import type { ModelUsageSeries, UsageFacetOption } from "../usage-analytics.service";
import { BlockFrame, blockState } from "./BlockFrame";
import { CreditsUsageChart } from "./CreditsUsageChart";

function toOptions(list: UsageFacetOption[] | undefined) {
  return (list ?? []).map((option) => ({ value: option.id, label: option.name }));
}

// The facet row is the avatar picker's multi-select (Popover + checkboxes +
// debounced commit) — it is self-contained and presentational, so it is
// imported rather than copied. Filters are handed up as a PATCH: two facets
// settling inside one debounce window would otherwise each overwrite the other
// with the stale filters their closure captured.
// Subscribes to the series read and to the chart facets, and to NOTHING else —
// the ledger's cursor and its filters are separate cache keys, so paging the
// table below cannot reach this canvas.
export function CreditsUsageCard() {
  const { t } = useTranslate();
  const { facets } = useUsageFacets();
  const { series, isLoading, failed, retry } = useCreditsUsage();
  const { filters, patch: onFiltersChange } = useUsageChartFilters();

  return (
    <BlockFrame
      title={t("usageAnalytics.creditsUsage.title")}
      state={blockState({ isLoading, failed, isEmpty: !series || series.length === 0 })}
      onRetry={retry}
      rightSlot={
        <>
          <AvatarFacetSelect
            label={t("usageAnalytics.filters.users")}
            values={filters.users}
            options={toOptions(facets?.users)}
            onChange={(users) => onFiltersChange({ users })}
          />
          <AvatarFacetSelect
            label={t("usageAnalytics.filters.features")}
            values={filters.features}
            options={toOptions(facets?.features)}
            onChange={(features) => onFiltersChange({ features })}
          />
          <AvatarFacetSelect
            label={t("usageAnalytics.filters.models")}
            values={filters.models}
            options={toOptions(facets?.models)}
            onChange={(models) => onFiltersChange({ models })}
          />
        </>
      }
    >
      <CreditsUsageChart series={series ?? []} />
    </BlockFrame>
  );
}
