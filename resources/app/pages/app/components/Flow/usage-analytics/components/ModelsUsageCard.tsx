"use client";

import { useMemo } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { useModelsUsage } from "../hooks/useUsageSeries";

import { computeModelShares, seriesColorAt } from "../helpers";
import type { ModelUsageTotal } from "../usage-analytics.service";
import { BlockFrame, blockState } from "./BlockFrame";

// US-03: the ranked share list. Every row is a button — clicking a model opens
// the Generations table below with that model pre-filtered (the page owns
// that wiring through `onModelSelect`). The tint is the model's rank colour,
// the same one the usage chart draws it in.
// The totals come from the same cache entry the chart reads, so the two blocks
// cannot disagree about a window and cost one request between them.
export function ModelsUsageCard({
  onModelSelect,
}: {
  onModelSelect: (modelId: string) => void;
}) {
  const { t } = useTranslate();
  const { totals, isLoading, failed, retry } = useModelsUsage();
  const shares = useMemo(() => computeModelShares(totals ?? []), [totals]);

  return (
    <BlockFrame
      title={t("usageAnalytics.modelsUsage.title")}
      state={blockState({ isLoading, failed, isEmpty: shares.length === 0 })}
      onRetry={retry}
    >
      <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
        <span>{t("usageAnalytics.modelsUsage.models")}</span>
        <span>{t("usageAnalytics.modelsUsage.consumption")}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {shares.map((row, index) => {
          const tint = seriesColorAt(index);
          return (
            <li key={row.modelId}>
              <button
                type="button"
                onClick={() => onModelSelect(row.modelId)}
                // The printed label hides the router and the release channel,
                // so the tooltip carries the id the charge was actually booked
                // against — a prettified name must stay resolvable.
                title={`${row.modelId} — ${row.jobs} jobs`}
                className="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{ width: `${row.percent}%`, background: tint, opacity: 0.16 }}
                />
                <span className="relative flex min-w-0 items-center gap-2 text-[13px] font-medium text-neutral-800 dark:text-neutral-100">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: tint }} />
                  <span className="truncate">{row.modelName}</span>
                </span>
                <span className="relative shrink-0 text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {row.percent}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </BlockFrame>
  );
}
