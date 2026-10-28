// When a card that shows no figure found out it had none, and when it may try
// again — read off the slot config the producer stamps on every degraded slot
// (`_apply_fetch_state`: `checked_at`, `retry_after_s`).
//
// Kept apart from `synced_at` on purpose: that is the last GOOD read, absent
// when nothing was ever read, so "could not load" printed next to it would date
// the failure by a success (RD-R-05/06).

export interface StateTiming {
  /** ISO instant this read was tried. */
  checkedAt?: string;
  /** Seconds the producer asks the reader to wait before trying again. */
  retryAfterS?: number;
}

export function readStateTiming(config: unknown): StateTiming {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  const timing: StateTiming = {};
  if (typeof c.checked_at === "string" && Number.isFinite(Date.parse(c.checked_at))) {
    timing.checkedAt = c.checked_at;
  }
  if (typeof c.retry_after_s === "number" && Number.isFinite(c.retry_after_s) && c.retry_after_s > 0) {
    timing.retryAfterS = c.retry_after_s;
  }
  return timing;
}

/** The instant a rate-limited card may try again, or null when either half is missing. */
export function retryAt(timing: StateTiming): Date | null {
  if (!timing.checkedAt || timing.retryAfterS === undefined) return null;
  return new Date(Date.parse(timing.checkedAt) + timing.retryAfterS * 1000);
}

/** "14:05" in the reader's own zone — 24-hour in every locale the app ships. */
export function clockTime(at: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
