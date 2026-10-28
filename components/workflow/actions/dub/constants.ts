import type { DubCapabilities } from "@dogclaw-ad/workflow";

export const DUB_FEATURE = "Video Dub & Translate";

/** Under Video Face Swap's 15 min: a dub does no re-render, only transcribe/translate/TTS + mux. */
export const POLL_BUDGET_MS = 10 * 60_000;
/** Cadence floor; jobPollPacer stretches it under concurrency. */
export const POLL_INTERVAL_MS = 8_000;
/** One token refresh costs 1–2 failing ticks. */
export const MAX_CONSECUTIVE_ERRORS = 5;

/** What the node renders when the server has no dub capabilities to report. */
export const DUB_DISABLED: DubCapabilities = {
  enabled: false,
  max_duration_seconds: 0,
  languages: [],
  defaults: { target_language: "", voice_mode: "preset" },
};
