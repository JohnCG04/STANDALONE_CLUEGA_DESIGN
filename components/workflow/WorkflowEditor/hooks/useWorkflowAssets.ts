import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetsPanelConfig,
  AssetSource,
  AssetsTab,
  AssetType,
  WorkflowAsset,
} from "@dogclaw-ad/workflow";

import { useDebounce } from "@/hooks/useDebounce";
import { translateStatic } from "@/hooks/useTranslate";
import {
  ASSET_LIBRARY_REASON,
  subscribeAssetLibraryChanged,
} from "@/lib/assets/assetLibraryChannel";
import { listAssets, patchAsset } from "@/lib/cdp/assetsClient";
import { CdpApiError } from "@/lib/cdp/errors";
import { useToastStore } from "@/lib/stores/useToastStore";
import { decideRename } from "@/resources/app/pages/app/artifacts/assetRename";
import { createWorkflowAssetActionHandler } from "../../actions/hostActions";
import {
  DEFAULT_TAB,
  FILTER_TYPES,
  PANEL_PAGE_SIZE,
  RETRY_DELAYS_MS,
  SEARCH_DEBOUNCE_MS,
} from "../constants";
import { panelListParams, toPanelAssets } from "../helpers";
import type { AssetsPage, UseWorkflowAssets, UseWorkflowAssetsOptions } from "../types";

/**
 * The panel's first query (This project, no filter, no search), fetched ahead by the bootstrap.
 * Raw rows, so the seed goes through the same `toPanelAssets` pass as a network result.
 */
export function loadInitialAssets(workflowId?: string): Promise<AssetsPage> {
  return listAssets(
    panelListParams({
      tab: DEFAULT_TAB,
      workflowId,
      filter: "all",
      limit: PANEL_PAGE_SIZE,
    }),
  )
    .then(({ items, nextCursor }) => ({ items, nextCursor }))
    .catch((err) => {
      // A 404 means the endpoint isn't wired here — "no assets", not a failure.
      if (err instanceof CdpApiError && err.status === 404)
        return { items: [], nextCursor: "" };
      throw err;
    });
}

/**
 * Backs the Assets panel with `/api/v1/assets` (recycle bin excluded); owns tab/filter/search.
 * The panel has no error surface, so the empty labels carry the error while it auto-retries.
 */
