"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";

import { tabular } from "@/components/dashboard/widgets/tokens";
import { formatCompact, formatFullNumber } from "@/components/dashboard/widgets/widgetFormat";
import { useTranslate } from "@/hooks/useTranslate";

import { hoverLinePlugin, usageScales, useChartTheme } from "@/components/dashboard/widgets/chartjs/kit";
import { CREDITS_CHART_HEIGHT, MAX_TOOLTIP_ROWS, TOOLTIP_FOLD_COLOR } from "../constants";
import { lineAreaFill } from "../chartStyle";
import {
  bucketLabels,
  deltaTrend,
  foldRowsTail,
  formatDelta,
  groupLegendSeries,
  rankSeries,
  withAlpha,
} from "../helpers";
import { useUsageBucket } from "../hooks/useUsageUiState";
import type { ModelUsageSeries } from "../usage-analytics.service";
import {
  ChartTooltipCard,
  useChartOverlay,
  useContainerSize,
  type OverlayRow,
} from "./ChartOverlay";

// US-02's chart: one curve + gradient ground per model, an index-mode hover (a
// vertical rule, a dot per series, one card listing every model that moved that
// day) and a legend that folds the low-usage tail into "+n more". Drawn with
// Chart.js through react-chartjs-2 (wiring in the widget kit's chartjs/kit). The legend stays
// HTML: it carries each model's total and the fold/unfold control, which the
// canvas legend has no room for. Page-local rather than the dashboard kit's
// LineChart, which caps at three series and is bound to a widget slot.
//
// The tooltip is HTML too, and for the same class of reason — a light card with
// a ruled title and a right-aligned delta column is not a shape the canvas
// tooltip can draw. See ChartOverlay.

const PLUGINS = [hoverLinePlugin];

/** The hover rule is a guide, not a series: a quarter-strength grey, so it
 *  reads under the lines rather than competing with them. */
const HOVER_RULE_ALPHA = 0.35;

