"use client";

/**
 * Small chart primitives for the Report Center — the shapes that are not lines.
 *
 * `curve.ts` already owns line charts. This file owns the rest of what the
 * report mocks ask for: a share bar, a paired comparison row, a donut, a rank
 * chip. They live here rather than in `kit.tsx` because kit is the SHELL
 * (page, toolbar, table, modal) and its primitives have twenty-odd callers
 * each — growing that file with drawing code makes the risky parts harder to
 * find.
 *
 * EVERY component here takes a value that may be `null`, and null is drawn as
 * an absence rather than as zero. A share bar at 0% and a share bar for a
 * number nobody measured look different on purpose: the first is a fact.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  barWidth,
  compareDelta,
  compareTone,
} from "../lib/product-report-viz.lib";

/** The Report Center accent. Re-exported so a caller needs one import. */
export const VIZ_ACCENT = "#0f6e56";

/**
 * The categorical palette, in assignment order.
 *
 * Seven entries, taken from the §4.14 mock and checked against both themes:
 * each keeps ≥3:1 contrast against `--card` in light and dark, so a legend swatch
 * stays visible without a border. Assign BY INDEX and keep the assignment stable
 * across renders — a series that changes colour between two reads of the same
 * report is worse than a bad colour.
 */
export const VIZ_SERIES = [
  "#0f6e56",
  "#4a7fe8",
  "#8a6bc1",
  "#d9a441",
  "#c8654a",
  "#7c8a94",
  "#5fa8a0",
] as const;

/**
 * The two-way comparison pair used by every "all vs selected" row.
 *
 * Light blue is always the BASELINE and dark blue always the SUBJECT, in every
 * panel. Swapping them per panel is how a reader ends up reading a deficit as a
 * surplus.
 */
export const VIZ_BASELINE = "#9cc3ec";
export const VIZ_SUBJECT = "#4a5ba8";

/* ─────────────────────────── share bar ─────────────────────────── */

export type ShareSegment = {
  key: string;
  /** Share of the whole, 0–100. */
  percent: number;
  color: string;
  label: ReactNode;
};

/**
 * One horizontal bar split into labelled segments — "spend by platform".
 *
 * A segment's label is hidden below 14% of the width rather than shrunk, because
 * a 4% segment cannot hold "TikTok 4.2%" at any legible size and the truncated
 * result reads as a different platform's name.
 */
export const StackedShareBar = ({
  segments,
  className,
}: {
  segments: ShareSegment[];
  className?: string;
}) => {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.percent), 0);
  if (total <= 0) {
    return (
      <div
        className={cn(
          "h-9 w-full rounded-lg border border-dashed border-border bg-foreground/[0.02]",
          className,
        )}
      />
    );
  }

  return (
    <div className={cn("flex h-9 w-full overflow-hidden rounded-lg", className)}>
      {segments.map((segment) => {
        const width = (Math.max(0, segment.percent) / total) * 100;
        if (width <= 0) return null;
        return (
          <div
            key={segment.key}
            className="grid place-items-center text-[11px] font-semibold text-white"
            style={{ width: `${width}%`, background: segment.color }}
            title={typeof segment.label === "string" ? segment.label : undefined}
          >
            {width >= 14 ? segment.label : null}
          </div>
        );
      })}
    </div>
  );
};

/**
 * The inline share bar that sits inside a table cell, ahead of its percentage.
 *
 * Fixed width so the column stays a column: a bar sized to its own value would
 * make every row a different width and destroy the vertical read.
 */
export const ShareCell = ({
  percent,
  color = VIZ_ACCENT,
}: {
  /** 0–100, or null when the share could not be computed. */
  percent: number | null;
  color?: string;
}) => {
  const width = barWidth(percent, 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-block h-[5px] w-[52px] shrink-0 overflow-hidden rounded-full bg-foreground/10">
        {width === null ? null : (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width, background: color }}
          />
        )}
      </span>
      <span className="tabular-nums">
        {percent === null ? "—" : `${percent.toFixed(1)}%`}
      </span>
    </span>
  );
};

