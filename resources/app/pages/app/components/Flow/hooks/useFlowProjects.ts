"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getActiveTeamId } from "@/lib/ai-agent/cluega-session-auth";
import { withFlowFavorite } from "@/lib/flow/flowFavorites";
import {
  FLOW_FAVORITE_PROJECTS_QUERY_KEY,
  FLOW_PROJECTS_QUERY_PREFIX,
  FLOW_RECENT_PROJECTS_QUERY_KEY,
} from "@/lib/flow/flowQueryKeys";
import { isSnapshotFresh } from "@/lib/query/cachedSnapshot";

import { ACTIVE_TEAM_CHANGED_EVENT } from "@/hooks/useActiveTeam";
import {
  createProject,
  deleteProject,
  duplicateProject,
  FlowApiError,
  listProjects,
  setProjectFavorite,
  updateProject,
  type FlowPagination,
  type FlowProject,
  type FlowSortField,
  type FlowSortOrder,
} from "../services/flow-builder.service";

/** One listed page of workflow projects, held in the query cache. */
type CachedProjectsPage = {
  items: FlowProject[];
  pagination: FlowPagination | null;
};

/**
 * How long a listed page counts as current.
 *
 * Short because projects are created, renamed and deleted from this screen; each
 * of those paths calls refresh(), which bypasses this window. Entering the
 * Project tab bypasses it too (edits made in the workflow editor never touch
 * this cache), so it only covers in-tab filter/page changes and the prewarm
 * fetch that runs while another /flow tab is on screen.
 */
const FLOW_PROJECTS_FRESH_MS = 30_000;

/** UI sort options → the API's (sort field, order) pair. */
export type SortKey = "recent" | "oldest" | "name";

const SORT_MAP: Record<SortKey, { sort: FlowSortField; order: FlowSortOrder }> = {
  recent: { sort: "updated_at", order: "desc" },
  oldest: { sort: "updated_at", order: "asc" },
  name: { sort: "name", order: "asc" },
};

const DEFAULT_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 350;

