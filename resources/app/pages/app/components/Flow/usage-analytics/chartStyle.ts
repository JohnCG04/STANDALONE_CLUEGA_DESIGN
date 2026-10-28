// Canvas PAINT for the two Usage Analytics charts: the gradient grounds under
// a line and inside a bar, the rounded caps of a stack, and the dimming a
// column takes while a neighbour is hovered.
//
// Separate from helpers.ts on purpose. helpers.ts is pure view-model maths and
// runs under `node --test`; everything here needs a live
// CanvasRenderingContext2D, which that runtime does not have. Keeping the seam
// here is what lets helpers.test.ts stay a plain node test.
//
// All of it is written as SCRIPTABLE options — Chart.js re-evaluates them on
// every draw, which is exactly what a gradient (needs the laid-out chart area)
// and a hover dim (needs the active element) require. They are therefore also
// on the hot path, so the gradients are cached per canvas context.

import type { ChartArea, ScriptableContext } from "chart.js";

import { withAlpha } from "./helpers";

/** Alpha at the top and the foot of the ground under a line. */
export const LINE_FILL_TOP_ALPHA = 0.22;
export const LINE_FILL_BOTTOM_ALPHA = 0;

/** Alpha at the top and the foot of a bar segment's ground. */
export const BAR_FILL_TOP_ALPHA = 1;
export const BAR_FILL_BOTTOM_ALPHA = 0.55;

/** What a column keeps while ANOTHER column is hovered. */
export const DIMMED_ALPHA = 0.28;

/** The cap radius of a stack's outermost segments, in px. */
export const STACK_CAP_RADIUS = 8;

type GradientCache = Map<string, CanvasGradient>;
const gradients = new WeakMap<CanvasRenderingContext2D, GradientCache>();

/**
 * A top-to-bottom ramp of `color` across `area`, from `topAlpha` to
 * `bottomAlpha`.
 *
 * Cached on the canvas context AND keyed by the area's vertical extent: a
 * gradient is bound to the coordinates it was created with, so a cache keyed
 * on colour alone would keep painting the pre-resize ramp after the card
 * changes height.
 */
export function verticalGradient(
  ctx: CanvasRenderingContext2D,
  area: ChartArea,
  color: string,
  topAlpha: number,
  bottomAlpha: number,
): CanvasGradient | string {
  // Before the first layout the area is degenerate; a zero-height gradient
  // paints nothing, so fall back to the flat colour for that one frame.
  if (area.bottom <= area.top) return withAlpha(color, topAlpha);

  let byKey = gradients.get(ctx);
  if (!byKey) {
    byKey = new Map();
    gradients.set(ctx, byKey);
  }
  const key = `${color}|${topAlpha}|${bottomAlpha}|${Math.round(area.top)}|${Math.round(area.bottom)}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, withAlpha(color, topAlpha));
  gradient.addColorStop(1, withAlpha(color, bottomAlpha));
  byKey.set(key, gradient);
  return gradient;
}

/** The index of the hovered column, or null when nothing is hovered. */
// Generic over the chart type rather than typed as the union: a
// ScriptableContext<"bar"> is NOT assignable to ScriptableContext<"line" | "bar">
// (its `dataset` is invariant), so the union signature rejected its own bar
// callers — an error tsc only reports when it re-checks this file, which is why
// it sat here unnoticed.
function activeIndexOf<TType extends "line" | "bar">(
  context: ScriptableContext<TType>,
): number | null {
  const [active] = context.chart.getActiveElements();
  return active ? active.index : null;
}

/**
 * The translucent ground under a credits line: the series colour at the line,
 * fading to nothing at the baseline.
 */
export function lineAreaFill(color: string) {
  return (context: ScriptableContext<"line">): CanvasGradient | string => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return withAlpha(color, LINE_FILL_TOP_ALPHA);
    return verticalGradient(
      ctx,
      chartArea,
      color,
      LINE_FILL_TOP_ALPHA,
      LINE_FILL_BOTTOM_ALPHA,
    );
  };
}

/**
 * A stack segment's ground: the source colour ramped down the chart, and
 * knocked back to `DIMMED_ALPHA` when some OTHER column is hovered.
 *
 * The dim is what makes the hovered day read as the subject — the mock's
 * "one bar lit, the rest quiet". It is a alpha change rather than a texture
 * because texture already means something on this chart: `hatchPattern` marks
 * expired credits, and a second hatch would make "expired" and "not hovered"
 * the same mark.
 */
export function barSegmentFill(color: string) {
  return (context: ScriptableContext<"bar">): CanvasGradient | string => {
    const { ctx, chartArea } = context.chart;
    const active = activeIndexOf(context);
    if (active !== null && active !== context.dataIndex) {
      return withAlpha(color, DIMMED_ALPHA);
    }
    if (!chartArea) return color;
    return verticalGradient(ctx, chartArea, color, BAR_FILL_TOP_ALPHA, BAR_FILL_BOTTOM_ALPHA);
  };
}

/** The hatched (expired) ground, dimmed on the same rule as a plain segment. */
export function dimmedHatch(
  color: string,
  pattern: (ctx: CanvasRenderingContext2D) => CanvasPattern | string,
) {
  return (context: ScriptableContext<"bar">): CanvasPattern | string => {
    const active = activeIndexOf(context);
    if (active !== null && active !== context.dataIndex) {
      return withAlpha(color, DIMMED_ALPHA);
    }
    return pattern(context.chart.ctx);
  };
}

/**
 * Rounded caps on the OUTERMOST segments of a stacked column, square joins in
 * between — so the column reads as one capsule rather than five stacked
 * lozenges.
 *
 * Which dataset is outermost is decided per column, not per dataset: a day
 * with no top-up has a different segment sitting at its foot, and rounding a
 * fixed dataset index would round the bottom of a segment floating mid-stack.
 * Requires `borderSkipped: false` on the dataset, or Chart.js drops the radius
 * on the joined edges.
 */
export function stackCapRadius(radius: number = STACK_CAP_RADIUS) {
  return (context: ScriptableContext<"bar">) => {
    const { chart, dataIndex, datasetIndex } = context;
    const present = chart.data.datasets.flatMap((dataset, index) =>
      Number(dataset.data[dataIndex] ?? 0) > 0 ? [index] : [],
    );
    if (present.length === 0) return 0;
    const foot = present[0];
    const crown = present[present.length - 1];
    // A single-segment column is both, and gets a full capsule.
    return {
      topLeft: datasetIndex === crown ? radius : 0,
      topRight: datasetIndex === crown ? radius : 0,
      bottomLeft: datasetIndex === foot ? radius : 0,
      bottomRight: datasetIndex === foot ? radius : 0,
    };
  };
}
