// Chart.js wiring for the whole app (chart.js + react-chartjs-2): the dashboard
// widget kit's line and bar widgets, and the Usage Analytics page's two blocks.
//
// It lives HERE, beside the widgets, rather than in the page folder it started
// in: the dashboard widgets are the primary consumer now, and one wiring is the
// point — two copies would drift on registration, on theme resolution and on
// the §7.3 tooltip, which are exactly the three things that must not differ
// between two charts sitting on the same screen.
//
// - Registration is explicit and minimal — never `chart.js/auto`, which would
//   pull every controller, scale and plugin into the bundle.
// - Canvas cannot read `var(--widget-*)`, and the widget tokens are the kit's
//   one source of colour (tokens.ts: never hardcode). So `useChartTheme`
//   resolves the tokens from the chart container's computed style and re-reads
//   them when the theme class on <html> flips (useThemeStore toggles `.dark`);
//   the options object changes and the chart repaints in the new colours.
// - The option fragments every chart shares (axes, tooltip) live here: the
//   widget library's label thinning (`thinAxisLabels`) and compact tick
//   numbers, and the §7.3 tooltip (dark background, white ink in both themes).
// - One canvas tooltip builder, `widgetTooltip`: it keeps every series in the
//   producer's order and prints an em dash for a gap, because on a board a
//   missing day must read as missing, never as 0 (SeriesPoint.y === null,
//   PRD §6.5). The Usage Analytics blocks switch the canvas tooltip off and
//   render an HTML card from the tooltip model instead (their ChartOverlay),
//   because the design asks for a ruled title and a right-aligned delta column
//   that canvas text cannot draw; that card applies its own reading rules
//   (hide zero rows, sort by magnitude).

import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { MatrixController, MatrixElement } from "chartjs-chart-matrix";
import {
  ArcElement,
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Chart,
  type AnimationsSpec,
  type ChartType,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  type Plugin,
  PointElement,
  type Scale,
  Tooltip,
  type TooltipItem,
  type TooltipModel,
} from "chart.js";

import { useWidgetActions } from "@/components/dashboard/widgets/widgetActionsContext";
import {
  easeOut,
  figuresSignature,
  DRAW_MS,
  SETTLE_MS,
  readMotionEnv,
  resolveMotionMode,
  motionSuppressed,
  UPDATE_MS,
  type MotionMode,
} from "@/components/dashboard/widgets/motion";
import {
  font,
  overlay,
  paletteFor,
  seriesOf,
  weight,
  type WidgetPalette,
} from "@/components/dashboard/widgets/tokens";
import {
  formatCompact,
  distinctTickDigits,
  formatFullNumber,
  middleTruncate,
  thinAxisLabels,
} from "@/components/dashboard/widgets/widgetFormat";

// Bề rộng ký tự ước lượng ở font.caption, và khoảng hở tối thiểu giữa hai nhãn
// phân loại kề nhau. 7px/ký tự (không phải 6.5 như trục ngày) vì tên chiến dịch
// nhiều chữ hoa: ở 6.5 + hở 6px, năm nhãn còn đè nhau tới 480px (đo 2026-09-03).
const LABEL_CHAR_PX = 7;
const LABEL_GAP_PX = 14;

// --- Motion -----------------------------------------------------------------

export type ChartMotionKind = "line" | "bar" | "doughnut" | "matrix" | "bubble";

interface FadeState { t0: number; done: boolean; saved: boolean }

/**
 * Fades the datasets in once, on the chart's first draw, then never again. With
 * `wipe` (heatmap) the plot is also revealed left to right, so the cells, and
 * the figures drawn over them, come in column by column.
 */
const fadeInPlugin: Plugin = {
  id: "widgetFadeIn",
  defaults: { duration: 0 },
  beforeDatasetsDraw(chart, _args, opts: { duration?: number; wipe?: boolean }) {
    // destroy() nulls ctx; a widget edited or removed mid fade must not draw
    if (!chart.ctx) return;
    const holder = chart as unknown as { $fade?: FadeState };
    const state = (holder.$fade ??= { t0: Date.now(), done: false, saved: false });
    if (state.done) return;
    const duration = opts.duration ?? 0;
    const t = duration > 0 ? (Date.now() - state.t0) / duration : 1;
    if (t >= 1) {
      state.done = true;
      return;
    }
    chart.ctx.save();
    chart.ctx.globalAlpha = easeOut(t);
    if (opts.wipe) {
      const area = chart.chartArea;
      chart.ctx.beginPath();
      chart.ctx.rect(0, 0, area.left + area.width * easeOut(t), chart.height);
      chart.ctx.clip();
    }
    state.saved = true;
    // the chart may be destroyed before the frame fires (ctx is null then)
    requestAnimationFrame(() => {
      if (chart.ctx) chart.draw();
    });
  },
  afterDatasetsDraw(chart, _args, opts: { wipe?: boolean }) {
    const state = (chart as unknown as { $fade?: FadeState }).$fade;
    if (state?.saved && !opts.wipe) {
      chart.ctx?.restore();
      state.saved = false;
    }
  },
  // A wipe stays open until every plugin has drawn its figures over the cells.
  afterDraw(chart, _args, opts: { wipe?: boolean }) {
    const state = (chart as unknown as { $fade?: FadeState }).$fade;
    if (state?.saved && opts.wipe) {
      chart.ctx?.restore();
      state.saved = false;
    }
  },
};