/* ─────────────────────── paired comparison rows ─────────────────────── */

/** Column headings for a {@link DualBarRow} list. */
export const DualBarHead = ({
  label,
  baseline,
  subject,
  delta,
}: {
  label: ReactNode;
  baseline: ReactNode;
  subject: ReactNode;
  delta: ReactNode;
}) => (
  <div className="grid grid-cols-[150px_1fr_1fr_82px] items-center gap-3.5 border-b border-border pb-2 text-[11px] text-muted-foreground">
    <span>{label}</span>
    <span>{baseline}</span>
    <span>{subject}</span>
    <span className="text-center">{delta}</span>
  </div>
);

const Bar = ({
  value,
  max,
  color,
  suffix,
}: {
  value: number | null;
  max: number;
  color: string;
  suffix: string;
}) => {
  const width = barWidth(value, max);
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
        {width === null ? null : (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width, background: color }}
          />
        )}
      </span>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
        {value === null ? "—" : `${value.toFixed(2)}${suffix}`}
      </span>
    </span>
  );
};

/**
 * One row comparing a baseline against a subject, with the difference.
 *
 * The DELTA is the column that carries the message — "the selected audience is
 * 17pp more into games than the market" is the finding; the two absolute bars
 * are only how you check it. It is therefore given its own fixed column and a
 * tone, rather than being left for the reader to subtract.
 *
 * `null` on either side yields a null delta. Treating a missing baseline as zero
 * would report a +100% difference against nothing.
 */
