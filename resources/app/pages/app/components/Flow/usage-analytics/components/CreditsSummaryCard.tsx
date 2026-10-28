"use client";

import { memo, useMemo, useRef } from "react";
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";
import { Bar } from "react-chartjs-2";

import { formatFullNumber } from "@/components/dashboard/widgets/widgetFormat";
import { useTranslate } from "@/hooks/useTranslate";
import { useCreditsSummary } from "../hooks/useUsageSeries";

import { hatchPattern, usageScales, useChartTheme } from "@/components/dashboard/widgets/chartjs/kit";
import {
  BAR_FRACTION,
  CREDITS_SOURCES,
  CREDITS_SUMMARY_HEIGHT,
  HATCH_TINT_ALPHA,
} from "../constants";
import { barSegmentFill, dimmedHatch, stackCapRadius } from "../chartStyle";
import { bucketLabels, withAlpha } from "../helpers";
import { useUsageBucket } from "../hooks/useUsageUiState";
import type { CreditsSummary, CreditsSummaryDay } from "../usage-analytics.service";
import { BlockFrame, blockState } from "./BlockFrame";
import {
  ChartTooltipCard,
  ChartValuePill,
  useChartOverlay,
  useContainerSize,
  type OverlayRow,
} from "./ChartOverlay";

// US-04: consumed vs added, and where each credit came from or went, stacked
// per day — Chart.js stacked bars through react-chartjs-2 (wiring in
// the widget kit's chartjs/kit).
//
// Each column is drawn as ONE capsule: rounded caps on its outermost segments
// only (stackCapRadius), a gradient down each segment, and every column but
// the hovered one knocked back so the day under the cursor is the subject.
// Hovering hangs a pill with that day's TOTAL over the column — the one figure
// a stack does not let you read off the axis — while the card beside it breaks
// the total into its sources.
//
// Expired stays HATCHED, and the dim is an alpha rather than a second texture
// for exactly that reason: the hatch already means "expired", the one movement
// that must never be mistaken for consumption, and a texture survives colour
// blindness where a fifth hue does not. Two hatches would collapse "expired"
// and "not hovered" into the same mark.

const dayTotal = (day: CreditsSummaryDay) =>
  CREDITS_SOURCES.reduce((sum, source) => sum + day[source.key], 0);

/**
 * Memoised on `days`: the bars only change when the series read changes, and
 * everything else this card re-renders for (the totals in its header, a theme
 * flip) would otherwise make Chart.js rebuild the whole plot.
 */
