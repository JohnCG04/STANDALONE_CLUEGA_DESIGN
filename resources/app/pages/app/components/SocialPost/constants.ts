/** Where the "Schedule" radio seeds its first time — one hour out. */
export const SCHEDULE_SEED_OFFSET_MS = 60 * 60 * 1000;

/** The phone preview's width at its widest; 9:16 derives the height. Kept in
 *  step with the `@[560px]` column in ComposeStep — form (~300px) + this + gap. */
export const PREVIEW_MAX_WIDTH_PX = 224;

/** How often an unsettled post is re-read while it is fresh. */
export const POLL_MS = 4000;
/** TikTok usually settles within minutes; the backend sweeper can take up to an hour. */
export const SLOW_POLL_MS = 30_000;
/** How long a post counts as fresh, before polling slows down. */
export const FAST_POLL_WINDOW_MS = 5 * 60_000;
