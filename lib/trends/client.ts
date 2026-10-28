import { cdpFetch, cdpFetchPaginated } from "@/lib/cdp";

import {
  normalizeTrendCategories,
  normalizeTrendPagination,
  normalizeTrendVideoList,
  type TrendCategory,
  type TrendVideo,
} from "./normalize";

// Client for the TikTok Popular trend corpus (PRD Screen 5 — trend picker).
// The global library routes need no user-owned connection:
//   GET /api/v1/integrations/tiktok-popular/trends/videos
//   GET /api/v1/integrations/tiktok-popular/trends/categories
//   GET /api/v1/integrations/tiktok-popular/trends/countries
//   GET /api/v1/integrations/tiktok-popular/trends/objectives
// Categories and countries are facet-derived on the backend: they only offer
// industries and regions that hold at least one listable video, so a selected
// option can no longer land on an empty grid. (Countries used to borrow the
// full tiktok-one creator-discovery list, which offered regions the corpus
// had never seen.) Filter dimensions: category_level1 /
// category_level2 (two-level industry codes such as BEAUTY_AND_PERSONAL_CARE),
// country_code (region), objective (campaign objective), search (product
// keyword) — the PRD's four axes. `include_analysis` always
// rides along so the detail view can show the corpus' per-video analysis.
// Wire tolerance lives in ./normalize — the corpus' response shapes were
// specified by curl only, so every field resolves through a pick-list there.

export type { TrendCategory, TrendVideo, TrendVideoAnalysis } from "./normalize";

export type TrendCountry = {
  code: string;
  name: string;
};

export type TrendCountryGroup = {
  id: string;
  name: string;
  countries: TrendCountry[];
};

export type ListTrendVideosParams = {
  categoryLevel1?: string;
  /** The product axis: the level-2 children of the chosen level-1 industry. */
  categoryLevel2?: string;
  countryCode?: string;
  /** The campaign objective the corpus discovered the video under. */
  objective?: string;
  search?: string;
  pageNo?: number;
  limit?: number;
  signal?: AbortSignal;
};

export type ListTrendVideosResult = {
  items: TrendVideo[];
  totalItems: number;
  pageNo: number;
  limit: number;
  totalPages: number;
};

export async function listTrendVideos({
  categoryLevel1,
  categoryLevel2,
  countryCode,
  objective,
  search,
  pageNo = 1,
  limit = 12,
  signal,
}: ListTrendVideosParams = {}): Promise<ListTrendVideosResult> {
  const { data, pagination } = await cdpFetchPaginated<unknown, unknown>(
    "/api/v1/integrations/tiktok-popular/trends/videos",
    {
      searchParams: {
        category_level1: categoryLevel1,
        category_level2: categoryLevel2,
        country_code: countryCode,
        objective,
        search,
        include_analysis: true,
        page_no: pageNo,
        limit,
      },
      auth: { kind: "auto" },
      signal,
    },
  );

  const items = normalizeTrendVideoList(data);
  const page = normalizeTrendPagination(pagination, {
    pageNo,
    limit,
    itemCount: items.length,
  });

  return {
    items,
    totalItems: page.totalItems,
    pageNo: page.pageNo,
    limit: page.limit,
    totalPages: page.totalPages,
  };
}

export async function listTrendCategories(
  signal?: AbortSignal,
): Promise<TrendCategory[]> {
  const result = await cdpFetch<unknown>(
    "/api/v1/integrations/tiktok-popular/trends/categories",
    { auth: { kind: "auto" }, signal },
  );
  return normalizeTrendCategories(result);
}

export async function listTrendCountries(
  signal?: AbortSignal,
): Promise<TrendCountryGroup[]> {
  const result = await cdpFetch<TrendCountryGroup[]>(
    "/api/v1/integrations/tiktok-popular/trends/countries",
    { auth: { kind: "auto" }, signal },
  );
  return Array.isArray(result) ? result : [];
}

/** One campaign objective the corpus can actually return videos for. */
export type TrendObjective = {
  value: string;
  count: number;
};

/**
 * The objective options, biggest first.
 *
 * Facet-derived like the categories and countries above: the backend sums the
 * segment facets, so an offered objective always has listable videos behind it.
 * A malformed row is dropped rather than rendered as an unselectable blank.
 */
export async function listTrendObjectives(
  signal?: AbortSignal,
): Promise<TrendObjective[]> {
  const result = await cdpFetch<unknown>(
    "/api/v1/integrations/tiktok-popular/trends/objectives",
    { auth: { kind: "auto" }, signal },
  );
  if (!Array.isArray(result)) return [];
  return result.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    if (!value) return [];
    const count = typeof record.count === "number" ? record.count : 0;
    return [{ value, count }];
  });
}
