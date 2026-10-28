"use client";

import { useQuery } from "@tanstack/react-query";

import { useActiveTeam } from "@/hooks/useActiveTeam";
import { FLOW_FAVORITE_PROJECTS_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import {
  listProjects,
  type FlowProject,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

/**
 * How many starred projects the sidebar lists before offering "View all". A
 * little roomier than Recent (4): favorites are a deliberate pick, so the list
 * IS the point, but the section still has to leave room for the ones below it.
 */
export const FLOW_FAVORITE_PROJECTS_LIMIT = 6;

/** Team-suffixed like the Recent key — `GET /projects` is scoped by X-Team-Id. */
export const flowFavoriteProjectsQueryKey = (team: string | null) =>
  [...FLOW_FAVORITE_PROJECTS_QUERY_KEY, { team }] as const;

/** Same window as the page's list and the Recent section. */
const FAVORITES_FRESH_MS = 30_000;

/** What the query holds: the first page of starred projects and the true total. */
export interface FlowFavoriteProjectsSnapshot {
  items: FlowProject[];
  totalItems: number;
}

export interface FlowFavoriteProjectsResult {
  projects: FlowProject[];
  /** Server total across all pages — more than `projects.length` means "View all" has something to show. */
  totalItems: number;
  isLoading: boolean;
  /** The read failed; the section says so rather than claiming "no favorites". */
  failed: boolean;
}

/**
 * The sidebar's Favorites list: `GET /projects?favorite=true`, newest edit
 * first. Its own narrow query for the same reasons as `useFlowRecentProjects`
 * (the page's hook owns filters and optimistic edits over its own rows and must
 * not be mounted twice), and it waits for the active team to resolve so the
 * list is fetched once, under the right key.
 */
export function useFlowFavoriteProjects(): FlowFavoriteProjectsResult {
  const { activeId, loading: teamLoading } = useActiveTeam();

  const { data, isPending, isError } = useQuery({
    queryKey: flowFavoriteProjectsQueryKey(activeId),
    queryFn: ({ signal }) =>
      listProjects({
        page_no: 1,
        limit: FLOW_FAVORITE_PROJECTS_LIMIT,
        favorite: true,
        sort: "updated_at",
        order: "desc",
        signal,
      }).then(
        (result): FlowFavoriteProjectsSnapshot => ({
          items: result.items,
          totalItems: result.pagination.total_items,
        }),
      ),
    enabled: !teamLoading,
    staleTime: FAVORITES_FRESH_MS,
    retry: false,
  });

  return {
    projects: data?.items ?? [],
    totalItems: data?.totalItems ?? 0,
    isLoading: teamLoading || (isPending && !isError),
    failed: isError,
  };
}
