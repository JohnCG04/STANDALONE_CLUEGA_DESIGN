"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ACTIVE_TEAM_CHANGED_EVENT } from "@/hooks/useActiveTeam";
import { resetDefaultBrand } from "@/lib/media/defaultBrand";
import { resetBrands } from "@/lib/media/brandSelection";

/**
 * QueryProvider mounts the TanStack Query cache once for the whole /app tree.
 *
 * Why it lives in app/app/layout.tsx rather than inside the app shell: every
 * `/app/*` route renders its own `<AppPage>` instance, so navigating the sidebar
 * unmounts and remounts the entire shell and every fetch-on-mount fires again.
 * A layout, by contrast, is NOT remounted when a child route changes — so a cache
 * held here survives the navigation that would otherwise discard it.
 *
 * That is the whole point: it does not stop the remount, it makes the remount
 * cheap, because the refetch is served from memory instead of the network.
 *
 * The client is created in useState (not at module scope) so each browser session
 * gets its own cache and nothing leaks between requests during SSR.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stable app data stays fresh for the lifetime of this browser page.
            // A sidebar route remount therefore reads memory without issuing a
            // background request; a full page reload creates a new QueryClient.
            //
            // Live resources opt into their own refetchInterval/staleTime, and
            // mutations still update or invalidate their specific query keys.
            staleTime: Infinity,
            // Do not garbage-collect a route's data while this page is open.
            gcTime: Infinity,
            // The app is a single long-lived tab; refetching on every focus
            // change would undo most of what staleTime buys.
            refetchOnWindowFocus: false,
            // A reconnect must not bypass the page-lifetime cache. Screens that
            // require live data declare polling or call refetch explicitly.
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );

  // Team-scoped queries use X-Team-Id and never expire; reset them on team switch.
  useEffect(() => {
    const onTeamChange = () => {
      void queryClient.resetQueries();
      // Two brand caches live OUTSIDE this one and are just as team-scoped:
      // the ambient catalogue the composer's pill reads, and the workspace's
      // chosen default. A brand belongs to exactly one tenant (brandkit.md §9:
      // another tenant's brand is a 404, not a 403), so leaving either behind
      // means offering — and generating under — a brand that does not exist in
      // the workspace the user just switched to.
      resetBrands();
      resetDefaultBrand();
    };
    window.addEventListener(ACTIVE_TEAM_CHANGED_EVENT, onTeamChange);
    return () => window.removeEventListener(ACTIVE_TEAM_CHANGED_EVENT, onTeamChange);
  }, [queryClient]);

  // A bot's skill list is changed from Settings (attach, detach, delete, switch
  // off) and read on the Pulse bot page. Here rather than on that page, so a
  // change made while the page is not open still reaches the list it will read.
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
