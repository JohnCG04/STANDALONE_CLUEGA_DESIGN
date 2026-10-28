/** Slug of the trailing Home section for cards whose preset names no category. */
export const OTHER_CATEGORY_SLUG = "other";

/**
 * How many recent projects the Home carousel asks for — long enough that the
 * row actually scrolls, short enough to stay one cheap request. The sidebar's
 * four-row list keeps its own (FLOW_RECENT_PROJECTS_LIMIT).
 */
export const HOME_RECENT_PROJECTS_LIMIT = 12;

/** Placeholder tiles while that row loads — about two screens' worth. */
export const HOME_RECENT_SKELETON_COUNT = 6;

/**
 * How far the pointer must travel before a press on that row counts as a drag
 * rather than a click on the card under it.
 */
export const DRAG_SCROLL_THRESHOLD_PX = 5;

/** How much of its speed a flick keeps each frame after the pointer is gone. */
export const DRAG_SCROLL_FRICTION = 0.94;

/** Below this (px per ms) a release is a stop, not a flick, and a coast ends. */
export const DRAG_SCROLL_MIN_FLICK_VELOCITY = 0.02;

/** How far the row still has to go before an edge counts as reached. */
export const HOME_RECENT_EDGE_EPSILON_PX = 4;

/** Placeholder cards on first paint, and on every "load more" after it. */
export const INITIAL_SKELETON_COUNT = 12;
export const LOAD_MORE_SKELETON_COUNT = 8;

/** The gutter between cards, both ways — a number, not a `gap-*` class,
 *  because the virtualizer positions cards itself. Tailwind's 1, the same as
 *  the trend galleries. */
export const MASONRY_GAP_PX = 4;

/** Columns below the narrowest breakpoint. */
export const BASE_COLUMN_COUNT = 2;

/** Masonry columns per viewport width, widest first. */
export const COLUMN_BREAKPOINTS = [
  { query: "(min-width: 1536px)", columns: 5 },
  { query: "(min-width: 1024px)", columns: 4 },
  { query: "(min-width: 640px)", columns: 3 },
] as const;

/**
 * Cover aspect cycle, keyed by item index. `ratio` (width / height) mirrors the
 * Tailwind class so the masonry can estimate column heights before images load.
 */
export const MEDIA_ASPECTS = [
  { className: "aspect-[4/5]", ratio: 4 / 5 },
  { className: "aspect-square", ratio: 1 },
  { className: "aspect-[3/4]", ratio: 3 / 4 },
  { className: "aspect-[5/4]", ratio: 5 / 4 },
] as const;
