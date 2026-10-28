"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getMyTeams, MY_TEAMS_QUERY_KEY } from "@/lib/teams/cdp-teams";
import { getCdpToken } from "@/lib/ai-agent/cluega-session-auth";

const ACTIVE_TEAM_KEY = "cdp_active_team";

/** Fired on `window` whenever the active team changes. Any list scoped by
 *  `X-Team-Id` must listen and refetch, or it keeps showing the old team's rows
 *  until a full page reload. */
export const ACTIVE_TEAM_CHANGED_EVENT = "cdp-active-team-changed";

/** getActiveTeamId reads the persisted active team id (for request scoping in P2). */
export function getActiveTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_TEAM_KEY);
}

/**
 * useActiveTeam loads the signed-in user's teams and tracks the active one
 * (persisted in localStorage). Only fetches when a session token is present, so
 * it is safe on public pages. Returns empty teams for users with no team.
 *
 * The team list is cached rather than fetched per mount. Team membership is not
 * realtime data, and this hook is mounted more than once at a time (the NavBar
 * switcher and the settings dropdown) — previously that was one request each,
 * every time either surface remounted. The query cache both caches and dedupes.
 */
export function useActiveTeam() {
  const [activeId, setActiveId] = useState<string | null>(() => getActiveTeamId());
  const [tokenChecked, setTokenChecked] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  // Read the token in an effect, not an initializer: this hook renders on the
  // server too, where localStorage does not exist.
  useEffect(() => {
    setHasToken(Boolean(getCdpToken()));
    setTokenChecked(true);
  }, []);

  const { data: teams = [], isPending, isError, errorUpdateCount } = useQuery({
    queryKey: MY_TEAMS_QUERY_KEY,
    queryFn: getMyTeams,
    enabled: hasToken,
    staleTime: 5 * 60_000,
    // Matches the previous silent catch: on failure the switcher just hides.
    retry: false,
    // A list that FAILED is not asked for again just because a component mounted.
    // TanStack puts a never-loaded query back to `pending` for every refetch, and
    // this hook's `loading` is `isPending`: the Pulse page swaps its content for a
    // skeleton while `loading`, so each remount refetched, flipped to pending,
    // unmounted the page, failed, remounted -- forever, thousands of requests a
    // minute and a page that flickered. A failure is retried by focus or by an
    // explicit invalidate (the Team tab's Retry), not by mounting.
    retryOnMount: false,
  });

  // Resolve the active team once the list arrives, preferring the persisted id and
  // falling back to the first team. Kept as an effect on `teams` rather than being
  // folded into the fetch, so it also re-resolves if the list changes underneath
  // (e.g. the user is removed from the team they had selected).
  useEffect(() => {
    if (!teams.length) return;
    setActiveId((prev) => {
      if (prev && teams.some((t) => t.id === prev)) return prev;
      const stored =
        typeof window === "undefined"
          ? null
          : localStorage.getItem(ACTIVE_TEAM_KEY);
      const next = teams.find((t) => t.id === stored)?.id ?? teams[0]?.id ?? null;
      if (next && typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_TEAM_KEY, next);
      }
      return next;
    });
  }, [teams]);

  const selectTeam = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_TEAM_KEY, id);
      window.dispatchEvent(
        new CustomEvent(ACTIVE_TEAM_CHANGED_EVENT, { detail: id }),
      );
    }
  }, []);

  // Keep every hook instance (NavBar switcher + Settings dropdown) in sync when
  // any one of them switches the active team.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setActiveId(id);
    };
    window.addEventListener(ACTIVE_TEAM_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ACTIVE_TEAM_CHANGED_EVENT, onChange);
  }, []);

  // Signed-out users are not "loading" — they are done, with no teams. Keep that
  // distinction so the switcher hides instead of spinning forever.
  //
  // `isPending` alone is not safe once the request has failed: TanStack puts a
  // never-loaded query back to `pending` for every refetch, and a refetch is exactly
  // what a remount (or `enabled` going false -> true on the first render) triggers.
  // The Pulse page swaps its content for a skeleton while `loading`, so the page
  // unmounted, remounted, refetched and flipped to pending again -- an endless loop
  // of GET /api/v1/me/teams and a flickering screen. After the FIRST failure the
  // answer is "no teams", and a retry runs in the background without un-settling it.
  const everFailed = errorUpdateCount > 0;
  const loading = !tokenChecked || (hasToken && isPending && !everFailed);

  // The effect above lands a render after the list does, so for that one
  // render `loading` was false with a missing or stale id — and every query
  // keyed on the team fetched twice, once for nobody and once for the team.
  const resolvedId =
    teams.length && !teams.some((t) => t.id === activeId)
      ? (teams.find((t) => t.id === getActiveTeamId())?.id ?? teams[0]?.id ?? null)
      : activeId;
  const activeTeam = teams.find((t) => t.id === resolvedId) ?? null;
  // The list could not be read at all — not the same as "no teams", which a
  // caller must not tell the reader when the request simply failed.
  const failed = hasToken && (isError || everFailed) && teams.length === 0;
  return { teams, activeTeam, activeId: resolvedId, selectTeam, loading, failed };
}
