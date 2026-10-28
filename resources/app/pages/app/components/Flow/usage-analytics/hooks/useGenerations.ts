"use client";

import useSWR from "swr";

import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { STALE_MS } from "../constants";
import { toApiFilters, toGenerationsKeyFilters } from "../helpers";
import { useTeamScope } from "./useTeamScope";
import { usageSource } from "./useUsageSource";
import { useUsageDateWindow, useUsageGenerationsState } from "./useUsageUiState";

/**
 * The generations ledger — GET /api/v1/ai-spend, one keyset page.
 *
 * Cursor-paged rather than numbered: the endpoint keys pages on
 * (created_at, job_id) and reports no total, because a submit's fan-out siblings
 * share a millisecond and a page bound on the timestamp alone skipped them. So
 * this hook exposes prev/next cursors and two has-more flags, and there is no
 * "page 7 of 12" to render.
 *
 * The cursor is part of the SWR key, so a page already walked is served from
 * cache — stepping back is instant and issues no request. `keepPreviousData`
 * (set once on the Flow provider) keeps the current rows on screen while the
 * next page loads, so the table does not flash a skeleton on every step.
 */
export function useGenerations() {
  const { teamId, enabled } = useTeamScope();
  const window = useUsageDateWindow();
  const { filters, cursor, limit, goToCursor } = useUsageGenerationsState();

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled
      ? usageSwrKeys.generations(
          teamId,
          window,
          toGenerationsKeyFilters(filters),
          cursor.token,
          cursor.direction,
          limit,
        )
      : null,
    () =>
      usageSource().listGenerations({
        window,
        ...toApiFilters(filters),
        cursor: cursor.token,
        direction: cursor.direction,
        limit,
      }),
    { dedupingInterval: STALE_MS },
  );

  return {
    page: data,
    /** How many steps from the top the rows on screen are — the footer's label. */
    pageNumber: cursor.page,
    isLoading,
    // A step to a cached page is not "busy": SWR answers from memory and only
    // validating tells the pager to show its spinner.
    isFetching: isValidating,
    failed: Boolean(error),
    retry: mutate,
    /** Walk toward older rows. */
    goNext: () => {
      if (data?.hasNext && data.nextCursor) {
        goToCursor({ token: data.nextCursor, direction: "next", page: cursor.page + 1 });
      }
    },
    /** Walk back toward newer rows. */
    goPrev: () => {
      if (data?.hasPrev && data.prevCursor) {
        goToCursor({
          token: data.prevCursor,
          direction: "prev",
          // Never below the first page: a step back from the top is refused by
          // `hasPrev` anyway, and a "Page 0" would be a label for nothing.
          page: Math.max(1, cursor.page - 1),
        });
      }
    },
  };
}
