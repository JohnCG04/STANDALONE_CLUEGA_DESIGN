"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { FLOW_BRANDS_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import { listBrands, type Brand } from "@/lib/media/brandKit";
import { primeBrandsFrom } from "@/lib/media/brandSelection";

import { BRANDS_STALE_MS } from "../constants";

/**
 * Every brand this tenant has.
 *
 * react-query, not SWR: FlowSWRProvider is mounted only by FlowPage and the
 * Brand Kit is its sibling, while QueryProvider sits above the route in
 * app/app/layout.tsx — so its cache survives the shell remount every `/app/*`
 * navigation causes, which is exactly the list↔editor trip. It also resets on
 * ACTIVE_TEAM_CHANGED_EVENT, and brands are tenant-scoped.
 */
export function useBrandKitList() {
  const query = useQuery({
    queryKey: FLOW_BRANDS_QUERY_KEY,
    queryFn: ({ signal }) => listBrands(signal),
    staleTime: BRANDS_STALE_MS,
  });

  const brands: Brand[] = query.data ?? [];

  useEffect(() => {
    if (!query.isSuccess || !query.data) return;
    // The composer's pill reads an ambient catalogue, and `primeBrands()` makes
    // the very request this query just made. Handing the answer over keeps that
    // ONE GET /ads/brands and closes the window where the two disagree.
    primeBrandsFrom(query.data);
    // Nothing to reconcile any more. Both halves of "does this workspace brand
    // its renders, and with what" are the service's `is_default`, so a stale
    // preference is not a state this client can be in.
  }, [query.isSuccess, query.data]);

  return {
    brands,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