type DelayCtx = { dataIndex?: number; index?: number; type?: string; mode?: string };

/** Delay by data index for the first draw only (not for hover or later updates). */
const stagger = (step: number) => (ctx: DelayCtx) =>
  ctx.type !== "data" || ctx.mode !== "default" ? 0 : (ctx.dataIndex ?? ctx.index ?? 0) * step;

/** Per-element grow time and start step so the LAST of `n` elements ends at DRAW_MS. */
export function cascade(n: number): { grow: number; step: number } {
  if (n <= 1) return { grow: DRAW_MS, step: 0 };
  const grow = DRAW_MS / 2;
  return { grow, step: (DRAW_MS - grow) / (n - 1) };
}

/**
 * The one motion config every chart spreads into its options. A cell finishes
 * its first draw in DRAW_MS.
 *
 * `off` is `animation: false` (instant). `full` is one effect per kind:
 * - line: progressive, each point (x and y) appears in turn so the line traces
 *   along the time axis;
 * - bar: bars grow from their base one after another, staggered by data index;
 * - doughnut: the ring rotates open and scales out from the centre;
 * - bubble: each bubble scales up from radius 0, staggered by index;
 * - matrix: the grid is wiped in left to right, column by column.
 * `fade` (a dense board): elements do not travel, the plugin fades them in.
 * `settled` says the first draw is over: every kind then tweens UPDATE_MS on a
 * data change. `count` is the number of points / categories / bubbles, which
 * sets the stagger step so the cascade fits its window (see motion.ts).
 */
export function chartMotionOptions<TType extends ChartType = ChartType>(kind: ChartMotionKind, mode: MotionMode, settled: boolean, count = 0) {
  if (mode === "off") {
    return {
      animation: false as const,
      animations: undefined as AnimationsSpec<TType> | undefined,
      transitions: undefined,
      plugins: { widgetFadeIn: { duration: 0, wipe: false } },
    };
  }
  const resize = { resize: { animation: { duration: 0 } } };
  const n = Math.max(1, count);
  if (settled) {
    return {
      animation: { duration: UPDATE_MS, easing: "easeOutCubic" as const },
      animations: undefined as AnimationsSpec<TType> | undefined,
      transitions: resize,
      plugins: { widgetFadeIn: { duration: 0, wipe: false } },
    };
  }
  if (mode === "fade") {
    return {
      animation: { duration: 0 },
      animations: undefined as AnimationsSpec<TType> | undefined,
      transitions: resize,
      plugins: { widgetFadeIn: { duration: DRAW_MS, wipe: false } },
    };
  }
  const base = { easing: "easeOutCubic" as const };
  let animation: Record<string, unknown> = { ...base, duration: DRAW_MS };
  let animations: Record<string, unknown> | undefined;
  let plugin = { duration: 0, wipe: false };
  if (kind === "line") {
    // One point per step; each point appears when its own short animation ends.
    const step = DRAW_MS / n;
    const point = { type: "number", easing: "linear", duration: step, from: Number.NaN, delay: stagger(step) };
    animations = { x: point, y: point };
  } else if (kind === "bar") {
    const { grow, step } = cascade(n);
    animation = { ...base, duration: grow, delay: stagger(step) };
  } else if (kind === "doughnut") {
    animation = { ...base, duration: DRAW_MS, animateRotate: true, animateScale: true };
  } else if (kind === "bubble") {
    const { grow, step } = cascade(n);
    animation = { ...base, duration: 0 };
    animations = { radius: { duration: grow, easing: "easeOutCubic", from: 0, delay: stagger(step) } };
  } else if (kind === "matrix") {
    animation = { duration: 0 };
    plugin = { duration: DRAW_MS, wipe: true };
  }
  return {
    animation: animation as { duration: number },
    animations: animations as AnimationsSpec<TType> | undefined,
    transitions: resize,
    plugins: { widgetFadeIn: plugin },
  };
}

/**
 * This cell's motion options, from the panel's live / dense signal and the env.
 * The first-draw window opens when the chart FIRST HAS DATA (`ready`), not at
 * mount, so a cell that is built while its figures are still on the way draws
 * in exactly as one reopened with its figures already there.
 */
