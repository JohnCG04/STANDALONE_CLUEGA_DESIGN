"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chart, ChartType, TooltipItem, TooltipModel } from "chart.js";

import { cn } from "@/lib/utils";

// The two hover surfaces of the Usage Analytics charts, drawn in HTML rather
// than on the canvas.
//
// Chart.js's own tooltip is a canvas-painted block of text: one font, one
// colour per line, no boxes and no right-aligned second column. The design
// asks for a light card with a rule under its title, a round swatch per row,
// a bold figure and a muted delta pushed to the right edge — none of which
// that renderer can express. So the tooltip is switched off (`enabled: false`)
// and its MODEL is forwarded to React through the `external` hook, which is
// the supported seam for exactly this.
//
// Two shapes come out of it, because the two charts answer different
// questions: the line chart's card lists every model that moved that day, and
// the bar chart's pill states the day's one total above the column it belongs
// to.

/** How long the enter/exit fade and the slide between columns take, in ms. */
const MOVE_MS = 160;
const FADE_MS = 120;
/** The easing both overlays glide on — quick out, soft landing. */
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** One line of the tooltip card. */
export interface OverlayRow {
  /**
   * Unique within one hover, and it must NOT be the label: two raw model ids
   * can print the same name (the router-prefixed spelling and the bare one
   * both read "Google - Gemini 3 Pro Image"), and keying React on the label
   * then collides — which is what made rows look duplicated and swap under a
   * fast hover. The dataset index is unique by construction.
   */
  key: string;
  label: string;
  color: string;
  /** Already formatted — the card never does arithmetic. */
  value: string;
  /** The same figure unformatted, for callers that total the rows. Parsing it
   *  back out of `value` would break on the first locale with a decimal comma. */
  raw: number;
  /** The change against the previous bucket, formatted; omitted when unknown. */
  delta?: string;
  /** Which way that change went, so the row can point without re-parsing the
   *  sign out of `delta`. */
  trend?: "up" | "down" | "flat";
  /** Draws the swatch hatched, matching a hatched series in the plot. */
  hatched?: boolean;
}

export interface OverlayModel {
  title: string;
  /** What the delta column is measured AGAINST — "vs Sep 11". Printed over
   *  that column, because a bare percentage says nothing on its own. */
  caption?: string;
  rows: OverlayRow[];
  /** Where the hovered column sits, in px inside the chart container. */
  caretX: number;
  caretY: number;
  /** Top of the hovered column — where the bar chart hangs its pill. */
  columnTop: number;
}

/** What a builder returns: the rows, plus what their delta is measured against. */
export interface OverlayContent {
  rows: OverlayRow[];
  caption?: string;
}

/** A stable signature, so an unchanged hover does not re-render the page. */
function signatureOf(model: OverlayModel | null): string {
  if (!model) return "";
  const rows = model.rows
    .map((row) => `${row.key}:${row.value}:${row.delta ?? ""}`)
    .join("|");
  return `${model.title}/${model.caption ?? ""}@${Math.round(model.caretX)},${Math.round(model.caretY)},${Math.round(model.columnTop)}#${rows}`;
}

/**
 * Bridges Chart.js's tooltip model into React state.
 *
 * `buildRows` is held in a ref rather than closed over: it is rebuilt on every
 * render of the calling component (it usually reads `t` and the series), and a
 * changing `external` identity makes Chart.js rebuild its options object,
 * which restarts the animation on every hover frame.
 */
export function useChartOverlay<TType extends ChartType>(
  buildContent: (items: TooltipItem<TType>[]) => OverlayContent,
) {
  const [model, setModel] = useState<OverlayModel | null>(null);
  const signature = useRef("");
  const build = useRef(buildContent);
  // Synced in an effect rather than assigned during render. Chart.js only ever
  // calls `external` from a pointer event, which is long after the effects of
  // the render that produced the current builder — so the ref is never read
  // stale, and render stays free of side effects.
  useLayoutEffect(() => {
    build.current = buildContent;
  });

  const external = useCallback(
    ({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<TType> }) => {
      if (tooltip.opacity === 0 || tooltip.dataPoints.length === 0) {
        if (signature.current !== "") {
          signature.current = "";
          setModel(null);
        }
        return;
      }
      const items = tooltip.dataPoints as TooltipItem<TType>[];
      const content = build.current(items);
      const next: OverlayModel = {
        title: tooltip.title[0] ?? "",
        caption: content.caption,
        rows: content.rows,
        caretX: tooltip.caretX,
        caretY: tooltip.caretY,
        // The highest element of the hovered column, so a pill clears the
        // whole stack rather than the segment that happened to be hit.
        columnTop: items.reduce((top, item) => Math.min(top, item.element.y), chart.chartArea.bottom),
      };
      const nextSignature = signatureOf(next);
      if (nextSignature === signature.current) return;
      signature.current = nextSignature;
      setModel(next);
    },
    [],
  );

  return { model, external };
}

