"use client";

import { useQuery } from "@tanstack/react-query";

import { useActiveTeam } from "@/hooks/useActiveTeam";
import { FLOW_RECENT_PROJECTS_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import {
  listProjects,
  type FlowProject,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

/**
 * How many rows the sidebar's Recent Projects section lists. Deliberately
 * tighter than the editor's recent-projects submenu (useWorkflowBootstrap,
 * 8 rows): the sidebar is a glance surface, the submenu is a picker.
 */
export const FLOW_RECENT_PROJECTS_LIMIT = 4;

/**
 * The key is shared with the list page through lib/flow/flowQueryKeys.ts (see
 * there for why it sits under the page's prefix); only the team suffix is
 * added here.
 */
export const flowRecentProjectsQueryKey = (
  team: string | null,
  limit: number,
) => [...FLOW_RECENT_PROJECTS_QUERY_KEY, { team, limit }] as const;

/** How long a fetched list counts as current — same window as the page's list. */
const RECENT_FRESH_MS = 30_000;

export interface FlowRecentProjectsResult {
  projects: FlowProject[];
  isLoading: boolean;
  /** The read failed; the section says so rather than claiming "no projects". */
  failed: boolean;
}

/**
 * The most recently edited projects, for the sidebar.
 *
 * Its own narrow query rather than a second `useFlowProjects()`: that hook owns
 * search/sort/page state, a debounce timer and optimistic rename/delete over the
 * page's rows — mounting it twice would run two of each against the same cache.
 * This one only ever asks for page 1 sorted by updated_at.
 *
 * The active team is part of the key, not just of the request: `GET /projects`
 * is scoped by X-Team-Id, so one team's rows must never be shown under another.
 * The id comes from useActiveTeam rather than a one-off localStorage read: that
 * hook also resolves the FALLBACK team (first in the list) when nothing was
 * persisted yet — a resolution that writes localStorage without firing the
 * change event — and re-renders with the new id, which a mount-time read would
 * miss. The query waits for that resolution so the list is fetched once, under
 * the right key.
 *
 * `limit` is part of the key too: Home's carousel asks for a longer row than
 * the sidebar's four, and the two must not share one cache entry — whichever
 * mounted first would otherwise decide how many rows the other gets. Both keys
 * still sit under FLOW_RECENT_PROJECTS_QUERY_KEY, so the existing prefix-wide
 * invalidations reach them both.
 */
export function useFlowRecentProjects(
  limit: number = FLOW_RECENT_PROJECTS_LIMIT,
): FlowRecentProjectsResult {
  const { activeId, loading: teamLoading } = useActiveTeam();

  const { data, isPending, isError } = useQuery({
    queryKey: flowRecentProjectsQueryKey(activeId, limit),
    queryFn: ({ signal }) =>
      listProjects({
        page_no: 1,
        limit,
        sort: "updated_at",
        order: "desc",
        signal,
      }).then((result) => result.items),
    enabled: !teamLoading,
    staleTime: RECENT_FRESH_MS,
    // Optional UI: a failed read shows its error line, it must not retry into
    // the same error three times on a page that already has its own list.
    retry: false,
  });

  return {
    projects: data ?? [],
    isLoading: teamLoading || (isPending && !isError),
    failed: isError,
  };
}
