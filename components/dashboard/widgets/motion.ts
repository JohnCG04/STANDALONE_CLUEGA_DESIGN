// Gentle motion for the board's charts and KPI numbers: the pure decisions.
//
// Motion is a courtesy of a LIVE read, never of a restored one. Off (instant,
// the final state at once) when the reader asks for reduced motion, when a test
// flag is set, and for every cell that did not arrive live in this session (see
// `useLiveSlotIds` in motionContext.tsx). A dense board only fades.
//
// Test / e2e switch, either one: `?nomotion=1` in the page URL, or
// `window.__E2E_NO_MOTION = true`.

import type { WidgetSlot } from "./types";

// Every duration of the board's motion lives here, so it is tuned in one place.
// Ease-out throughout, no bounce. Every chart, the KPI count-up and the pie's
// centre total take DRAW_MS from first data, so a board starts and ends together.

/** The one first-draw length; per-element delays and grow times derive from it. */
export const DRAW_MS = 1200;
/** Old-to-new transition on a data change (period / account switch, Refresh). */
export const UPDATE_MS = 450;
/** When a chart stops counting as "first draw". */
export const SETTLE_MS = DRAW_MS + 100;
/** Boards with more cells than this only fade in. */
export const DENSE_BOARD_CELLS = 20;

export type MotionMode = "full" | "fade" | "off";

export interface MotionEnv {
  reducedMotion?: boolean;
  /** The page's `location.search`. */
  search?: string;
  /** `window.__E2E_NO_MOTION`. */
  flag?: unknown;
}

/** True when nothing may move: reduced-motion preference or the e2e flag. */
export function motionSuppressed(env: MotionEnv): boolean {
  if (env.reducedMotion) return true;
  if (env.flag === true || env.flag === 1 || env.flag === "1") return true;
  return new URLSearchParams(env.search ?? "").get("nomotion") === "1";
}

export function readMotionEnv(): MotionEnv {
  if (typeof window === "undefined") return { reducedMotion: true };
  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    reducedMotion = false;
  }
  return {
    reducedMotion,
    search: window.location?.search ?? "",
    flag: (window as unknown as { __E2E_NO_MOTION?: unknown }).__E2E_NO_MOTION,
  };
}

/** The mode a cell draws in: live slots move, a dense board only fades. */
export function resolveMotionMode(opts: { suppressed: boolean; live: boolean; dense: boolean }): MotionMode {
  if (opts.suppressed || !opts.live) return "off";
  return opts.dense ? "fade" : "full";
}

/** What the panel tells a cell about the board's motion. */
export interface CellMotion {
  live: boolean;
  dense: boolean;
}

/** A stable text of a chart's figures: equal when the numbers are, whatever the object identity. */
export function figuresSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(Math.random());
  }
}

/** Ease-out cubic, 0..1. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** The count-up value at progress t; t >= 1 is exactly the target. */
export function countUpValue(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return from + (to - from) * easeOut(t);
}

/**
 * Next live set. Every slot is live the first time this panel sees it, already
 * filled or not, so opening a board (the chat card's Open, a reload) draws it in
 * once (owner, 2026-10-14); after that a slot moves again only when its data
 * changes (a refill, a period or account switch, Refresh). The share view turns
 * motion off as a whole (`cellMotion={false}`).
 */
export function nextLiveIds(
  prev: ReadonlyMap<string, WidgetSlot>,
  live: ReadonlySet<string>,
  slots: readonly WidgetSlot[],
): ReadonlySet<string> {
  let out: Set<string> | null = null;
  for (const slot of slots) {
    if (live.has(slot.slot_id)) continue;
    const before = prev.get(slot.slot_id);
    const moved = before ? slot.state === "ok" && (before.state !== "ok" || before.config !== slot.config) : true;
    if (!moved) continue;
    out ??= new Set(live);
    out.add(slot.slot_id);
  }
  return out ?? live;
}