export interface UseFlowProjectsResult {
  projects: FlowProject[];
  pagination: FlowPagination | null;
  isLoading: boolean;
  /** True while a filter/search/sort change is fetching over existing rows. */
  isRefetching: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  sort: SortKey;
  setSort: (value: SortKey) => void;
  pageNo: number;
  setPageNo: (value: number) => void;
  /** Echo of the option, so the page's "is a filter on?" reads one source. */
  favoritesOnly: boolean;
  refresh: () => void;
  create: (name: string) => Promise<FlowProject | null>;
  duplicate: (id: string) => Promise<FlowProject | null>;
  rename: (id: string, name: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  /**
   * The structured error from the last failed `remove()`, or null. `error`
   * above is already a display string derived from it; this is the raw
   * `FlowApiError` (code + details) for callers that need to branch on the
   * code — e.g. naming the template/tool a `flow_project_in_use` conflict
   * refuses to let go of.
   */
  removeError: FlowApiError | null;
  /** Star / unstar (creator-only — see lib/flow/flowFavorites.ts). */
  setFavorite: (id: string, favorite: boolean) => Promise<boolean>;
}

export interface UseFlowProjectsOptions {
  /**
   * List only starred projects (`GET /projects?favorite=true`). An INPUT rather
   * than state owned here: the page reads it from the URL (`?favorites=1`), the
   * same way it reads the workspace tab, so the sidebar's "View all favorites"
   * can deep-link to it and a refresh keeps it.
   */
  favoritesOnly?: boolean;
  /**
   * Whether the project list is the workspace currently on screen. The hook
   * stays mounted while the user flips /flow tabs, so this is the only
   * signal that the list just became visible — and entering it always asks the
   * API again: renames and content edits made in the workflow editor never
   * touch this cache, so a snapshot (however fresh) can predate them.
   */
  active?: boolean;
}

export function useFlowProjects({
  favoritesOnly = false,
  active = true,
}: UseFlowProjectsOptions = {}): UseFlowProjectsResult {
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [pagination, setPagination] = useState<FlowPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<FlowApiError | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [pageNo, setPageNo] = useState(1);

  // Bump to force a refetch without changing any filter.
  const [reloadToken, setReloadToken] = useState(0);
  const hasLoadedRef = useRef(false);
  // The cache lives in app/app/layout.tsx, which navigation does not remount —
  // unlike this page.
  const queryClient = useQueryClient();
  // The reload token already acted on, so the effect can tell an explicit refresh
  // (or a team switch) apart from arriving at the page.
  const honouredReloadRef = useRef(reloadToken);
  // Whether the previous run of the fetch effect saw the tab on screen, so it
  // can tell "the user just entered the Project tab" apart from a filter change
  // made while already on it. Starts false so a mount directly on the tab (the
  // way back from the workflow editor) also refetches.
  const wasActiveRef = useRef(false);

  // Debounce the search box so we don't fire a request per keystroke; reset to
  // page 1 whenever the query text changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPageNo(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const { sort: sortField, order } = SORT_MAP[sort];

    // The active team is part of the key, not just of the request: `GET /projects`
    // is scoped by X-Team-Id, so a list fetched for one team says nothing about
    // another and must never be reused across a switch.
    const cacheKey = [
      ...FLOW_PROJECTS_QUERY_PREFIX,
      {
        team: getActiveTeamId(),
        pageNo,
        name: debouncedQuery,
        sort: sortField,
        order,
        favoritesOnly,
      },
    ] as const;

    // A reload token bump means someone asked for the truth — the refresh button,
    // or the team switcher below. Entering the Project tab counts the same way:
    // renames and content edits made in the workflow editor never touch this
    // cache, so the moment the list becomes visible it must ask the API, not the
    // snapshot.
    const enteredTab = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    const reloadRequested =
      honouredReloadRef.current !== reloadToken || enteredTab;
    honouredReloadRef.current = reloadToken;

    const cached = queryClient.getQueryData<CachedProjectsPage>(cacheKey);
    if (!reloadRequested) {
      const cachedAt = queryClient.getQueryState(cacheKey)?.dataUpdatedAt;
      if (cached && isSnapshotFresh(cachedAt, Date.now(), FLOW_PROJECTS_FRESH_MS)) {
        setProjects(cached.items);
        setPagination(cached.pagination);
        setError(null);
        hasLoadedRef.current = true;
        setIsLoading(false);
        setIsRefetching(false);
        return;
      }
    }

    // A snapshot too stale (or bypassed) to stand in can still paint: seed the
    // rows so entering the tab dims the last known list under `isRefetching`
    // instead of flashing the skeleton.
    if (cached && !hasLoadedRef.current) {
      setProjects(cached.items);
      setPagination(cached.pagination);
      hasLoadedRef.current = true;
    }

    // First load shows the skeleton; subsequent filter/sort/page changes keep
    // the current rows visible and flip the lighter `isRefetching` flag.
    if (hasLoadedRef.current) setIsRefetching(true);
    else setIsLoading(true);
    setError(null);

    listProjects({
      page_no: pageNo,
      limit: DEFAULT_LIMIT,
      name: debouncedQuery,
      sort: sortField,
      order,
      // Omitted (not `false`) when off: `favorite=false` is its own filter.
      favorite: favoritesOnly ? true : undefined,
      signal: controller.signal,
    })
      .then((result) => {
        setProjects(result.items);
        setPagination(result.pagination);
        // Kept outside React state so it outlives the unmount that leaving this
        // page causes.
        queryClient.setQueryData<CachedProjectsPage>(cacheKey, {
          items: result.items,
          pagination: result.pagination,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(resolveErrorMessage(err));
        setProjects([]);
        setPagination(null);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        hasLoadedRef.current = true;
        setIsLoading(false);
        setIsRefetching(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, sort, pageNo, favoritesOnly, queryClient, reloadToken, active]);

  // Switching the favorites filter is a new result set; its page numbers mean
  // nothing in the other. (A no-op on mount, where the page is already 1.)
  useEffect(() => {
    setPageNo(1);
  }, [favoritesOnly]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
    // The Flow sidebar lists the most recent projects from its own query. Every
    // path that asks this list for the truth — create, duplicate, delete, a team
    // switch — changes that list too, so it is refetched at the same moment
    // rather than a stale-time later.
    void queryClient.invalidateQueries({ queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: FLOW_FAVORITE_PROJECTS_QUERY_KEY });
  }, [queryClient]);

  // `GET /projects` is scoped server-side by the `X-Team-Id` header (read from
  // the persisted active team on every request), so the team switcher changes
  // the result set without changing any of this hook's inputs. Listen for the
  // switch and refetch from page 1 — the previous team's page numbers mean
  // nothing in the new team's list.
  useEffect(() => {
    const onTeamChange = () => {
      setPageNo(1);
      refresh();
    };
    window.addEventListener(ACTIVE_TEAM_CHANGED_EVENT, onTeamChange);
    return () =>
      window.removeEventListener(ACTIVE_TEAM_CHANGED_EVENT, onTeamChange);
  }, [refresh]);

  const create = useCallback(
    async (name: string) => {
      try {
        const project = await createProject(name);
        refresh();
        return project;
      } catch (err) {
        setError(resolveErrorMessage(err));
        return null;
      }
    },
    [refresh],
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        const project = await duplicateProject(id);
        refresh();
        return project;
      } catch (err) {
        setError(resolveErrorMessage(err));
        return null;
      }
    },
    [refresh],
  );

  const rename = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    // Optimistic rename — update the card's name immediately, roll back on
    // failure. The server returns the canonical card, which we merge in.
    let snapshot: FlowProject[] = [];
    setProjects((current) => {
      snapshot = current;
      return current.map((project) =>
        project.id === id ? { ...project, name: trimmed } : project,
      );
    });
    try {
      const updated = await updateProject(id, { name: trimmed });
      setProjects((current) =>
        current.map((project) => (project.id === id ? updated : project)),
      );
      // A rename lands in local state only — unlike create and delete, it does not
      // refresh. The cached pages still hold the OLD name, and since a cached page
      // can now stand in for a fetch, leaving and coming back would show the old
      // name and read as a lost edit. Dropping the entries costs one request on the
      // next visit, which is the correct price for having changed the data.
      //
      // The sidebar's Recent list is a LIVE observer on its own key (outside this
      // prefix — see flowQueryKeys.ts) and must be invalidated, not removed:
      // removing a mounted query never notifies its observer, so the row would
      // keep the old name and later flash a skeleton. Invalidation refetches in
      // place with the rows still shown.
      queryClient.removeQueries({ queryKey: FLOW_PROJECTS_QUERY_PREFIX });
      void queryClient.invalidateQueries({
        queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY,
      });
      void queryClient.invalidateQueries({
        queryKey: FLOW_FAVORITE_PROJECTS_QUERY_KEY,
      });
      return true;
    } catch (err) {
      // The rollback restores exactly what the cache already holds, so there is
      // nothing to drop on this path.
      setProjects(snapshot);
      // Rethrown, not `setError`: that banner only shows on an empty list, so a refusal went unseen.
      throw err;
    }
  }, [queryClient]);

  const setFavorite = useCallback(
    async (id: string, favorite: boolean) => {
      // Optimistic flip, rolled back on failure. The desired value comes from
      // the caller (not a toggle on current state), so the request is the same
      // whatever React does with the updater's timing.
      let snapshot: FlowProject[] = [];
      setProjects((current) => {
        snapshot = current;
        return withFlowFavorite(current, id, favorite);
      });
      try {
        const updated = await setProjectFavorite(id, favorite);
        if (favoritesOnly && !updated.favorite) {
          // Unstarred while listing only favorites: the row no longer belongs
          // here and the page totals moved with it — ask for the page again.
          refresh();
        } else {
          // The star does not bump updated_at, so the canonical card lands in
          // the same slot; no refetch, exactly as the contract intends. Same
          // cache bookkeeping as rename: the page's cached lists hold the old
          // flag (drop them), the sidebar's two lists are live (invalidate).
          setProjects((current) =>
            current.map((project) => (project.id === id ? updated : project)),
          );
          queryClient.removeQueries({ queryKey: FLOW_PROJECTS_QUERY_PREFIX });
          void queryClient.invalidateQueries({
            queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY,
          });
          void queryClient.invalidateQueries({
            queryKey: FLOW_FAVORITE_PROJECTS_QUERY_KEY,
          });
        }
        return true;
      } catch (err) {
        setProjects(snapshot);
        setError(resolveErrorMessage(err));
        return false;
      }
    },
    [favoritesOnly, queryClient, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      // Optimistic removal — drop the card immediately, roll back on failure.
      let snapshot: FlowProject[] = [];
      let remaining = 0;
      setProjects((current) => {
        snapshot = current;
        const next = current.filter((project) => project.id !== id);
        remaining = next.length;
        return next;
      });
      setRemoveError(null);
      try {
        await deleteProject(id);
        // A delete shifts every later project one slot forward, so the cached
        // page (and its total_items/total_pages) is now stale. Step back when
        // the delete emptied a page — otherwise the user is stranded on a blank
        // one with no rows to page away from.
        setPageNo((page) => (remaining === 0 && page > 1 ? page - 1 : page));
        refresh();
        return true;
      } catch (err) {
        setProjects(snapshot);
        setError(resolveErrorMessage(err));
        setRemoveError(err instanceof FlowApiError ? err : null);
        return false;
      }
    },
    [refresh],
  );

  return {
    projects,
    pagination,
    isLoading,
    isRefetching,
    error,
    query,
    setQuery,
    sort,
    setSort: (value: SortKey) => {
      setSort(value);
      setPageNo(1);
    },
    pageNo,
    setPageNo,
    favoritesOnly,
    refresh,
    create,
    duplicate,
    rename,
    remove,
    removeError,
    setFavorite,
  };
}

function resolveErrorMessage(err: unknown): string {
  if (err instanceof FlowApiError) return err.code || err.message;
  if (err instanceof Error) return err.message;
  return "flow_request_failed";
}