// The chart type comes from `kind` rather than from a default, because the
// default was `ChartType` — the union of every registered chart — and
// `AnimationsSpec` of that union does not assign to `ChartOptions<"bar">`.
// Only PieChart passed the parameter explicitly, so BarPlot's options object
// stopped typechecking as soon as chart.js tightened the spec.
export function useChartMotion<TType extends ChartMotionKind & ChartType>(kind: TType, count = 0, ready = true) {
  const cell = useWidgetActions().motion;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [ready]);
  const live = cell?.live === true;
  const dense = cell?.dense === true;
  return useMemo(() => {
    const mode = resolveMotionMode({ suppressed: motionSuppressed(readMotionEnv()), live, dense });
    return chartMotionOptions<TType>(kind, mode, settled, count);
  }, [kind, live, dense, settled, count]);
}

/**
 * The same `data` object while its figures are unchanged. The streamed board's
 * final frame replaces every slot with new objects carrying the same numbers;
 * Chart.js must not see that as an update (no second tween or replay). `dep`
 * (the theme) is compared by identity, since colours may live in closures.
 */
export function useStableData<T>(data: T, dep?: unknown): T {
  const sig = figuresSignature(data);
  const [held, setHeld] = useState({ sig, dep, data });
  if (held.sig === sig && held.dep === dep) return held.data;
  setHeld({ sig, dep, data });
  return data;
}

/**
 * Keeps the canvas as big as the box it sits in, whatever the draw-in is doing.
 *
 * Chart.js defers a resize while an animation runs (`_resizeBeforeDraw`), and a
 * card whose width settles during the first draw (skeleton filling in, panel
 * opening, grid reflow) kept the width it was first measured at: the plot
 * filled the left half of the card. This observes the box, and when the canvas
 * no longer matches its container it ends the running animation and resizes
 * straight away (public API only: stop() then resize(w, h)).
 */
export function useChartFit(boxRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const canvas = box.querySelector("canvas");
      const holder = canvas?.parentElement;
      const chart = canvas ? Chart.getChart(canvas) : undefined;
      if (!chart || !holder) return;
      const w = holder.clientWidth;
      const h = holder.clientHeight;
      if (w <= 0 || h <= 0) return;
      if (Math.abs(chart.width - w) < 1 && Math.abs(chart.height - h) < 1) return;
      chart.stop();
      chart.resize(w, h);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [boxRef]);
}

Chart.register(
  fadeInPlugin,
  ArcElement,
  DoughnutController,
  LineController,
  LineElement,
  PointElement,
  Filler,
  BarController,
  BarElement,
  BubbleController,
  MatrixController,
  MatrixElement,
  CategoryScale,
  LinearScale,
  Tooltip,
);

declare module "chart.js" {
  interface PluginOptionsByType<TType extends ChartType> {
    /** First-draw fade of the datasets (matrix, scatter, dense boards); ms, 0 = off. */
    widgetFadeIn?: { duration: number; wipe?: boolean };
    /** The vertical hover rule drawn by `hoverLinePlugin`. */
    usageHoverLine?: { color: string };
    /** The cluster fit applied by `clusterFitPlugin`. */
    widgetClusterFit?: { maxBarPx?: number; ceiling?: number };
    /** The horizontal rule drawn by `referenceLinePlugin`. */
    widgetReferenceLine?: {
      value: number; label: string; color: string; font: string;
      /** Card surface, painted behind the label so a series cannot cross it. */
      background?: string;
    };
    /** The per-category captions drawn by `groupAnnotationPlugin`. */
    widgetGroupAnnotation?: { labels: Array<string | undefined>; color: string; font: string };
  }
}

type UsageChartType = "line" | "bar" | "doughnut" | "bubble" | "matrix";

const CAPTION_PX = parseInt(font.caption, 10);
const BODY_PX = parseInt(font.body, 10);

// --- Theme ------------------------------------------------------------------

/**
 * The widget tokens a chart paints with, resolved to concrete values.
 *
 * `series` is here for the same reason the greys are: `chartSeries` in tokens.ts
 * holds `var(--widget-series-1)` strings, and **canvas cannot parse a CSS
 * variable** — `ctx.strokeStyle = "var(--x)"` is silently ignored and the shape
 * is drawn in the previous colour. Measured 2026-09-03: both line-chart series
 * came out near-black, so a two-series board looked like one metric drawn
 * twice. HTML (the legend dots) still uses the token strings directly.
 */
export interface ChartTheme {
  inkMuted: string;
  /** Read by the scatter's canvas plugin (labels, badges); the other charts ignore them. */
  inkPrimary: string;
  inkSecondary: string;
  border: string;
  /** The alert red (palette.critical). */
  critical: string;
  grid: string;
  bg: string;
  fontFamily: string;
  series: string[];
  /** The donut ramp's fifth step; `series` stops at three. */
  series4: string;
  /** The strong surface ground (palette.surfaceStrong) — the heatmap's off-hours cell. */
  surface?: string;
}

const cssVarOf = (token: string): string | null =>
  /^var\((--[\w-]+)\)$/.exec(token)?.[1] ?? null;

