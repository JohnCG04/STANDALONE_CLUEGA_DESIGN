import { delay } from "@/lib/delay";

export const JOB_POLL_GAP_MS = 6_000;

let nextSlotAt = 0;

export function reservePollSlot(now: number = Date.now()): number {
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + JOB_POLL_GAP_MS;
  return at;
}

export async function waitForPollSlot(signal?: AbortSignal): Promise<void> {
  const wait = reservePollSlot() - Date.now();
  if (wait > 0) await delay(wait, signal);
}
