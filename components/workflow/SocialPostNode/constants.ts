/** Posts a node keeps in its status list; older ones are still on the platform. */
export const MAX_SAVED_POSTS = 10;

/** How long "Post again" waits for the confirming second click (ms). */
export const CONFIRM_REPOST_MS = 4000;

/** Why an input can't be posted yet, by its status. */
export const INPUT_NOTICE_KEYS = {
  running: "appChat.socialPost.node.mediaRunning",
  notRun: "appChat.socialPost.node.mediaNotRun",
  unappliedEdits: "appChat.socialPost.node.mediaUnappliedEdits",
  unbaked: "appChat.socialPost.node.mediaUnbaked",
} as const;

/** Keeps a step's buttons in reach while the form scrolls; painted with the node card's surface. */
export const STICKY_FOOTER_CLASS =
  "sticky bottom-0 z-10 border-t border-border bg-[var(--cwf-surface,var(--background))] pt-3 pb-1";
