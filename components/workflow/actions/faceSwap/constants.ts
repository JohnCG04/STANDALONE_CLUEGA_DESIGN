export const FACE_SWAP_FEATURE = "Face Swap";
export const FACE_DETECT_FEATURE = "Face Detect";

export const FACE_SWAP_OPERATION = "face_swap";

/** Fallbacks for a slider left unset or out of range. */
export const FACE_SWAP_DEFAULTS = {
  feather: 0.12,
  maskScale: 1,
  colorStrength: 1,
  cropPad: 1.5,
} as const;

/** How long a swap is allowed to run before the node stops waiting. */
export const POLL_BUDGET_MS = 300_000;
/** Cadence floor — the shared jobPollPacer stretches it under concurrency. */
export const POLL_INTERVAL_MS = 6_000;
/** One token refresh costs 1–2 failing ticks. */
export const MAX_CONSECUTIVE_ERRORS = 5;
