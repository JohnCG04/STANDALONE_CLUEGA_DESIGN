import type { SortKey } from "./hooks/useFlowProjects";

/**
 * The grid/list choice is a preference, not page state: it lives in
 * localStorage so it survives a reload and follows the user across visits.
 */
export const VIEW_MODE_STORAGE_KEY = "flow.projectViewMode.v1";

/** The orders the project list can be sorted in, as the picker lists them. */
export const SORT_KEYS: SortKey[] = ["recent", "oldest", "name"];

/**
 * Longest project name the rename editor will submit, in characters (code points, as the
 * backend's rune count). Checked client-side so the user sees a translated message.
 */
export const PROJECT_NAME_MAX_LENGTH = 60;

/** Placeholder cards while the first page of projects loads. */
export const SKELETON_CARD_COUNT = 10;

/** Where the star sits on the card: over the thumbnail's top-right corner. */
export const CARD_STAR_CLASS =
  "absolute right-2 top-2 bg-white/90 shadow-sm backdrop-blur-sm dark:bg-neutral-900/80";

/** The card grid, shared by the real grid and its skeleton so they agree. */
export const PROJECT_GRID_CLASS =
  "mt-6 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5";
