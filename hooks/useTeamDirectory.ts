"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  listTeamDirectory,
  type DirectorySortKey,
  type DirectoryStatus,
} from "@/lib/teams/cdp-team-directory";
import { TeamApiError } from "@/lib/teams/cdp-teams";

/**
 * State for the Settings › Team directory table.
 *
 * Built on react-query rather than a hand-rolled effect, and not only for the
 * cache: the query key carries every filter, so an answer to a superseded query
 * can never land on the current one. Writing that race guard by hand is where
 * this kind of table usually goes wrong — a slow answer to "ngu" arriving after
 * a fast answer to "nguyen" and putting the wrong rows under the query on screen.
 */

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
/** Short: membership is edited from the sibling tab, so a stale roster is visible. */
const STALE_MS = 15_000;

export interface TeamDirectoryFilters {
  search: string;
  status: DirectoryStatus;
  departmentId: string;
  sortBy: DirectorySortKey | null;
  order: "asc" | "desc";
}

const EMPTY_FILTERS: TeamDirectoryFilters = {
  search: "",
  status: "all",
  departmentId: "",
  sortBy: "created_at",
  order: "desc",
};

/** How many filter groups are narrowing the list. Sort is not a filter. */
export function countActiveFilters(f: TeamDirectoryFilters): number {
  return (f.search.trim() ? 1 : 0) + (f.status === "all" ? 0 : 1) + (f.departmentId ? 1 : 0);
}

export function useTeamDirectory(options?: { pageSize?: number; enabled?: boolean }) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const enabled = options?.enabled ?? true;

  const [filters, setFilters] = useState<TeamDirectoryFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // Debounced copy of the search box: the raw value drives the input so typing
  // stays instant, and only this one reaches the query key.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = window.setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [filters.search]);

  const query = useMemo(
    () => ({
      status: filters.status,
      q: debouncedSearch,
      departmentId: filters.departmentId || undefined,
      sortBy: filters.sortBy ?? undefined,
      order: filters.order,
    }),
    [filters.status, filters.departmentId, filters.sortBy, filters.order, debouncedSearch],
  );

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["team-directory", query, page, pageSize] as const,
    queryFn: ({ signal }) => listTeamDirectory({ ...query, page, pageSize }, signal),
    enabled,
    staleTime: STALE_MS,
    // The previous page stays on screen while the next one loads, so paging does
    // not flash an empty table between two full ones.
    placeholderData: (previous) => previous,
  });

  /**
   * Every filter change also goes back to page one.
   *
   * Done in the setters rather than an effect watching the filters: an effect
   * would fetch page 5 of the new filter first and correct itself a frame later
   * — one wasted request and a visible flash of the wrong rows.
   *
   * Without the reset at all, narrowing the list while on page 5 answers with an
   * empty table and no visible reason: the rows exist, they are on page 1 now.
   */
  const patch = useCallback((next: Partial<TeamDirectoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  /**
   * First click sorts ascending; clicking the same column again reverses it.
   * Only the keys mid-platform accepts reach here — the header draws a control
   * for those alone, so an unsortable column has no affordance rather than a
   * dead one.
   */
  const toggleSort = useCallback((key: DirectorySortKey) => {
    setFilters((prev) =>
      prev.sortBy === key
        ? { ...prev, order: prev.order === "asc" ? "desc" : "asc" }
        : { ...prev, sortBy: key, order: "asc" },
    );
    setPage(1);
  }, []);

  const total = data?.total ?? 0;

  return {
    members: data?.members ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasNextPage: data?.hasNextPage ?? false,
    loading: isFetching,
    error: error instanceof Error ? error.message : null,
    /** The error itself, for `teamErrorMessage` — `error` above is only its text. */
    failure: error ?? null,
    /**
     * The roster was refused, rather than failing. Callers should say so in
     * their own words: `error` here is the API's sentence ("Access denied"),
     * which reached the screen untranslated beside a table of zero rows.
     */
    forbidden: error instanceof TeamApiError && error.status === 403,
    filters,
    activeFilterCount: countActiveFilters(filters),
    setFilters: patch,
    setPage,
    toggleSort,
    resetFilters: reset,
    /** The same filters without paging — what the CSV export re-fetches with. */
    currentQuery: query,
    refresh: refetch,
  };
}
