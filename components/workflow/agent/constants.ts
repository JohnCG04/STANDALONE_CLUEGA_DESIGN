import type { PlanCopy, PlanStepLabels } from "./types";

/** English: the plan adapter is a plain object with no `t()`; a host passes `planCopy`. */
export const DEFAULT_PLAN_COPY: PlanCopy = {
  unavailable: "I couldn't put a plan together just now. Please try again.",
};

/** Recent turns sent verbatim with every message; older ones travel as the summary. */
export const WINDOW = 15;

/** Turns that must age out before memory is folded again, keeping fold cost roughly flat. */
export const FOLD_AFTER = 6;

/** Longest title taken from a first message, in characters. */
export const TITLE_CAP = 60;

/** Pictures per turn: a vision call is the most expensive thing the panel can do. */
export const MAX_NODE_IMAGES = 4;

/** Extensions the canvas stores video results under. */
export const VIDEO_SUFFIXES = [".mp4", ".mov", ".webm", ".m4v"];

/** How many rows the `@` list offers at once. */
export const MAX_ROWS = 10;

/** How much of a prompt is worth showing as a name. */
export const SNIPPET_CAP = 28;

/** English defaults; the host passes its own labels to localize. */
export const DEFAULT_STEP_LABELS: PlanStepLabels = {
  understand: "Reading your request",
  plan: "Planning the workflow",
  check: "Checking it can run",
};

export const STEP_IDS = { understand: "s1", plan: "s2", check: "s3" } as const;

/** The edge type the editor registers; any other key loses the themed styling. */
export const EDGE_TYPE = "connection";

/** Keys that are never a setting, whichever node they land on. */
export const NOT_A_PARAM: ReadonlySet<string> = new Set(["prompt", "text", "label"]);

/** Gap between the existing graph and a newly planned one, px. */
export const APPEND_GAP = 160;

/** A card's assumed footprint before React Flow measures it; zero would stack the graphs. */
export const NODE_W = 320;
export const NODE_H = 260;

/** How far the block will slide looking for room before it settles anyway. */
export const MAX_SLIDES = 24;