function CreditsUsageChartInner({ series }: { series: readonly ModelUsageSeries[] }) {
  const { t, lang } = useTranslate();
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useChartTheme(containerRef);
  const containerSize = useContainerSize(containerRef);
  const [legendExpanded, setLegendExpanded] = useState(false);

  // Ranked once, largest first: the colour a model wears is its rank's colour,
  // and it must not change when the legend expands or a neighbour is hovered.
  // Largest first is also the draw order, so a small series' line and fill
  // land on top of a larger one's, never buried under it.
  const ranked = useMemo(() => rankSeries(series), [series]);
  // The axis is labelled for the bucket the answer was GROUPED at — hours read
  // "14:00", months "Sep 2026" — which the window decides, not this chart. Read
  // from the range slice rather than sniffed out of the key's shape, so a
  // backend that spells an hour differently still labels correctly.
  const bucket = useUsageBucket();
  const labels = useMemo(
    () => bucketLabels((ranked[0]?.points ?? []).map((point) => point.date), lang, bucket),
    [ranked, lang, bucket],
  );

  // The card's rows: the same reading rules the canvas tooltip enforced — a
  // day a model did not move is dropped, the rest are largest first — plus the
  // delta each row carries against the day before it.
  //
  // Every row is KEYED on its dataset index, never on its name. Two raw model
  // ids can print one name (the router-prefixed spelling and the bare one both
  // read "Google - Gemini 3 Pro Image"), and a duplicate React key there makes
  // the list reuse the wrong node under a fast hover — rows that look copied.
  const { model: hovered, external } = useChartOverlay<"line">((items: TooltipItem<"line">[]) => {
    const rows = items
      .filter((item) => typeof item.raw === "number" && item.raw > 0)
      .sort((a, b) => Number(b.raw) - Number(a.raw))
      .map((item): OverlayRow => {
        const entry = ranked[item.datasetIndex];
        const credits = Number(item.raw);
        const previous = entry?.points[item.dataIndex - 1]?.credits ?? null;
        return {
          key: String(item.datasetIndex),
          label: entry?.modelName ?? "",
          color: entry?.color ?? "",
          value: formatFullNumber(credits),
          raw: credits,
          delta: formatDelta(credits, previous),
          trend: deltaTrend(credits, previous),
        };
      });
    const index = items[0]?.dataIndex ?? 0;
    const previousLabel = index > 0 ? labels[index - 1] : undefined;
    return {
      rows: foldRowsTail(rows, MAX_TOOLTIP_ROWS, (hidden, total) => ({
        key: "__folded",
        label: t("usageAnalytics.tooltip.otherModels").replace("{n}", String(hidden.length)),
        color: TOOLTIP_FOLD_COLOR,
        value: formatFullNumber(total),
        raw: total,
      })),
      // What the percentages are measured AGAINST. The column is a change from
      // the PREVIOUS bucket, which a bare "+2215.4%" beside a figure does not
      // say — so the bucket is named over the column, and nothing is claimed
      // on the first bucket of a window, which has nothing behind it.
      caption: previousLabel
        ? t("usageAnalytics.tooltip.vs").replace("{label}", previousLabel)
        : undefined,
    };
  });

  const data = useMemo<ChartData<"line", (number | null)[]>>(
    () => ({
      labels,
      datasets: ranked.map((entry) => ({
        label: entry.modelName,
        // A null point is an unsynced day: the pen lifts, it is not a zero.
        data: entry.points.map((point) => point.credits),
        spanGaps: false,
        borderColor: entry.color,
        // Canvas has no fill-opacity, so the ground's alpha lives in its
        // colour — here a gradient from the line down to nothing, so two
        // overlapping areas stay legible instead of compounding into mud.
        backgroundColor: lineAreaFill(entry.color),
        fill: "origin",
        // Monotone rather than a plain tension: it curves the line without
        // letting the spline overshoot between two points, which on a credits
        // chart would draw a dip below zero on days that never went there.
        cubicInterpolationMode: "monotone" as const,
        tension: 0.4,
        borderWidth: 2.5,
        borderJoinStyle: "round" as const,
        borderCapStyle: "round" as const,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: entry.color,
        pointHoverBorderColor: theme?.bg,
        pointHoverBorderWidth: 2.5,
      })),
    }),
    [labels, ranked, theme?.bg],
  );

  const options = useMemo<ChartOptions<"line"> | null>(
    () =>
      theme && {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        // Room above for the hover dot's ring, and at the right for the last
        // x label to sit under its point rather than past the canvas edge.
        layout: { padding: { top: 16, right: 16 } },
        scales: usageScales(theme, labels, { pxPerLabel: 90, yTicks: 5 }),
        plugins: {
          // Off, not restyled: the card is rendered in HTML from this model.
          tooltip: { enabled: false, mode: "index", intersect: false, external },
          usageHoverLine: { color: withAlpha(theme.inkMuted, HOVER_RULE_ALPHA) },
        },
      },
    [theme, labels, external],
  );

  const visibleCount = groupLegendSeries(ranked).visible.length;
  const legendEntries = legendExpanded ? ranked : ranked.slice(0, visibleCount);
  const hiddenCount = ranked.length - visibleCount;

  return (
    <div className="flex flex-col gap-4">
      {/* Chart.js sizes the canvas to this box (responsive, no aspect ratio),
          so the box owns the height. It is also the positioning context the
          tooltip card clamps itself inside. Mounted once the theme is measured. */}
      <div ref={containerRef} className="relative w-full" style={{ height: CREDITS_CHART_HEIGHT }}>
        {options ? (
          <>
            <Line
              data={data}
              options={options}
              plugins={PLUGINS}
              role="img"
              aria-label={t("usageAnalytics.creditsUsage.title")}
            />
            <ChartTooltipCard
              model={hovered}
              container={containerSize}
              valueLabel={t("usageAnalytics.tooltip.credits")}
            />
          </>
        ) : null}
      </div>

      {/* Every chip carries a name and a number, so colour is never the only
          way to tell two series apart (the PRD's colour-blindness note). */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {legendEntries.map((entry) => (
          <li key={entry.modelId} className="flex items-center gap-2 text-[12px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="text-neutral-700 dark:text-neutral-300">{entry.modelName}</span>
            <span className="text-neutral-400 dark:text-neutral-500" style={tabular}>
              {formatCompact(entry.total)}
            </span>
          </li>
        ))}
        {hiddenCount > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => setLegendExpanded((value) => !value)}
              className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {legendExpanded
                ? t("usageAnalytics.legend.less")
                : t("usageAnalytics.legend.more").replace("{n}", String(hiddenCount))}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Memoised on `series`, which is the only prop that can change what is drawn.
 *
 * The guard matters because a canvas is expensive: Chart.js rebuilds its
 * datasets, scales and hover plugin on every render of this component, and the
 * series it draws only changes when the series read changes. The page's other
 * interactions — paging the ledger, ticking one of its filters — now live in
 * their own cache keys and never reach this subtree, and this memo is what
 * keeps a re-render of the CARD (a legend toggle, a theme flip) from redrawing
 * the plot underneath it.
 */
export const CreditsUsageChart = memo(CreditsUsageChartInner);
