"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FlowApiError, type FlowPagination } from "../services/flow-builder.service";
import {
  listPresetCategories,
  listPresets,
  type FlowPreset,
  type FlowPresetCategory,
} from "../services/flow-presets.service";

const PAGE_SIZE = 20;
// Matches the projects list. One request per keystroke otherwise.
const SEARCH_DEBOUNCE_MS = 350;
// A category pill is one deliberate click, so the wait is short — just long
// enough that running across the row fires one request instead of one per pill.
const CATEGORY_DEBOUNCE_MS = 180;

// The category taxonomy changes only when an operator edits it (or publishes a
// preset), so it is fetched once and cached for the session — remounting the
// Templates tab or the editor must not re-request it. Shared by the gallery's
// chip row and the editor's Save Template picker, so both see the same rows.
let categoriesCache: FlowPresetCategory[] | null = null;
let categoriesInFlight: Promise<FlowPresetCategory[]> | null = null;

export function loadFlowPresetCategories(): Promise<FlowPresetCategory[]> {
  if (categoriesCache) return Promise.resolve(categoriesCache);
  if (!categoriesInFlight) {
    // No `signal`: the result is shared, so one unmounting consumer must not
    // cancel the fetch for the others. Unmounted callers just drop the value.
    categoriesInFlight = listPresetCategories()
      .then((rows) => {
        categoriesCache = rows;
        return rows;
      })
      .finally(() => {
        categoriesInFlight = null;
      });
  }
  return categoriesInFlight;
}

/**
 * Drop the cached category rows. Publishing a preset from the editor changes the
 * reference counts (and, on a legacy backend, can introduce a whole new row);
 * without this the Templates tab would keep serving what it cached before the
 * save (the CARDS are re-fetched on mount, so only the categories need clearing).
 */
export function invalidateFlowPresetCategories(): void {
  categoriesCache = null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof FlowApiError) return error.code || error.message;
  if (error instanceof Error) return error.message;
  return "preset_request_failed";
}

export interface UseFlowPresetsOptions {
  showOnHome?: boolean;
}

export interface UseFlowPresetsResult {
  presets: FlowPreset[];
  /** In the order the endpoint returned — curated (`sort_order`, slug) on the
   *  table-backed backend, alphabetical on a legacy one. Display ordering for
   *  the legacy case is the view's job. */
  categories: FlowPresetCategory[];
  pagination: FlowPagination | null;
  /** True only while there is nothing to show yet (the grid shows skeletons). */
  isLoading: boolean;
  /** True while a filter change is refetching over a list that is already on
   *  screen — the view keeps the old cards and marks them busy, because
   *  swapping them for skeletons flickers when the pills are clicked quickly. */
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** null = the "All" chip, i.e. no `category` param. */
  category: string | null;
  setCategory: (slug: string | null) => void;
  query: string;
  setQuery: (value: string) => void;
  /** True while the query is filtering (used to pick the empty-state copy). */
  isFiltering: boolean;
  loadMore: () => void;
  retry: () => void;
  clearFilters: () => void;
}

/**
 * Drives the Templates tab: the category chips (fetched once, cached) and the
 * paginated card list (`?category=` + debounced `?name=`, which the backend
 * combines with AND). Pages are appended; any filter change resets to page 1,
 * because staying on page 3 of the previous filter renders an empty grid.
 */
export function useFlowPresets(
  options: UseFlowPresetsOptions = {},
): UseFlowPresetsResult {
  const showOnHome = options.showOnHome === true;
  const [presets, setPresets] = useState<FlowPreset[]>([]);
  const [categories, setCategories] = useState<FlowPresetCategory[]>(
    () => categoriesCache ?? [],
  );
  const [pagination, setPagination] = useState<FlowPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategoryState] = useState<string | null>(null);
  // The pills read `category` so the selection lands on the click; only this
  // debounced copy reaches the request.
  const [debouncedCategory, setDebouncedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Bump to refetch the current filter without changing it (the retry button).
  const [reloadToken, setReloadToken] = useState(0);

  // A slow response for a filter the user already left must not overwrite the
  // current list, so every load is stamped and stale stamps are dropped.
  const requestIDRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pageRef = useRef(1);
  // Whether a list is already on screen, read inside `load` without making the
  // rows a dependency of it (that would refetch on every append).
  const hasRowsRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadFlowPresetCategories()
      .then((rows) => {
        if (active) setCategories(rows);
      })
      // The chip row degrades to just "All" — a missing filter row must not take
      // the gallery down with it.
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedCategory(category),
      CATEGORY_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [category]);

  const load = useCallback(
    async (mode: "reset" | "more") => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestID = ++requestIDRef.current;

      if (mode === "reset") {
        pageRef.current = 1;
        // Skeletons only when there is nothing to keep. Otherwise the current
        // cards stay put until the new page lands, so switching category does
        // not blank the wall and snap its height.
        if (hasRowsRef.current) setIsRefreshing(true);
        else {
          setIsLoading(true);
          setHasMore(false);
        }
        // A "load more" this reset just aborted never reaches its own `finally`
        // (its stamp is stale), so clear the flag here or pagination stays
        // blocked for good.
        setIsLoadingMore(false);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const { items, pagination: page } = await listPresets({
          page_no: pageRef.current,
          limit: PAGE_SIZE,
          category: debouncedCategory ?? undefined,
          name: debouncedQuery,
          show_on_home: showOnHome || undefined,
          signal: controller.signal,
        });
        if (requestIDRef.current !== requestID) return;

        pageRef.current += 1;
        setPagination(page);
        setHasMore(page.page_no < page.total_pages);
        hasRowsRef.current = mode === "reset" ? items.length > 0 : true;
        setPresets((previous) => {
          if (mode === "reset") return items;
          // Guard against a preset that shifted across the page boundary between
          // two requests (an operator publishing meanwhile) showing up twice.
          const seen = new Set(previous.map((preset) => preset.id));
          return [...previous, ...items.filter((item) => !seen.has(item.id))];
        });
      } catch (cause) {
        if (isAbort(cause) || requestIDRef.current !== requestID) return;
        setError(resolveErrorMessage(cause));
        if (mode === "reset") {
          hasRowsRef.current = false;
          setHasMore(false);
          setPresets([]);
          setPagination(null);
        }
      } finally {
        if (requestIDRef.current === requestID) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedCategory, debouncedQuery, showOnHome],
  );

  useEffect(() => {
    void load("reset");
    return () => abortRef.current?.abort();
    // `load` changes identity with the filters, so this is the filter-change
    // refetch; `reloadToken` re-runs it for the same filters (retry).
  }, [load, reloadToken]);

  const loadMore = useCallback(() => {
    if (isLoading || isRefreshing || isLoadingMore || !hasMore) return;
    void load("more");
  }, [hasMore, isLoading, isLoadingMore, isRefreshing, load]);

  return {
    presets,
    categories,
    pagination,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    category,
    setCategory: setCategoryState,
    query,
    setQuery,
    // Reads the filters the list on screen was actually loaded with, so the
    // empty-state copy never describes a filter that has not been applied yet.
    isFiltering:
      Boolean(debouncedCategory) || debouncedQuery.trim().length > 0,
    loadMore,
    retry: () => setReloadToken((token) => token + 1),
    clearFilters: () => {
      setCategoryState(null);
      setQuery("");
    },
  };
}
