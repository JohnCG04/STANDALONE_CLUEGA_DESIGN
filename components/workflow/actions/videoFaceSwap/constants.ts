export const VIDEO_FACE_SWAP_FEATURE = "Video Face Swap";

export const FACE_SWAP_EDIT_AXIS = "face_swap";

/** media-ai itself waits up to 15 min: the lane keyframe-swaps, then re-renders the clip. */
export const POLL_BUDGET_MS = 15 * 60_000;
/** Cadence floor; jobPollPacer stretches it under concurrency. */
export const POLL_INTERVAL_MS = 8_000;
/** One token refresh costs 1–2 failing ticks. */
export const MAX_CONSECUTIVE_ERRORS = 5;
