"use client";

import { useQuery } from "@tanstack/react-query";

import { FONT_CATALOGUE_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import {
  CURATED_FONT_FAMILIES,
  fetchFontCatalogue,
  type FontCatalogue,
} from "@/lib/media/brandFonts";

import { FONT_CATALOGUE_STALE_MS } from "../constants";

const FALLBACK: FontCatalogue = {
  families: CURATED_FONT_FAMILIES,
  source: "curated",
};

/**
 * The families the Font picker lists.
 *
 * One query key for the whole page: nine text styles open nine pickers, and
 * they must not be nine fetches. Cached a day — the list is the same for every
 * tenant.
 *
 * A failure falls back rather than surfacing. Unlike the brand templates, an
 * empty font list has a sane substitute, and a field that refuses to open
 * because Google is unreachable blocks an edit that has nothing to do with
 * Google.
 */
export function useFontCatalogue(): FontCatalogue & { isLoading: boolean } {
  const query = useQuery({
    queryKey: FONT_CATALOGUE_QUERY_KEY,
    queryFn: ({ signal }) => fetchFontCatalogue(signal),
    staleTime: FONT_CATALOGUE_STALE_MS,
  });

  return { ...(query.data ?? FALLBACK), isLoading: query.isLoading };
}
