"use client";

import { useQuery } from "@tanstack/react-query";

import { getTeamMembers } from "@/lib/teams/cdp-teams";

/**
 * Keyed by team, beside the fetcher, so fetch and invalidation name the same
 * thing (the convention PLATFORM_PROFILE_QUERY_KEY / MY_TEAMS_QUERY_KEY set).
 * A different key from the settings Team tab's `["settings","team-members",id]`
 * on purpose: that cache also carries the company roster and is invalidated by
 * membership edits made there — this one only needs a count.
 */
export const FLOW_TEAM_MEMBER_COUNT_QUERY_KEY = [
  "flow",
  "team-member-count",
] as const;

/**
 * How many people are in the active team — the "N Members" line under the
 * workspace name.
 *
 * Team members (not tenant users): the sidebar's switcher changes the TEAM, so
 * the count next to the team's name has to be the team's. Null while unknown —
 * the header renders nothing for the line rather than "0 Members", because zero
 * is a real answer and unknown is not.
 *
 * Membership changes about as often as never, so the answer is cached for five
 * minutes and a failure is not retried: an optional caption must not turn one
 * refused request into three.
 */
export function useWorkspaceMemberCount(teamId: string | null): number | null {
  const { data } = useQuery({
    queryKey: [...FLOW_TEAM_MEMBER_COUNT_QUERY_KEY, teamId],
    // `enabled` guards the null case; the assertion only satisfies the type.
    queryFn: () => getTeamMembers(teamId as string),
    enabled: Boolean(teamId),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ? data.length : null;
}