function readTheme(element: HTMLElement, palette: WidgetPalette): ChartTheme {
  const style = getComputedStyle(element);
  const resolve = (token: string) => {
    const name = cssVarOf(token);
    return (name && style.getPropertyValue(name).trim()) || token;
  };
  return {
    inkMuted: resolve(palette.inkMuted),
    inkPrimary: resolve(palette.inkPrimary),
    inkSecondary: resolve(palette.inkSecondary),
    border: resolve(palette.border),
    critical: resolve(palette.critical),
    grid: resolve(palette.grid),
    bg: resolve(palette.bg),
    fontFamily: style.fontFamily,
    series: seriesOf(palette).map(resolve),
    series4: resolve(palette.series4),
    surface: resolve(palette.surfaceStrong),
  };
}

const sameTheme = (a: ChartTheme, b: ChartTheme) =>
  a.inkMuted === b.inkMuted &&
  a.inkPrimary === b.inkPrimary &&
  a.inkSecondary === b.inkSecondary &&
  a.border === b.border &&
  a.critical === b.critical &&
  a.grid === b.grid &&
  a.bg === b.bg &&
  a.fontFamily === b.fontFamily &&
  a.series4 === b.series4 &&
  a.surface === b.surface &&
  a.series.every((value, index) => value === b.series[index]);

/**
 * The chart's colours and font, read from the container so they follow the
 * `.dark` class and the app font without a second source of truth. `null`
 * until measured (and on the server): callers mount the chart only once it is
 * set, so no chart is ever created in the wrong theme. A layout effect, so the
 * first measurement lands before react-chartjs-2's own (passive) effect builds
 * the chart.
 */
export function useChartTheme(
  ref: RefObject<HTMLElement | null>,
  /**
   * Which palette to resolve. OPTIONAL, and the default is the frozen widget
   * tokens — so every existing caller (the bar widget, the Usage Analytics
   * blocks) keeps the exact colours it had. A board that asks for the report
   * presentation passes its palette instead; the resolution mechanism is the
   * same, because canvas cannot read a CSS variable either way.
   */
  palette: WidgetPalette = paletteFor(),
): ChartTheme | null {
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sync = () => {
      // No computed styles (a non-browser DOM): no theme, so no canvas is mounted.
      if (typeof getComputedStyle !== "function") return;
      const next = readTheme(element, palette);
      setTheme((current) => (current && sameTheme(current, next) ? current : next));
    };
    sync();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [palette, ref]);
  return theme;
}

// --- Shared options -----------------------------------------------------------

/**
 * The colour at a given opacity, from a resolved hex (#rrggbb) or rgb() value.
 * `undefined` for any other form, so the caller skips the tint rather than
 * painting it opaque.
 */