export function useWorkflowAssets(
  options: UseWorkflowAssetsOptions = {},
): UseWorkflowAssets {
  const { onSelectAsset, labels, initialAssets, workflowId } = options;

  const [source, setSource] = useState<AssetSource>(DEFAULT_TAB);
  const [filter, setFilter] = useState<AssetType | "all">("all");
  // The panel owns the raw input text; only the debounced value lands here.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Bumped to force a refetch of the identical query (post-upload, auto-retry).
  const [reloadToken, setReloadToken] = useState(0);

  const [assets, setAssets] = useState<WorkflowAsset[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [failed, setFailed] = useState(false);
  // Cursor continuing the CURRENT query; `hasMore` is its state twin gating load-more.
  const nextCursor = useRef("");
  const [hasMore, setHasMore] = useState(false);
  const loadMoreController = useRef<AbortController | null>(null);

  const retryCount = useRef(0);

  const debouncedSetQuery = useDebounce(setDebouncedQuery, SEARCH_DEBOUNCE_MS);
  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  // Consumed once: only the panel's opening query can be answered by the seed.
  const seedUsed = useRef(false);

  // The AbortController drops a stale response so it can't clobber the latest selection.
  useEffect(() => {
    // The bootstrap is still fetching this very query — don't race it.
    if (initialAssets === undefined && !seedUsed.current) return;

    if (initialAssets && !seedUsed.current) {
      seedUsed.current = true;
      setAssets(toPanelAssets(initialAssets.items));
      nextCursor.current = initialAssets.nextCursor;
      setHasMore(Boolean(initialAssets.nextCursor));
      setFailed(false);
      return;
    }
    seedUsed.current = true;

    // A new query voids the old cursor and page-2 reads, or a late append mixes two queries.
    loadMoreController.current?.abort();
    nextCursor.current = "";
    setHasMore(false);

    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setIsFetching(true);

    listAssets(
      panelListParams({
        tab: source,
        workflowId,
        filter,
        q: debouncedQuery,
        limit: PANEL_PAGE_SIZE,
      }),
      controller.signal,
    )
      .then(({ items, nextCursor: next }) => {
        if (controller.signal.aborted) return;
        setAssets(toPanelAssets(items));
        nextCursor.current = next;
        setHasMore(Boolean(next));
        setIsFetching(false);
        setFailed(false);
        retryCount.current = 0;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setIsFetching(false);

        // A 404 means the endpoint isn't wired here — "no assets", not a failure.
        if (err instanceof CdpApiError && err.status === 404) {
          setAssets([]);
          setFailed(false);
          return;
        }

        console.error("[assets] failed to load", err);
        setFailed(true);
        // Keep the grid and retry with backoff; once exhausted the error stays until a new query.
        const delay = RETRY_DELAYS_MS[retryCount.current];
        if (delay !== undefined) {
          retryCount.current += 1;
          retryTimer = setTimeout(refetch, delay);
        }
      });

    return () => {
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [source, filter, debouncedQuery, reloadToken, refetch, initialAssets, workflowId]);

  // Changes on other surfaces must reach this grid, or a recycled asset stays insertable.
  useEffect(
    () =>
      subscribeAssetLibraryChanged((change) => {
        if (
          change.reason.startsWith(ASSET_LIBRARY_REASON.asset) ||
          change.reason.startsWith(ASSET_LIBRARY_REASON.trash) ||
          change.reason.startsWith(ASSET_LIBRARY_REASON.folder)
        ) {
          refetch();
        }
      }),
    [refetch],
  );

  // A deliberate interaction restarts the retry budget — it's a fresh query.
  const onTabChange = useCallback((next: AssetsTab) => {
    // The Characters tab lists the workspace's characters; the asset query stays as it was.
    if (next === "characters") return;
    retryCount.current = 0;
    setSource(next);
  }, []);

  const onSearch = useCallback(
    (next: string) => {
      retryCount.current = 0;
      debouncedSetQuery(next.trim());
    },
    [debouncedSetQuery],
  );

  const onFilterChange = useCallback((next: AssetType | "all") => {
    retryCount.current = 0;
    setFilter(next);
  }, []);

  // The panel awaits this before re-firing; a failed page keeps `hasMore` on so a scroll retries.
  const loadMore = useCallback(async () => {
    const cursor = nextCursor.current;
    if (!cursor) return;
    const controller = new AbortController();
    loadMoreController.current = controller;
    try {
      const { items, nextCursor: next } = await listAssets(
        panelListParams({
          tab: source,
          workflowId,
          filter,
          q: debouncedQuery,
          limit: PANEL_PAGE_SIZE,
          cursor,
        }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      nextCursor.current = next;
      setHasMore(Boolean(next));
      const page = toPanelAssets(items);
      // Deduped: an asset touched between page reads can reappear on the next one.
      setAssets((prev) => {
        const seen = new Set(prev.map((asset) => asset.id));
        return [...prev, ...page.filter((asset) => !seen.has(asset.id))];
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("[assets] load-more failed", err);
      }
    }
  }, [source, filter, debouncedQuery, workflowId]);

  // Called only after the delete SUCCEEDED; the bytes live on in the recycle bin for 30 days.
  const onDeleted = useCallback((id: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }, []);

  // Wiring `onAssetAction` is also what makes the panel render the ⋯ menu at all.
  const onAssetAction = useMemo(
    () => createWorkflowAssetActionHandler({ onDeleted }),
    [onDeleted],
  );

  // `patchAsset` announces the change, which refetches this grid with the new name.
  const onRenameAsset = useCallback(async (asset: WorkflowAsset, draft: string) => {
    const decision = decideRename(asset.title ?? "", draft);
    if (decision.kind !== "save") return;
    try {
      await patchAsset(asset.id, { name: decision.name });
    } catch (err) {
      useToastStore.getState().push(translateStatic("appChat.knowledgeBase.renameFailed"), "error");
      throw err;
    }
  }, []);

  // Deduped by id, so the refetch replacing the list can't double an upload up.
  const prepend = useCallback((incoming: WorkflowAsset[]) => {
    if (incoming.length === 0) return;
    setAssets((prev) => {
      const fresh = new Set(incoming.map((asset) => asset.id));
      return [...incoming, ...prev.filter((asset) => !fresh.has(asset.id))];
    });
  }, []);

  // The panel's loading state replaces the whole grid, so only the FIRST load shows it.
  const loading = isFetching && assets.length === 0;

  const config = useMemo<AssetsPanelConfig>(
    () => ({
      assets,
      loading,
      filterTypes: FILTER_TYPES,
      defaultTab: DEFAULT_TAB,
      tabLabels: labels?.tabs,
      emptyLabel: failed ? labels?.error : labels?.empty,
      emptyDescription: failed ? labels?.errorDescription : labels?.emptyDescription,
      onTabChange,
      onSearch,
      // `q` reaches the server, which matches more than the card's title.
      searchedByHost: true,
      onFilterChange,
      onSelectAsset,
      onAssetAction,
      onRenameAsset,
      onLoadMore: loadMore,
      hasMore,
    }),
    [
      assets,
      loading,
      failed,
      labels,
      onTabChange,
      onSearch,
      onFilterChange,
      onSelectAsset,
      onAssetAction,
      onRenameAsset,
      loadMore,
      hasMore,
    ],
  );

  return { config, refetch, prepend };
}
