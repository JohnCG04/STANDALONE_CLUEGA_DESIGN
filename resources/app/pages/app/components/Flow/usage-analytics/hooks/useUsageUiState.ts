"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Key } from "swr";

import {
  DEFAULT_TIME_RANGE,
  normalizeCustomRange,
  resolveTimeRange,
  type UsageBucket,
  type UsageDateWindow,
  type UsageRangeSelection,
  type UsageTimeRangeKey,
} from "@/lib/flow/usage-analytics/timeRange";
import { usageUiKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import {
  EMPTY_CHART_FILTERS,
  EMPTY_GENERATIONS_FILTERS,
  GENERATIONS_DEFAULT_PAGE_SIZE,
} from "../constants";
import type { UsageChartFilters, UsageGenerationsFilters } from "../types";
import { useTeamScope } from "./useTeamScope";

/**
 * The page's UI state, held in the SWR cache instead of React state.
 *
 * Not a style choice — it is what keeps the charts still. With `useState` in the
 * page container, every slice lives in the component that renders ALL the
 * blocks, so ticking one ledger filter re-renders the credits chart and the
 * models list too, and Chart.js rebuilds a canvas nobody asked to change. Held
 * per key in the cache, each block subscribes to exactly the slices it reads:
 * the ledger's cursor is not on the chart's subscription list, so a page step
 * cannot reach it.
 *
 * It also survives the remount. Every `/app/*` route rebuilds the Flow shell, so
 * a trip to another screen and back would reset a `useState` range to the
 * default; the cache holds it (see FlowSWRProvider).
 */

/**
 * useUiSlice is a piece of UI state, cached under `key`.
 *
 * `null` as the fetcher is deliberate: it tells SWR there is nothing to fetch,
 * so the entry is a store rather than a request. `fallbackData` is the initial
 * value, and the writer publishes with `revalidate: false` — a UI write must
 * never look like stale data worth refetching.
 */
function useUiSlice<T>(key: Key, fallback: T): [T, (next: T | ((current: T) => T)) => void] {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<T>(key, null, {
    fallbackData: fallback,
    // A store has no server to ask, so every automatic revalidation is noise.
    revalidateOnMount: false,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const value = data ?? fallback;
  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      void mutate<T>(
        key,
        (current) =>
          typeof next === "function"
            ? (next as (c: T) => T)(current ?? fallback)
            : next,
        { revalidate: false },
      );
    },
    // fallback is a module constant at every call site, so it is stable.
    [key, mutate, fallback],
  );
  return [value, set];
}

/**
 * Keeps each facet to at most ONE value — the last one picked.
 *
 * The API matches a single model / action / member per read (equality, not
 * `$in`), so a second chip could only be shown and not applied, and a filter
 * that lies about what it filtered is worse than one that replaces. Widening
 * this to a real multi-select is a backend change; see toApiFilters.
 */
function clampFacets<T extends UsageChartFilters>(filters: T): T {
  return {
    ...filters,
    users: filters.users.slice(-1),
    features: filters.features.slice(-1),
    models: filters.models.slice(-1),
  };
}

/** What the picker holds. A module constant, so useUiSlice's setter stays stable. */
const DEFAULT_SELECTION: UsageRangeSelection = { key: DEFAULT_TIME_RANGE };

/**
 * The selected range and the window it resolves to.
 *
 * ONE fact is cached — the selection (a preset, or "custom" plus its two
 * dates). The window and its bucket are derived on read, so the days on screen,
 * the granularity the API is asked for and the label on the button can never
 * drift apart.
 */
export function useUsageRange(): {
  selection: UsageRangeSelection;
  rangeKey: UsageTimeRangeKey;
  dateWindow: UsageDateWindow;
  setRange: (key: UsageTimeRangeKey) => void;
  setCustomRange: (start: string, end: string) => void;
} {
  const { teamId } = useTeamScope();
  const [selection, setSelection] = useUiSlice<UsageRangeSelection>(
    usageUiKeys.range(teamId),
    DEFAULT_SELECTION,
  );
  const setRange = useCallback(
    (key: UsageTimeRangeKey) => setSelection({ key }),
    [setSelection],
  );
  // Normalised on the way IN, not on every read: a backwards pair or an end in
  // the future would otherwise be re-fixed on each render and, worse, the
  // calendar would keep showing what the user picked while the charts drew
  // something else.
  const setCustomRange = useCallback(
    (start: string, end: string) => {
      const range = normalizeCustomRange(start, end);
      setSelection({ key: "custom", start: range.start, end: range.end });
    },
    [setSelection],
  );
  return {
    selection,
    rangeKey: selection.key,
    dateWindow: resolveTimeRange(selection),
    setRange,
    setCustomRange,
  };
}

/** Just the window — for blocks that read the range but never change it. */
export function useUsageDateWindow(): UsageDateWindow {
  return useUsageRange().dateWindow;
}

/** Just the granularity, for the blocks that only need to LABEL their axis. */
export function useUsageBucket(): UsageBucket {
  return useUsageRange().dateWindow.bucket;
}

/** The chart blocks' facet selection. */
export function useUsageChartFilters(): {
  filters: UsageChartFilters;
  patch: (patch: Partial<UsageChartFilters>) => void;
} {
  const { teamId } = useTeamScope();
  const [filters, setFilters] = useUiSlice<UsageChartFilters>(
    usageUiKeys.chartFilters(teamId),
    EMPTY_CHART_FILTERS,
  );
  const patch = useCallback(
    (values: Partial<UsageChartFilters>) =>
      setFilters((current) => clampFacets({ ...current, ...values })),
    [setFilters],
  );
  return { filters, patch };
}

/**
 * The ledger's filters and its cursor.
 *
 * They move together: a new filter set is a new list, and a cursor minted in the
 * old one addresses a row that may not be in it — so every filter write resets
 * the cursor in the same call rather than leaving that to a caller to remember.
 */
export function useUsageGenerationsState(): {
  filters: UsageGenerationsFilters;
  cursor: UsageCursor;
  limit: number;
  patchFilters: (patch: Partial<UsageGenerationsFilters>) => void;
  goToCursor: (cursor: UsageCursor) => void;
  setLimit: (limit: number) => void;
} {
  const { teamId } = useTeamScope();
  const [filters, setFilters] = useUiSlice<UsageGenerationsFilters>(
    usageUiKeys.generationsFilters(teamId),
    EMPTY_GENERATIONS_FILTERS,
  );
  const [cursor, setCursor] = useUiSlice<UsageCursor>(
    usageUiKeys.generationsCursor(teamId),
    FIRST_PAGE,
  );
  const [limit, setLimitValue] = useUiSlice<number>(
    usageUiKeys.generationsLimit(teamId),
    GENERATIONS_DEFAULT_PAGE_SIZE,
  );
  const patchFilters = useCallback(
    (values: Partial<UsageGenerationsFilters>) => {
      setFilters((current) => ({
        ...clampFacets({ ...current, ...values }),
        platforms: (values.platforms ?? current.platforms).slice(-1),
        outcomes: (values.outcomes ?? current.outcomes).slice(-1),
      }));
      setCursor(FIRST_PAGE);
    },
    [setFilters, setCursor],
  );
  // A page size change re-cuts the list: a cursor minted at twenty rows names a
  // boundary that no longer exists at fifty, and the page number counting from
  // it would be counting pages of two different sizes. Both go back to the top.
  const setLimit = useCallback(
    (next: number) => {
      setLimitValue(next);
      setCursor(FIRST_PAGE);
    },
    [setLimitValue, setCursor],
  );
  return { filters, cursor, limit, patchFilters, goToCursor: setCursor, setLimit };
}

/**
 * A position in the ledger: an opaque token from the API plus which side of it
 * to read. The empty token is the first (newest) page.
 */
export interface UsageCursor {
  token: string;
  direction: "next" | "prev";
  /**
   * How many steps from the top this position is, 1-based — what the footer
   * prints as "Page 3".
   *
   * Carried rather than derived because a keyset walk has nothing to derive it
   * from: the API reports no total and no offset, only whether a page exists on
   * each side. It is a COUNT OF STEPS TAKEN, which is exactly what the label
   * claims — never a position in a list whose length this page cannot know.
   */
  page: number;
}

/** The newest page — no token, so the API answers from the top. */
export const FIRST_PAGE: UsageCursor = { token: "", direction: "next", page: 1 };

/**
 * Resetting the ledger to its first page, for the writers that change what the
 * list contains without touching its filters (the range pill).
 */
export function useResetGenerationsCursor(): () => void {
  const { teamId } = useTeamScope();
  const [, setCursor] = useUiSlice<UsageCursor>(
    usageUiKeys.generationsCursor(teamId),
    FIRST_PAGE,
  );
  return useCallback(() => setCursor(FIRST_PAGE), [setCursor]);
}