const StackedBars = memo(function StackedBars({ days }: { days: CreditsSummaryDay[] }) {
  const { t, lang } = useTranslate();
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useChartTheme(containerRef);
  const containerSize = useContainerSize(containerRef);

  // Same rule as the line chart: the columns are whatever bucket was asked for,
  // so they are labelled as hours, days or months rather than always as dates.
  const bucket = useUsageBucket();
  const labels = useMemo(
    () => bucketLabels(days.map((day) => day.date), lang, bucket),
    [days, lang, bucket],
  );

  // Same reading rules the canvas tooltip enforced — a source that did not
  // move that day is dropped, the rest are largest first.
  const { model: hovered, external } = useChartOverlay<"bar">((items: TooltipItem<"bar">[]) => ({
    rows: items
      .filter((item) => typeof item.raw === "number" && item.raw > 0)
      .sort((a, b) => Number(b.raw) - Number(a.raw))
      .map((item): OverlayRow => {
        const source = CREDITS_SOURCES[item.datasetIndex];
        return {
          // The source key, not its printed name: the key is unique per stack
          // segment in every language, which is what React needs to keep two
          // rows apart while the pointer runs along the columns.
          key: source.key,
          label: t(`usageAnalytics.creditsSummary.source.${source.key}`),
          color: source.color,
          hatched: source.hatched,
          value: formatFullNumber(Number(item.raw)),
          raw: Number(item.raw),
        };
      }),
  }));

  const data = useMemo<ChartData<"bar", number[]>>(
    () => ({
      labels,
      datasets: CREDITS_SOURCES.map((source) => ({
        label: t(`usageAnalytics.creditsSummary.source.${source.key}`),
        data: days.map((day) => day[source.key]),
        // Scriptable: a gradient needs the laid-out chart area and the hover
        // dim needs the active element, neither of which exists when the
        // dataset is built. The pattern needs the chart's own canvas context,
        // and is cached per context (see hatchPattern) so this stays cheap.
        backgroundColor: source.hatched
          ? dimmedHatch(source.color, (ctx) =>
              hatchPattern(ctx, source.color, withAlpha(source.color, HATCH_TINT_ALPHA)),
            )
          : barSegmentFill(source.color),
        borderRadius: stackCapRadius(),
        // Without this Chart.js squares off the edge it considers "joined",
        // which on a stacked bar is the very edge the cap belongs on.
        borderSkipped: false,
        categoryPercentage: BAR_FRACTION,
        barPercentage: 1,
      })),
    }),
    [days, labels, t],
  );

  const options = useMemo<ChartOptions<"bar"> | null>(
    () =>
      theme && {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        // Top padding is the pill's room: it hangs above the tallest column,
        // and the tallest column by definition reaches the top of the plot.
        layout: { padding: { top: 44, right: 12 } },
        scales: usageScales(theme, labels, { stacked: true, pxPerLabel: 80, yTicks: 4 }),
        // Off, not restyled: both overlays are rendered in HTML from this model.
        plugins: { tooltip: { enabled: false, mode: "index", intersect: false, external } },
      },
    [theme, labels, external],
  );

  // The pill's figure: the hovered column's segments added back up. Summed
  // from the rows rather than re-read off `days`, so it can never disagree
  // with the breakdown printed beside it.
  const hoveredTotal = useMemo(
    () => (hovered ? formatFullNumber(hovered.rows.reduce((sum, row) => sum + row.raw, 0)) : ""),
    [hovered],
  );

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: CREDITS_SUMMARY_HEIGHT }}>
      {options ? (
        <>
          <Bar
            data={data}
            options={options}
            role="img"
            aria-label={t("usageAnalytics.creditsSummary.title")}
          />
          <ChartValuePill model={hovered} total={hoveredTotal} container={containerSize} />
          <ChartTooltipCard
            model={hovered}
            container={containerSize}
            valueLabel={t("usageAnalytics.tooltip.credits")}
          />
        </>
      ) : null}
    </div>
  );
})
function LegendSwatch({ color: swatch, hatched }: { color: string; hatched?: boolean }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={
        hatched
          ? {
              backgroundImage: `repeating-linear-gradient(45deg, ${swatch} 0 2px, transparent 2px 4px)`,
              backgroundColor: withAlpha(swatch, HATCH_TINT_ALPHA),
            }
          : { background: swatch }
      }
    />
  );
}

// Third reader of the one series cache entry: consumption and the credits that
// came in are two halves of the same aggregate.
export function CreditsSummaryCard() {
  const { t } = useTranslate();
  const { summary, isLoading, failed, retry } = useCreditsSummary();
  const isEmpty = !summary || summary.days.every((day) => dayTotal(day) === 0);

  return (
    <BlockFrame
      title={t("usageAnalytics.creditsSummary.title")}
      state={blockState({ isLoading, failed, isEmpty })}
      onRetry={retry}
      rightSlot={
        summary ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-baseline gap-1.5">
              <LegendSwatch color={CREDITS_SOURCES[0].color} />
              <span className="text-[18px] font-bold text-neutral-900 tabular-nums dark:text-neutral-100">
                {formatFullNumber(summary.totalConsumed)}
              </span>
              <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
                {t("usageAnalytics.creditsSummary.consumed")}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <LegendSwatch color={CREDITS_SOURCES[1].color} />
              <span className="text-[18px] font-bold text-neutral-900 tabular-nums dark:text-neutral-100">
                {formatFullNumber(summary.totalAdded)}
              </span>
              <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
                {t("usageAnalytics.creditsSummary.added")}
              </span>
            </span>
          </div>
        ) : null
      }
    >
      <StackedBars days={summary?.days ?? []} />
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {CREDITS_SOURCES.map((source) => (
          <li key={source.key} className="flex items-center gap-2 text-[12px] text-neutral-700 dark:text-neutral-300">
            <LegendSwatch color={source.color} hatched={source.hatched} />
            {t(`usageAnalytics.creditsSummary.source.${source.key}`)}
          </li>
        ))}
      </ul>
    </BlockFrame>
  );
}
