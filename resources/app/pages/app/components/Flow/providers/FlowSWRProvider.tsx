"use client";

import { SWRConfig } from "swr";
import type { SWRConfiguration } from "swr";
import type { ReactNode } from "react";

/**
 * The SWR cache for the Flow workspace — mounted INSIDE Flow, not around the
 * app.
 *
 * Why scoped: the rest of `/app` runs on TanStack Query (QueryProvider in
 * app/app/layout.tsx) and keeps doing so. A global SWRConfig would put a second
 * cache in front of every screen and make "which library owns this data" a
 * question you have to answer per hook. Inside Flow the answer is one line: the
 * usage-analytics blocks read SWR, everything else reads react-query.
 *
 * Why the cache Map is module-scoped rather than created per mount: every
 * `/app/*` route renders its own shell, so navigating the sidebar unmounts and
 * remounts FlowPage — and a provider that built its Map in a render would throw
 * the whole cache away on every visit, which is exactly the cost this provider
 * exists to avoid. One Map, created on first use, keeps a return to Flow served
 * from memory. It is still Flow's own cache: nothing outside this provider can
 * reach it.
 */
type FlowCache = Parameters<NonNullable<SWRConfiguration["provider"]>>[0] extends Readonly<
  infer C
>
  ? C
  : never;

let flowCache: FlowCache | undefined;

function flowCacheProvider(): FlowCache {
  flowCache ??= new Map() as FlowCache;
  return flowCache;
}

/**
 * How long two subscribers asking for the same key share one request.
 *
 * Sized to the page's own staleness window (STALE_MS): the KPI row, the three
 * chart blocks and the ledger all mount together and several of them ask for the
 * same series key, and this is what makes that one HTTP request instead of four.
 */
const DEDUPING_INTERVAL_MS = 60_000;

/** Test seam: forget the Flow cache between test cases. */
export function resetFlowSwrCache(): void {
  flowCache = undefined;
}

export function FlowSWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: flowCacheProvider,
        dedupingInterval: DEDUPING_INTERVAL_MS,
        // The app is one long-lived tab. Refetching on every focus change or
        // reconnect would undo what the cache buys and make a chart redraw
        // because somebody alt-tabbed. Blocks that need live data poll or
        // revalidate explicitly.
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        // A remount reads the cache and does NOT reissue the request while the
        // entry is still inside its deduping window — the "navigate away and
        // back" case this provider is here for.
        revalidateIfStale: false,
        // Keep the previous answer on screen while a new key loads: a range or
        // filter change swaps data without a skeleton flash, and a chart keeps
        // its last frame instead of unmounting and rebuilding its canvas.
        keepPreviousData: true,
        errorRetryCount: 1,
      }}
    >
      {children}
    </SWRConfig>
  );
}