export const DualBarRow = ({
  label,
  baseline,
  subject,
  max,
  /** Below this absolute difference the delta is drawn as flat, not as a change. */
  flatBelow = 0.5,
  suffix = "%",
  deltaSuffix = "pp",
}: {
  label: ReactNode;
  baseline: number | null;
  subject: number | null;
  /** The value that fills a bar. Shared across the list so bars compare. */
  max: number;
  flatBelow?: number;
  suffix?: string;
  deltaSuffix?: string;
}) => {
  const delta = compareDelta(baseline, subject);
  const tone = compareTone(delta, flatBelow);

  return (
    <div className="grid grid-cols-[150px_1fr_1fr_82px] items-center gap-3.5 border-b border-border/60 py-2.5 text-[12px] last:border-0">
      <span className="truncate text-foreground">{label}</span>
      <Bar value={baseline} max={max} color={VIZ_BASELINE} suffix={suffix} />
      <Bar value={subject} max={max} color={VIZ_SUBJECT} suffix={suffix} />
      <span
        className={cn(
          "rounded-md py-[3px] text-center text-[11px] font-semibold tabular-nums",
          tone === "up" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
          tone === "down" && "bg-rose-500/12 text-rose-700 dark:text-rose-400",
          tone === "flat" && "bg-foreground/[0.06] text-muted-foreground",
        )}
      >
        {delta === null
          ? "—"
          : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${deltaSuffix}`}
      </span>
    </div>
  );
};

/**
 * A single labelled bar with an amount on the right — a spend ranking row.
 *
 * Separate from {@link DualBarRow} because there is nothing to compare against:
 * forcing it into the paired layout would leave an empty column that reads as
 * missing data.
 */
export const AmountBarRow = ({
  label,
  value,
  max,
  formatted,
  muted,
}: {
  label: ReactNode;
  value: number | null;
  max: number;
  /** Already formatted, so currency and precision stay with the caller. */
  formatted: ReactNode;
  /** Drawn grey — a row below the significance threshold. */
  muted?: boolean;
}) => {
  // `barWidth` already applies the 2px floor: a measured-but-tiny value gets a
  // visible sliver, because a bar of zero width is indistinguishable from the
  // no-bar an unmeasured value draws.
  const width = barWidth(value, max);
  return (
    <div className="flex items-center gap-2.5 border-b border-border/60 py-2.5 text-[12px] last:border-0">
      <span className="w-[150px] shrink-0 truncate text-foreground">{label}</span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
        {width === null ? null : (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width, background: muted ? "#c3cad1" : VIZ_SUBJECT }}
          />
        )}
      </span>
      <span className="w-[110px] shrink-0 text-right tabular-nums text-muted-foreground">
        {formatted}
      </span>
    </div>
  );
};

/* ─────────────────────────── donut ─────────────────────────── */

const arc = (
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  from: number,
  to: number,
): string => {
  const inner = radius - thickness;
  const large = to - from > Math.PI ? 1 : 0;
  const x1 = cx + radius * Math.cos(from);
  const y1 = cy + radius * Math.sin(from);
  const x2 = cx + radius * Math.cos(to);
  const y2 = cy + radius * Math.sin(to);
  const x3 = cx + inner * Math.cos(to);
  const y3 = cy + inner * Math.sin(to);
  const x4 = cx + inner * Math.cos(from);
  const y4 = cy + inner * Math.sin(from);
  return [
    `M${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A${inner} ${inner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z",
  ].join(" ");
};

export type DonutSlice = { key: string; value: number; color: string };

/**
 * A donut of proportions. Starts at twelve o'clock and runs clockwise.
 *
 * Slices are drawn from the values as given and NOT re-normalised to 100: if
 * the parts do not add up, the ring does not close, and that gap is the honest
 * rendering of an incomplete breakdown.
 */
export const Donut = ({
  slices,
  size = 116,
  thickness = 22,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  className?: string;
}) => {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const box = 130;
  const centre = box / 2;
  const radius = centre - 7;

  let angle = -Math.PI / 2;

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
      role="presentation"
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius - thickness / 2}
        fill="none"
        strokeWidth={thickness}
        stroke="currentColor"
        className="text-foreground/[0.07]"
      />
      {total <= 0
        ? null
        : slices.map((slice) => {
            const value = Math.max(0, slice.value);
            if (value <= 0) return null;
            const sweep = (value / total) * Math.PI * 2;
            const path = arc(centre, centre, radius, thickness, angle, angle + sweep);
            angle += sweep;
            return <path key={slice.key} d={path} fill={slice.color} />;
          })}
    </svg>
  );
};

/** The label block beside a {@link Donut}. */
export const DonutLegend = ({
  entries,
}: {
  entries: { key: string; label: ReactNode; value: ReactNode; color: string }[];
}) => (
  <div className="flex flex-wrap gap-x-5 gap-y-2">
    {entries.map((entry) => (
      <div key={entry.key} className="min-w-0">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.label}
        </span>
        <span className="mt-0.5 block text-[15px] font-semibold tabular-nums text-foreground">
          {entry.value}
        </span>
      </div>
    ))}
  </div>
);

/* ─────────────────────────── misc marks ─────────────────────────── */

/**
 * A rank chip. Gold / silver / bronze for the top three, neutral below.
 *
 * The medal colours carry no data — they are a reading aid for a long list, and
 * are deliberately NOT the series palette so a rank can never be mistaken for a
 * category.
 */
export const RankBadge = ({ rank }: { rank: number }) => (
  <span
    className={cn(
      "mr-2 inline-grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md align-middle text-[10.5px] font-bold tabular-nums",
      rank === 1 && "bg-[#d9a441] text-white",
      rank === 2 && "bg-[#c3cad1] text-white",
      rank === 3 && "bg-[#c8865a] text-white",
      rank > 3 && "bg-foreground/[0.07] text-muted-foreground",
    )}
  >
    {rank}
  </span>
);

/** The "baseline vs subject" legend, so all panels label the pair identically. */
export const CompareLegend = ({
  baselineLabel,
  subjectLabel,
}: {
  baselineLabel: ReactNode;
  subjectLabel: ReactNode;
}) => (
  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: VIZ_BASELINE }}
      />
      {baselineLabel}
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: VIZ_SUBJECT }}
      />
      {subjectLabel}
    </span>
  </span>
);
