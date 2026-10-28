import type { CancelJob, LiveJobs } from "./types";

/**
 * Every job the session has live, beyond the ledger's `resumable` (rehydrated rows only).
 * A plain object, not React state: a stop must see a job that started between two renders.
 */
export function createLiveJobs(cancel: CancelJob): LiveJobs {
  const live = new Set<string>();

  return {
    remember(jobIds) {
      for (const id of jobIds) if (id) live.add(id);
    },
    forget(jobIds) {
      for (const id of jobIds) live.delete(id);
    },
    async cancelAll() {
      // Snapshot and clear first: a second Stop must not re-send cancels the first one sent.
      const ids = [...live];
      live.clear();

      const results = await Promise.allSettled(ids.map((id) => cancel(id)));
      const cancelled: string[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        (r.status === "fulfilled" ? cancelled : failed).push(ids[i]);
      });
      return { cancelled, failed };
    },
    get ids() {
      return [...live];
    },
  };
}
