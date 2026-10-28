import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { listAssets } from "@/lib/cdp/assetsClient";
import { libraryTile, pickerListFilters } from "../../helpers";
import type { MediaVariableKind, PickerSource } from "../../types";
import { PAGE_SIZE } from "../constants";

/** One picker tab of the library, newest first, a page at a time. */
export function useVariableAssets(input: {
  kind: MediaVariableKind | null;
  source: PickerSource;
  q: string;
}) {
  const { kind, source, q } = input;
  const query = useInfiniteQuery({
    queryKey: ["workflow", "variable-picker", kind, source, q],
    queryFn: ({ pageParam, signal }) =>
      listAssets(
        {
          ...pickerListFilters(kind ?? "image", source),
          status: "ready",
          q: q || undefined,
          sort: "created_at",
          order: "desc",
          limit: PAGE_SIZE,
          cursor: pageParam || undefined,
        },
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor || undefined,
    enabled: kind !== null,
    // Each open re-reads: an upload or a fresh render may have landed since.
    refetchOnMount: "always",
  });

  const pages = query.data?.pages;
  const tiles = useMemo(
    () =>
      kind === null
        ? []
        : (pages ?? [])
            .flatMap((page) => page.items)
            .filter((asset) => Boolean(asset.fileUrl))
            .map((asset) => libraryTile(asset, kind)),
    [pages, kind],
  );

  return {
    tiles,
    loading: query.isPending && kind !== null,
    error: query.isError,
    retry: query.refetch,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
  };
}
