"use client";

import { useQuery } from "@tanstack/react-query";

import { FLOW_BRAND_TEMPLATES_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import { listBrandKitTemplates } from "@/lib/media/brandKit";

import { TEMPLATES_STALE_MS } from "../constants";

/**
 * The starter kits to show before the user has a brand of their own (§3).
 *
 * Authored content, identical for every tenant and frozen at deploy, so the
 * stale time is a day.
 *
 * The error is RETURNED, not swallowed. Hiding the section on a failure was the
 * first bug this page shipped: the samples simply vanished, which looks exactly
 * like "this deployment has no templates" and exactly like "the frontend forgot
 * to render them". A named failure with a Retry is the difference between those
 * two, for the user and for whoever debugs it next.
 */
export function useBrandKitTemplates() {
  const query = useQuery({
    queryKey: FLOW_BRAND_TEMPLATES_QUERY_KEY,
    queryFn: ({ signal }) => listBrandKitTemplates(signal),
    staleTime: TEMPLATES_STALE_MS,
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
