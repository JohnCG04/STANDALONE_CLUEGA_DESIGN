"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { withFlowFavorite } from "@/lib/flow/flowFavorites";
import {
  FLOW_FAVORITE_PROJECTS_QUERY_KEY,
  FLOW_PROJECTS_QUERY_PREFIX,
  FLOW_RECENT_PROJECTS_QUERY_KEY,
} from "@/lib/flow/flowQueryKeys";
import {
  setProjectFavorite,
  type FlowProject,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

import {
  FLOW_FAVORITE_PROJECTS_LIMIT,
  type FlowFavoriteProjectsSnapshot,
} from "./useFlowFavoriteProjects";

/**
 * Star / unstar from the sidebar.
 *
 * The sidebar's two lists are LIVE react-query observers, so the optimistic
 * update is written straight into their caches: the Recent rows flip their
 * flag in place, the Favorites list gains or loses the row. Then the PATCH
 * goes out and — success or failure — both keys are invalidated: on success
 * because the optimistic Favorites row was placed by guess (the list is
 * ordered by updated_at, which the toggle does not bump) and capped at the
 * section's limit; on failure because that IS the rollback. The page's cached
 * lists have no observer, so they are simply dropped (see flowQueryKeys.ts) and
 * the next visit fetches the truth.
 */
export function useFlowFavoriteToggle(): (project: FlowProject) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (project: FlowProject) => {
      const next = !project.favorite;

      queryClient.setQueriesData<FlowProject[]>(
        { queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY },
        (rows) => (rows ? withFlowFavorite(rows, project.id, next) : rows),
      );
      queryClient.setQueriesData<FlowFavoriteProjectsSnapshot>(
        { queryKey: FLOW_FAVORITE_PROJECTS_QUERY_KEY },
        (snapshot) => {
          if (!snapshot) return snapshot;
          const listed = snapshot.items.some((item) => item.id === project.id);
          if (next && !listed) {
            return {
              items: [{ ...project, favorite: true }, ...snapshot.items].slice(
                0,
                FLOW_FAVORITE_PROJECTS_LIMIT,
              ),
              totalItems: snapshot.totalItems + 1,
            };
          }
          if (!next && listed) {
            return {
              items: snapshot.items.filter((item) => item.id !== project.id),
              totalItems: Math.max(0, snapshot.totalItems - 1),
            };
          }
          return snapshot;
        },
      );

      try {
        await setProjectFavorite(project.id, next);
        queryClient.removeQueries({ queryKey: FLOW_PROJECTS_QUERY_PREFIX });
      } catch (err) {
        // Creator-only server-side; the star is not offered to anyone else, so
        // this is a real failure (network, session), not a permission slip.
        console.error("[flow-sidebar] toggle favorite failed", err);
      } finally {
        void queryClient.invalidateQueries({
          queryKey: FLOW_FAVORITE_PROJECTS_QUERY_KEY,
        });
        void queryClient.invalidateQueries({
          queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY,
        });
      }
    },
    [queryClient],
  );
}