export function withAlpha(color: string, alpha: number): string | undefined {
  if (color.startsWith("#") && color.length === 7) {
    return `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
  }
  if (color.startsWith("rgb(") && color.endsWith(")") && !color.includes("/")) {
    const inner = color.slice(4, -1);
    return inner.includes(",") ? `rgba(${inner}, ${alpha})` : `rgb(${inner} / ${alpha})`;
  }
  return undefined;
}

/** The opacity a COMPARE board's non-focused accounts are drawn at on a canvas. */
export const DIM_ALPHA = 0.25;

/** The colour, dimmed to DIM_ALPHA when `dimmed`; unchanged otherwise or when it cannot be tinted. */
export function dimColor(color: string, dimmed: boolean): string {
  return dimmed ? (withAlpha(color, DIM_ALPHA) ?? color) : color;
}

/**
 * Scriptable area fill: `alpha` of the colour at the top of the chart area,
 * fading to nothing at the bottom. Flat until the first layout gives a chartArea.
 */
export function areaGradient(stroke: string, alpha: number) {
  const flat = withAlpha(stroke, alpha);
  const clear = withAlpha(stroke, 0);
  if (!flat || !clear) return undefined;
  return (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
    const area = context.chart.chartArea;
    if (!area) return flat;
    const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, flat);
    gradient.addColorStop(1, clear);
    return gradient;
  };
}

/**
 * Both charts' axes: a category x-axis with no grid, a linear y-axis from zero
 * with solid grid lines, compact tick numbers.
 *
 * X labels follow the kit's rule rather than Chart.js autoSkip: a label budget
 * derived from the axis width, first and last label always kept
 * (`thinAxisLabels`), so this axis thins exactly like every widget's.
 */
export function usageScales(
  theme: ChartTheme,
  labels: string[],
  options: { stacked?: boolean; pxPerLabel: number; yTicks: number },
) {
  const stacked = options.stacked ?? false;
  return {
    x: {
      type: "category" as const,
      stacked,
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: theme.inkMuted,
        font: { family: theme.fontFamily, size: CAPTION_PX },
        padding: 8,
        maxRotation: 0,
        autoSkip: false,
        align: "inner" as const,
        callback(this: Scale, _value: number | string, index: number) {
          const budget = Math.max(3, Math.floor(this.width / options.pxPerLabel));
          return thinAxisLabels(labels, budget)[index];
        },
      },
    },
    y: {
      type: "linear" as const,
      stacked,
      beginAtZero: true,
      border: {
        display: false,
      },
      grid: { color: theme.grid, drawTicks: false },
      ticks: {
        color: theme.inkMuted,
        font: { family: theme.fontFamily, size: CAPTION_PX },
        padding: 8,
        maxTicksLimit: options.yTicks,
        callback: (value: number | string) => formatCompact(Number(value)),
      },
    },
  };
}

/**
 * The board's axes. Same frame as `usageScales`, but the x axis has TWO reading
 * modes, because a board's two chart widgets label their columns for different
 * reasons:
 *   - `thin` (line chart, dates): drop labels, never letters. Every column
 *     keeps its date in the tooltip, so the axis only has to carry enough ticks
 *     to orient — `thinAxisLabels` with a width-derived budget, first and last
 *     always kept.
 *   - `truncate` (bar chart, entity names): keep EVERY label, shorten the text.
 *     A category column with no name is an anonymous bar; thinning would make
 *     two campaigns indistinguishable. Cut in the middle so head and tail both
 *     survive ("Summer…Blast"), inside the width that column actually owns.
 */
export function widgetScales(
  theme: ChartTheme,
  labels: string[],
  options: {
    pxPerLabel: number;
    yTicks: number;
    xMode?: "thin" | "truncate";
    formatTick?: (value: number) => string;
    /**
     * A SECOND y axis on the right. OPT-IN — omitted, the returned object has
     * exactly the two scales it has always had, so every existing chart builds
     * byte-identical options.
     *
     * It draws no gridlines of its own: two sets of horizontal rules at
     * different intervals read as a broken grid, and the left axis already
     * owns them. Its ticks carry their own formatter because the point of the
     * axis is that it is a different unit.
     */
    right?: { formatTick?: (value: number) => string };
    /** Stack the bars of a category (x and y). OPT-IN; absent adds no key. */
    stacked?: boolean;
  },
) {
  const stackedAxis = options.stacked ? { stacked: true as const } : {};
  const xMode = options.xMode ?? "thin";
  const formatTick = options.formatTick;
  const rightAxis = options.right
    ? {
        y1: {
          type: "linear" as const,
          position: "right" as const,
          // NOT `beginAtZero`: a ratio that lives between 2 and 4 drawn from
          // zero is a flat line in the top third of the chart, which is the
          // problem this axis exists to solve.
          beginAtZero: false,
          border: { display: false },
          // The left axis owns the horizontal rules.
          grid: { drawOnChartArea: false, drawTicks: false },
          ticks: {
            color: theme.inkMuted,
            font: { family: theme.fontFamily, size: CAPTION_PX },
            padding: 8,
            maxTicksLimit: options.yTicks,
            callback: (value: number | string) =>
              (options.right?.formatTick ?? formatCompact)(Number(value)),
          },
        },
      }
    : {};
  return {
    x: {
      type: "category" as const,
      ...stackedAxis,
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: theme.inkMuted,
        font: { family: theme.fontFamily, size: CAPTION_PX },
        padding: 8,
        maxRotation: 0,
        autoSkip: false,
        align: "center" as const,
        callback(this: Scale, _value: number | string, index: number) {
          if (xMode === "truncate") {
            // Each category owns one slot of the axis, and its label is CENTRED
            // in that slot — so the budget is the slot minus a gap that keeps
            // two neighbours from touching. Measured 2026-09-03: at 6.5px per
            // character and a 6px gap, five campaign names collided from 240px
            // right up to 480px (capital-heavy names run wider than the digit
            // estimate the date axis was tuned on).
            const slot = this.width / Math.max(1, labels.length);
            const chars = Math.max(4, Math.floor((slot - LABEL_GAP_PX) / LABEL_CHAR_PX));
            return middleTruncate(labels[index] ?? "", chars);
          }
          const budget = Math.max(3, Math.floor(this.width / options.pxPerLabel));
          return thinAxisLabels(labels, budget)[index];
        },
      },
    },
    y: {
      type: "linear" as const,
      ...stackedAxis,
      beginAtZero: true,
      border: {
        display: false,
      },
      grid: { color: theme.grid, drawTicks: false },
      ticks: {
        color: theme.inkMuted,
        font: { family: theme.fontFamily, size: CAPTION_PX },
        padding: 8,
        maxTicksLimit: options.yTicks,
        callback: (value: number | string, _index?: number, ticks?: { value: number }[]) =>
          formatTick
            ? formatTick(Number(value))
            : formatCompact(Number(value), "", distinctTickDigits(ticks?.map((t) => t.value) ?? [Number(value)])),
      },
    },
    // LAST, and the order is load-bearing rather than cosmetic. A dataset that
    // names no `yAxisID` is assigned the FIRST y scale in this object's key
    // order, so spreading the right axis ahead of `y` silently moved every
    // series onto it: measured 2026-09-04, all three series drew against the
    // right scale and the left one, left empty, fell back to Chart.js's 0–1
    // default — a chart whose money lines were labelled "5000.0x".
    ...rightAxis,
  };
}

/**
 * The series name. Both dataset kinds carry `label?: string`, but on a generic
 * TType the dataset type is an unresolved intersection, hence the narrow cast.
 */
const datasetLabel = <TType extends UsageChartType>(item: TooltipItem<TType>): string =>
  (item.dataset as { label?: string }).label ?? "";

/**
 * The board's tooltip: the §7.3 frame (tokens.ts `overlay`: dark background,
 * white ink in both themes), with the WIDGET's reading rules.
 *
 * Three deliberate rules — ones the SVG charts enforced and canvas would
 * otherwise silently drop (and that a credits ledger's tooltip does NOT want):
 *   - every series stays, in the producer's order (the board's legend order),
 *     so the reader compares the same rows in the same places each hover;
 *   - a gap prints an em dash. `null` is "not measured" — filtering it out or
 *     printing 0 are the two ways the old chart could have lied;
 *   - values go through the metric's own formatter, so a ratio does not read
 *     as a count and money keeps its currency.
 *
 * `titles[i]` is the category label for column `i`, taken from the UNTHINNED
 * list: the axis draws only ~4 ticks, so the hovered column usually has no tick
 * to read the date off.
 */
export function widgetTooltip<TType extends UsageChartType>(
  theme: ChartTheme,
  titles: readonly string[],
  formatValue: (value: number) => string = formatFullNumber,
  /**
   * Per-series overrides, keyed by the series name. OPT-IN and empty by
   * default, so every existing tooltip formats exactly as it did.
   *
   * A chart with a second axis has two units on it, and printing a ratio with
   * the money formatter would read "3" where "3.15x" belongs.
   */
  formatByLabel: Record<string, (value: number) => string> = {},
) {
  return {
    mode: "index" as const,
    intersect: false,
    position: "nearest" as const,
    // Drawn as a fixed HTML box over the page, not on the canvas: a canvas
    // tooltip cannot leave the plot, so six series on a short line chart had
    // their last rows cut off by the card. The canvas options below still
    // describe it (and are what the box reads its fonts from).
    enabled: false,
    external: floatingTooltip<TType>,
    backgroundColor: overlay.tooltipBg,
    titleColor: overlay.tooltipInk,
    bodyColor: overlay.tooltipInk,
    titleFont: { family: theme.fontFamily, size: BODY_PX, weight: weight.title },
    bodyFont: { family: theme.fontFamily, size: CAPTION_PX },
    padding: 8,
    cornerRadius: 8,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
    callbacks: {
      title: (items: TooltipItem<TType>[]) => (items[0] ? (titles[items[0].dataIndex] ?? "") : ""),
      label: (item: TooltipItem<TType>) => {
        const name = datasetLabel(item);
        const format = formatByLabel[name] ?? formatValue;
        return ` ${name}  ${typeof item.raw === "number" ? format(item.raw) : "—"}`;
      },
      // Chart.js builds tooltip items from ELEMENTS, and a `null` point has no
      // element — so a series with a gap on the hovered day would simply be
      // absent, which reads as "this series does not exist" rather than "this
      // day was never measured". The rows are added back here, explicitly.
      afterBody: (items: TooltipItem<TType>[]) => {
        const first = items[0];
        if (!first) return [];
        const shown = new Set(items.map((item) => item.datasetIndex));
        return first.chart.data.datasets.flatMap((dataset, index) =>
          shown.has(index) || (dataset.data[first.dataIndex] ?? null) !== null
            ? []
            : [` ${dataset.label ?? ""}  —`],
        );
      },
    },
  };
}

/** The page's one floating chart tooltip, created on first hover. */
function tooltipBox(): HTMLDivElement {
  const id = "widget-chart-tooltip";
  const found = document.getElementById(id);
  if (found instanceof HTMLDivElement) return found;
  const box = document.createElement("div");
  box.id = id;
  box.setAttribute("role", "presentation");
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "60",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 80ms",
    background: overlay.tooltipBg,
    color: overlay.tooltipInk,
    borderRadius: "8px",
    padding: "8px",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  });
  document.body.appendChild(box);
  // A scroll moves the chart from under a fixed box: hide it until the next hover.
  window.addEventListener("scroll", () => { box.style.opacity = "0"; }, { capture: true, passive: true });
  return box;
}

/**
 * Chart.js `external` tooltip: the same title, swatches and lines the canvas
 * tooltip printed, in a box placed beside the hovered point and kept inside
 * the window. Text only (`textContent`), never markup from the data.
 */
function floatingTooltip<TType extends UsageChartType>(context: { chart: Chart; tooltip: TooltipModel<TType> }) {
  if (typeof document === "undefined") return;
  const { chart, tooltip } = context;
  const box = tooltipBox();
  if (tooltip.opacity === 0) {
    box.style.opacity = "0";
    return;
  }
  const family = tooltip.options.bodyFont && "family" in tooltip.options.bodyFont ? String(tooltip.options.bodyFont.family ?? "") : "";
  const rows: HTMLElement[] = [];
  for (const line of tooltip.title ?? []) {
    const title = document.createElement("div");
    title.textContent = line;
    Object.assign(title.style, { fontSize: `${BODY_PX}px`, fontWeight: String(weight.title), marginBottom: "4px" });
    rows.push(title);
  }
  const lines: Array<{ text: string; color?: string }> = [];
  tooltip.body.forEach((part, i) => {
    for (const text of part.lines) lines.push({ text, color: String(tooltip.labelColors[i]?.backgroundColor ?? "") });
  });
  for (const text of tooltip.afterBody ?? []) lines.push({ text });
  for (const { text, color } of lines) {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", fontSize: `${CAPTION_PX}px`, lineHeight: "18px" });
    const swatch = document.createElement("span");
    Object.assign(swatch.style, { width: "8px", height: "8px", flexShrink: "0", background: color || "transparent" });
    const label = document.createElement("span");
    label.textContent = text.trim();
    row.append(swatch, label);
    rows.push(row);
  }
  box.replaceChildren(...rows);
  box.style.fontFamily = family || chart.options.font?.family || "";
  box.style.opacity = "1";
  // Beside the point, on whichever side has the room; never off the window.
  const rect = chart.canvas.getBoundingClientRect();
  const gap = 12;
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  let left = rect.left + tooltip.caretX + gap;
  if (left + width > window.innerWidth - 8) left = rect.left + tooltip.caretX - gap - width;
  const top = Math.min(Math.max(8, rect.top + tooltip.caretY - height / 2), window.innerHeight - height - 8);
  box.style.left = `${Math.max(8, left)}px`;
  box.style.top = `${top}px`;
}

// --- Plugins ----------------------------------------------------------------

/**
 * The vertical rule at the hovered column of the line chart (Chart.js has no
 * crosshair of its own). Drawn before the datasets so it sits under the lines
 * and the hover dots, as the SVG version's did. Colour via
 * `options.plugins.usageHoverLine.color`.
 */
export const hoverLinePlugin: Plugin<"line", { color?: string }> = {
  id: "usageHoverLine",
  beforeDatasetsDraw(chart, _args, options) {
    const [active] = chart.getActiveElements();
    if (!active || !options.color) return;
    const { ctx, chartArea } = chart;
    const x = active.element.x;
    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Keeps the bars of ONE category touching when a bar-thickness cap is in play.
 *
 * Chart.js splits a category into one sub-slot per dataset and a bar FILLS its
 * sub-slot, so a cluster normally reads as a single block. Capping thickness
 * (`maxBarThickness`) breaks that: the bar is centred in its sub-slot and the
 * remainder becomes air INSIDE the cluster — measured 2026-09-03 on a 1266px
 * board, a 246px category gave two 98px sub-slots holding 16px bars, i.e. an
 * 83px hole between the pair of a single campaign while the gap between
 * campaigns was 231px. The reader could not tell which bar belonged to which
 * label.
 *
 * So the cluster is measured instead of guessed: shrink `categoryPercentage`
 * until the sub-slots are exactly bar-width, and let the bar fill one
 * (`barPercentage: 1`). Runs in `beforeDatasetsUpdate` — after layout, so the x
 * scale's real width is known, and before the bar controller reads the
 * percentages to place elements.
 *
 * `ceiling` is the value it relaxes back to on a NARROW panel, where the
 * sub-slot is already thinner than the cap and Chart.js is doing the right
 * thing on its own.
 */
export const clusterFitPlugin: Plugin<"bar", { maxBarPx?: number; ceiling?: number }> = {
  id: "widgetClusterFit",
  beforeDatasetsUpdate(chart, _args, options) {
    const scale = chart.scales.x;
    const categories = chart.data.labels?.length ?? 0;
    const series = chart.data.datasets.length;
    if (!scale?.width || !categories || !series) return;

    const slot = scale.width / categories;
    const ceiling = options.ceiling ?? 0.8;
    const fit = Math.min(ceiling, (series * (options.maxBarPx ?? 16)) / slot);
    for (const dataset of chart.data.datasets) {
      dataset.categoryPercentage = fit;
      dataset.barPercentage = 1;
    }
  },
};

/**
 * A horizontal rule the series is read AGAINST — a break-even, a target.
 *
 * A plugin rather than a constant dataset, and the difference is not cosmetic:
 * a dataset would take a series colour, appear in the legend, enter the
 * magnitude comparison that decides whether two series diverge, and add a row
 * to every tooltip. None of those is true of a target. It is drawn UNDER the
 * datasets so a line that sits on the target still reads as the measurement.
 *
 * Dashed, and labelled in words at the right end, so the rule is identifiable
 * without its colour.
 *
 * The label is drawn ON a patch of the card's own background, not straight
 * onto the canvas. A rule is something the series is read AGAINST, so the
 * series is near it by definition — and on an indexed chart it is near it by
 * CONSTRUCTION, every line starting at exactly the rule's value. Painting the
 * text bare therefore guarantees the one collision the label exists to avoid:
 * measured 2026-09-19, `100 = 12/9` had a line drawn through the middle of it.
 * `background` is the caller's surface colour; without one the patch is
 * skipped and the behaviour is exactly what it was.
 */
export const referenceLinePlugin: Plugin<
  "line",
  { value: number; label: string; color: string; font: string; background?: string }
> = {
  id: "widgetReferenceLine",
  beforeDatasetsDraw(chart, _args, options) {
    const scale = chart.scales.y;
    const { ctx, chartArea } = chart;
    if (!scale || !options?.color || typeof options.value !== "number") return;
    const y = scale.getPixelForValue(options.value);
    // Off the plotted range: drawing it clamped to an edge would claim the
    // target sits at the top of the chart when it is far above it.
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (options.label) {
      ctx.font = options.font;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      if (options.background) {
        const metrics = ctx.measureText(options.label);
        const padX = 3;
        const height =
          (metrics.actualBoundingBoxAscent || 8) +
          (metrics.actualBoundingBoxDescent || 2) +
          2;
        ctx.fillStyle = options.background;
        ctx.fillRect(
          chartArea.right - metrics.width - padX * 2,
          y - 2 - height + (metrics.actualBoundingBoxDescent || 2),
          metrics.width + padX * 2,
          height,
        );
      }
      ctx.fillStyle = options.color;
      ctx.fillText(options.label, chartArea.right - 3, y - 2);
    }
    ctx.restore();
  },
};

/**
 * A caption per CATEGORY, drawn above that category's tallest bar.
 *
 * The ratio between a spend bar and a revenue bar is the finding, and asking a
 * reader to divide two heights by eye is asking them not to. The producer owns
 * the arithmetic — this only positions the string it was given, indexed by
 * category so a chart with fewer captions than groups simply draws fewer.
 */
export const groupAnnotationPlugin: Plugin<
  "bar",
  { labels: Array<string | undefined>; color: string; font: string }
> = {
  id: "widgetGroupAnnotation",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.labels?.length || !options.color) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = options.font;
    ctx.fillStyle = options.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    options.labels.forEach((text, index) => {
      if (!text) return;
      // The tallest element of this category across every dataset, so the
      // caption clears the pair rather than colliding with the taller bar.
      let top = chartArea.bottom;
      let centre: number | null = null;
      chart.data.datasets.forEach((_dataset, di) => {
        const element = chart.getDatasetMeta(di).data[index];
        if (!element) return;
        top = Math.min(top, element.y);
        centre = centre === null ? element.x : (centre + element.x) / 2;
      });
      if (centre === null) return;
      // Above the bar, in the padding the chart reserved for exactly this.
      // Clamped to the CANVAS, not to `chartArea`: the tallest bar of the chart
      // reaches `chartArea.top` by definition, so clamping there drew the
      // caption on top of the bar it belongs to and the card's edge cut it.
      ctx.fillText(text, centre, Math.max(12, top - 4));
    });
    ctx.restore();
  },
};

// --- Fills ------------------------------------------------------------------

const HATCH_TILE = 6;
const hatchCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/**
 * A 45° hatch of `stroke` over a `tint` ground, as a canvas pattern for a
 * scriptable `backgroundColor`. The texture that marks "expired": it must
 * never be mistaken for consumption, and a texture survives colour blindness
 * where a fifth hue does not. Cached per canvas context — the scriptable
 * option is evaluated on every draw. Falls back to the flat colour where a
 * 2D context is unavailable.
 */
export function hatchPattern(
  ctx: CanvasRenderingContext2D,
  stroke: string,
  tint: string,
): CanvasPattern | string {
  let byColor = hatchCache.get(ctx);
  if (!byColor) {
    byColor = new Map();
    hatchCache.set(ctx, byColor);
  }
  const cached = byColor.get(stroke);
  if (cached) return cached;

  const tile = document.createElement("canvas");
  tile.width = HATCH_TILE;
  tile.height = HATCH_TILE;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return stroke;
  tileCtx.fillStyle = tint;
  tileCtx.fillRect(0, 0, HATCH_TILE, HATCH_TILE);
  tileCtx.strokeStyle = stroke;
  tileCtx.lineWidth = 2;
  tileCtx.beginPath();
  tileCtx.moveTo(-1, HATCH_TILE + 1);
  tileCtx.lineTo(HATCH_TILE + 1, -1);
  tileCtx.stroke();

  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return stroke;
  byColor.set(stroke, pattern);
  return pattern;
}
