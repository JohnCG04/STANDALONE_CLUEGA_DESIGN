"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Shared answer to "this page just refetched everything because I navigated back
 * into it".
 *
 * Every `/app/*` route renders its own shell instance, so returning to a page
 * unmounts and remounts it and its fetch-on-mount runs again. Holding the last
 * result in the query cache — which lives in `app/app/layout.tsx` and is NOT
 * remounted by navigation — stops the skeleton, but on its own it does not stop
 * the request: the page still revalidates. What removes the request is a window in
 * which the snapshot counts as current.
 *
 * The pattern is deliberately non-invasive. A page keeps its own state and its own
 * fetch; it reads the snapshot for its initial state, skips the fetch while the
 * snapshot is fresh, and writes the cache when a fetch lands. No rewiring of its
 * state machine, which is what makes this safe to apply widely.
 *
 * ONE PRECONDITION, and it is not optional: every mutation on the page must write
 * its result into the same cache entry. Skipping a revalidation is only safe if the
 * cached snapshot is already the truth — otherwise leaving the page after an edit
 * and coming back shows the pre-edit list.
 */

/** True when a snapshot taken at `updatedAt` is still inside the fresh window. */
export function isSnapshotFresh(
  updatedAt: number | undefined,
  now: number,
  freshMs: number,
): boolean {
  // 0/undefined means "never written", which is not fresh however wide the window.
  if (!updatedAt) return false;
  // A timestamp in the future would otherwise read as fresh forever; treat any
  // non-positive age as "just written", and anything older than the window as cold.
  const age = now - updatedAt;
  if (age < 0) return true;
  return age < freshMs;
}

export interface CachedSnapshot<T> {
  /** The last result held for this key, or undefined when there is none. */
  snapshot: T | undefined;
  /** Whether that snapshot is recent enough that the page can skip its fetch. */
  fresh: boolean;
}

/**
 * Reads a page's cached snapshot and whether it is still current.
 *
 * Both values are read ONCE, at mount, and deliberately do not update afterwards:
 * they answer "what should this mount do", and a value that changed mid-life would
 * make the page's own fetch effect re-run. The page owns everything after mount.
 */
export function useCachedSnapshot<T>(
  queryKey: readonly unknown[],
  freshMs: number,
): CachedSnapshot<T> {
  const queryClient = useQueryClient();
  const [value] = useState<CachedSnapshot<T>>(() => ({
    snapshot: queryClient.getQueryData<T>(queryKey),
    fresh: isSnapshotFresh(
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
      Date.now(),
      freshMs,
    ),
  }));
  return value;
}
