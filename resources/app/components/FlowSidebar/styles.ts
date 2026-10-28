export const SIDEBAR_SURFACE =
  "border-neutral-200/70 bg-[#FCFCFC] dark:border-sidebar-border dark:bg-sidebar";

export const ICON_STROKE = "[stroke-width:1.5]";
export const ICON_STROKE_SM = "[stroke-width:1.71]";

/** A 32px navigation row. Combine with ROW_IDLE or ROW_ACTIVE. */
export const ROW =
  "flex h-8 w-full min-w-0 items-center rounded-lg p-2 text-left text-[13px] font-medium leading-none transition-colors";

export const ROW_IDLE =
  "text-neutral-600 hover:bg-neutral-900/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.06]";

export const ROW_ACTIVE =
  "bg-neutral-900/[0.05] text-neutral-900 dark:bg-white/[0.08] dark:text-neutral-50";

/** Kept on screen, greyed out and inert. */
export const ROW_DISABLED =
  "cursor-not-allowed opacity-50 hover:bg-transparent dark:hover:bg-transparent";

/** The leading icon of a row. */
export const ROW_ICON = `mr-2 size-4 shrink-0 ${ICON_STROKE} text-neutral-500 dark:text-neutral-400`;

/** A 32px icon-only button (footer). */
export const ICON_BUTTON =
  "group flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-900/[0.04] hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100";

/** The small trailing pill on a row ("New", "Soon"). */
export const BADGE =
  "inline-flex h-5 shrink-0 items-center rounded-md bg-emerald-500/15 px-2 text-[11px] font-bold leading-none text-emerald-700 dark:text-emerald-300";

/** A section title ("Favorites", "Recent Projects"). */
export const SECTION_LABEL =
  "text-[11px] font-bold leading-none tracking-wide text-neutral-500 dark:text-neutral-400";

/** The hairline between row groups. */
export const DIVIDER = "my-1 h-px shrink-0 bg-neutral-200/70 dark:bg-neutral-800";

/** The translucent hover fill, for one-off hit areas (workspace header). */
export const HOVER_FILL = "hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06]";