/**
 * Presence for an overlay: WHAT to draw, and whether it may animate yet.
 *
 * Two things a hover overlay cannot do on its own:
 *
 * `shown` outlives the hover by `FADE_MS`. Without that an overlay vanishes
 * the frame the pointer leaves — there is nothing left mounted to fade, so a
 * card that glides in would still blink out. `value ?? held` rather than a
 * state copy, so the incoming value is drawn on the very render it arrives.
 *
 * `glide` stays false for the overlay's first frames. Both overlays are placed
 * from their own measured box, so their first render sits at a zero-width
 * guess and the second at the truth; transitioning across that pair would
 * slide the card in from a position it never meant to have. Held off for one
 * animation frame — by which time the measuring layout effect has run and the
 * real position is what was painted — the same transition instead fades it in
 * where it belongs, and from then on carries it between columns.
 */
function useOverlayPresence<T>(value: T | null): { shown: T | null; glide: boolean } {
  const [held, setHeld] = useState<T | null>(null);
  const [glide, setGlide] = useState(false);
  const shown = value ?? held;
  const present = shown !== null;

  useEffect(() => {
    if (value !== null) {
      setHeld(value);
      return;
    }
    const timer = window.setTimeout(() => setHeld(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (!present) {
      setGlide(false);
      return;
    }
    const frame = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(frame);
  }, [present]);

  return { shown, glide };
}

function Swatch({ color, hatched }: { color: string; hatched?: boolean }) {
  return (
    <span
      className="mt-[1px] size-2 shrink-0 rounded-full"
      style={
        hatched
          ? {
              backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)`,
              backgroundColor: color,
            }
          : { background: color }
      }
    />
  );
}

/** The arrow that carries the direction, so the sign is not the only cue. */
const TREND_MARK: Record<NonNullable<OverlayRow["trend"]>, string> = {
  up: "▲",
  down: "▼",
  flat: "–",
};

const TREND_TONE: Record<NonNullable<OverlayRow["trend"]>, string> = {
  // This card reads SPEND, so a rise is the one worth catching the eye.
  up: "text-rose-500 dark:text-rose-400",
  down: "text-emerald-600 dark:text-emerald-400",
  flat: "text-neutral-400 dark:text-neutral-500",
};

/**
 * The floating card: a title, a column header naming what each figure is, then
 * one row per series — swatch, name, credits, and the change against the
 * previous bucket.
 *
 * The name is PRINTED rather than left to the legend. With more series than
 * the palette has colours two rows can wear the same hue, and two spellings of
 * one model id print the same name — in both cases a nameless list of numbers
 * reads as the same row repeated.
 *
 * It is measured before it is placed (`useLayoutEffect` reading the rendered
 * box) rather than placed from an estimate. The card's height changes with the
 * number of rows — the credits chart can show one model or eight — so a fixed
 * guess would either clip the card at the top of the plot or leave it floating
 * far from the column it describes.
 */
export function ChartTooltipCard({
  model,
  container,
  valueLabel,
}: {
  model: OverlayModel | null;
  container: { width: number; height: number };
  /** What the figures ARE — "Credits". Printed over the value column. */
  valueLabel?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Kept alive through the exit fade, so the card leaves the way it arrived.
  const { shown, glide } = useOverlayPresence(model);

  // Keyed on the model, which is a fresh object for every distinct hover: the
  // card is measured once per hover, the resulting setBox re-renders it into
  // place, and that second render does not re-run this effect.
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
  }, [shown]);

  if (!shown) return null;

  const GAP = 14;
  // Left of the caret by default — the reader's eye is already there and the
  // card would otherwise cover the part of the line still to be read. Flips
  // when there is no room, which is the near-left edge of the plot.
  const flip = shown.caretX - GAP - box.width < 0;
  const left = flip
    ? Math.min(shown.caretX + GAP, Math.max(0, container.width - box.width))
    : Math.max(0, shown.caretX - GAP - box.width);
  const top = Math.min(
    Math.max(shown.caretY - box.height / 2, 0),
    Math.max(0, container.height - box.height),
  );

  // Measured, settled for a frame, and still hovered — anything less and the
  // card is still being placed, which is drawn invisible and untransitioned.
  const visible = box.height > 0 && glide && model !== null;
  const hasDelta = shown.rows.some((row) => row.delta);

  return (
    <div
      ref={cardRef}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-20 min-w-[208px] max-w-[320px] rounded-2xl px-3.5 py-3",
        "border border-neutral-200/80 bg-white shadow-[0_8px_28px_-6px_rgba(16,24,40,0.18)]",
        "dark:border-neutral-700/80 dark:bg-neutral-900 dark:shadow-[0_8px_28px_-6px_rgba(0,0,0,0.6)]",
      )}
      // Placed from measured geometry, so it stays inside the card that owns
      // it — and moved with a transform rather than by left/top, because that
      // is the pair a browser can glide between columns on the compositor.
      style={{
        transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0) scale(${visible ? 1 : 0.97})`,
        opacity: visible ? 1 : 0,
        transition: glide
          ? `transform ${MOVE_MS}ms ${EASE}, opacity ${FADE_MS}ms ease-out`
          : "none",
      }}
    >
      <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
        {shown.title}
      </div>
      <div className="my-2 h-px bg-neutral-200/80 dark:bg-neutral-700/80" />
      {/* Says what each column is. A bare "+2215.4%" beside a figure is the
          one thing a reader cannot infer — it names neither its unit nor what
          it is measured against, so both are printed here once. */}
      {valueLabel || (hasDelta && shown.caption) ? (
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          <span className="min-w-0 flex-1" />
          <span className="shrink-0 text-right">{valueLabel}</span>
          {hasDelta ? <span className="w-[70px] shrink-0 text-right normal-case">{shown.caption}</span> : null}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {shown.rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <Swatch color={row.color} hatched={row.hatched} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-600 dark:text-neutral-300">
              {row.label}
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
              {row.value}
            </span>
            {hasDelta ? (
              <span
                className={cn(
                  "w-[70px] shrink-0 text-right text-[11px] tabular-nums",
                  row.trend ? TREND_TONE[row.trend] : "text-neutral-400 dark:text-neutral-500",
                )}
              >
                {row.delta ? (
                  <>
                    {row.trend ? <span aria-hidden className="mr-0.5 text-[9px]">{TREND_MARK[row.trend]}</span> : null}
                    {row.delta}
                  </>
                ) : (
                  // A bucket with nothing behind it has no change to state —
                  // an em dash says that, where "0%" would claim a measurement.
                  <span aria-hidden>—</span>
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The value pill that hangs above the hovered column, with a tail down to a
 * ringed dot sitting on the column's crown.
 *
 * It carries the column's TOTAL, which is the one figure a stacked bar does
 * not let you read off the axis — the card beside it still breaks that total
 * into its sources.
 */
export function ChartValuePill({
  model,
  total,
  container,
}: {
  model: OverlayModel | null;
  /** The hovered column's total, already formatted. */
  total: string;
  container: { width: number; height: number };
}) {
  const pillRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Held as ONE pair: the total is cleared the moment the hover ends, so a
  // separately held model would spend the exit fade over an empty pill.
  const hovered = useMemo(() => (model ? { model, total } : null), [model, total]);
  const { shown, glide } = useOverlayPresence(hovered);

  // The pill's width follows its text, so that is what it re-measures on.
  useLayoutEffect(() => {
    const element = pillRef.current;
    if (!element) return;
    const next = element.offsetWidth;
    setWidth((current) => (current === next ? current : next));
  }, [shown?.total]);

  if (!shown) return null;

  // Centred on the column, then pulled inside the plot at the two edges so the
  // first and last day's pill is never half-clipped by the card.
  const half = width / 2;
  const centre = Math.min(Math.max(shown.model.caretX, half), Math.max(half, container.width - half));
  // Must match the pill's own `h-[26px]` — Tailwind cannot read a constant, so
  // the two are stated side by side deliberately.
  const PILL_HEIGHT = 26;
  // The tail's own height (`border-t-[6px]`). Using it as the pill's offset is
  // what makes the tail's tip land exactly on the crown dot instead of
  // stopping short of it.
  const TAIL = 6;
  const top = Math.max(0, shown.model.columnTop - PILL_HEIGHT - TAIL);
  const visible = width > 0 && glide && model !== null;
  // One transition string for all three shapes, so the pill, its tail and the
  // crown dot travel together instead of arriving one after another.
  const motion = glide
    ? `transform ${MOVE_MS}ms ${EASE}, opacity ${FADE_MS}ms ease-out`
    : "none";

  return (
    <>
      <div
        ref={pillRef}
        className="pointer-events-none absolute left-0 top-0 z-20 flex h-[26px] items-center rounded-full bg-blue-600 px-2.5 text-[12px] font-semibold tabular-nums text-white shadow-md"
        style={{
          transform: `translate3d(${Math.round(centre)}px, ${Math.round(top)}px, 0) translateX(-50%) scale(${visible ? 1 : 0.94})`,
          opacity: visible ? 1 : 0,
          transition: motion,
        }}
      >
        {shown.total}
      </div>
      {/* The tail and the crown dot, drawn as two absolutely placed shapes so
          the pill itself stays a plain rounded box that can grow with its text. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-20 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-blue-600"
        style={{
          transform: `translate3d(${Math.round(centre)}px, ${Math.round(top + PILL_HEIGHT)}px, 0) translateX(-50%)`,
          opacity: visible ? 1 : 0,
          transition: motion,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-20 size-2.5 rounded-full border-2 border-white bg-blue-600 dark:border-neutral-900"
        style={{
          transform: `translate3d(${Math.round(centre)}px, ${Math.round(shown.model.columnTop)}px, 0) translate(-50%, -50%)`,
          opacity: visible ? 1 : 0,
          transition: motion,
        }}
      />
    </>
  );
}

/** Tracks the chart container's box, which both overlays clamp themselves to. */
export function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
