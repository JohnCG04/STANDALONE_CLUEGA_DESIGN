import { useEffect, useMemo, useState } from "react";

import { fetchVideoModelCatalog } from "../components/Conversation/apis/apis";
import type { MediaVideoModel } from "../components/Conversation/apis/types";
import { snapVideoDuration } from "../components/SuggestionPills/videoGenConfig";
import {
  findVideoModelRow,
  videoDurationsOf,
} from "@/lib/media-library/videoDurations";

// Re-exported so the pickers keep one import for "catalog things".
export {
  bareVideoModelId,
  findVideoModelRow,
  videoDurationsOf,
} from "@/lib/media-library/videoDurations";

/**
 * Shared access to the raw `GET /models/videos` catalog.
 *
 * The composer's model picker only needs an id, a label and a cost band, so it
 * used to cache its own already-mapped list and throw the capability fields
 * away. But the duration picker needs exactly those fields — `supported_durations`
 * is the only honest answer to "how long can this model render?" — so the raw
 * rows are cached here once and every consumer derives what it needs from them.
 */

let catalogCache: MediaVideoModel[] | null = null;
// The ids that can serve an EDIT, best first, as the server ranks them. Cached
// beside the rows because the flag alone does not say which capable model to
// prefer — an in-context editor beats a general video model at editing.
let editModelCache: string[] = [];
// De-dupes concurrent first mounts (composer + video panel) onto one request.
let inflight: Promise<MediaVideoModel[]> | null = null;

/** The cached rows, or `null` while the catalog has never been fetched. */
export function cachedVideoCatalog(): MediaVideoModel[] | null {
  return catalogCache;
}

/**
 * Drops the cached rows and the edit order so the next read refetches. See
 * {@link invalidateImageCatalog}: this catalog is per tenant too.
 */
export function invalidateVideoCatalog(): void {
  catalogCache = null;
  editModelCache = [];
}

/** The edit-capable ids, best first — empty until the catalog has loaded. */
export function cachedVideoEditModelIds(): string[] {
  return editModelCache;
}

/** Fetches (once) and caches the catalog. Rejects if the request fails, leaving
 *  the cache empty so a later mount retries. */
export function loadVideoCatalog(): Promise<MediaVideoModel[]> {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!inflight) {
    inflight = fetchVideoModelCatalog()
      .then(({ models, videoEditModels }) => {
        catalogCache = (models ?? []).filter((m) => m && m.id);
        editModelCache = videoEditModels ?? [];
        return catalogCache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The catalog rows, loading them on first use when `enabled`. */
export function useVideoCatalog(enabled = true): {
  rows: MediaVideoModel[] | null;
  loading: boolean;
} {
  const [rows, setRows] = useState<MediaVideoModel[] | null>(catalogCache);
  const [loading, setLoading] = useState(enabled && catalogCache === null);

  useEffect(() => {
    if (!enabled || catalogCache) return;
    let cancelled = false;
    setLoading(true);

    loadVideoCatalog()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch((e) => {
        console.error("Failed to load video models:", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { rows: rows ?? catalogCache, loading };
}

/**
 * Snap a duration onto `modelId`'s advertised clip lengths — the non-hook twin of
 * {@link useVideoModelCapabilities}, for callers outside React (the workflow host
 * actions). Falls back to the model-agnostic clamp when the model is unknown or
 * the catalog cannot be reached, which is why a failed fetch is swallowed.
 */
export async function snapDurationForVideoModel(
  modelId: string | undefined,
  value: unknown,
): Promise<number> {
  if (!modelId) return snapVideoDuration(value, undefined);
  let rows = catalogCache;
  if (!rows) {
    rows = await loadVideoCatalog().catch(() => null);
  }
  return snapVideoDuration(value, videoDurationsOf(findVideoModelRow(rows, modelId)));
}

export type VideoModelCapabilities = {
  /** Clip lengths the model accepts, ascending. Empty when unknown. */
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
};

const NO_CAPABILITIES: VideoModelCapabilities = {
  durations: [],
  resolutions: [],
  aspectRatios: [],
};

/**
 * What `modelId` can do, from the live catalog. Every field is empty when the
 * model is unknown — no id yet ("Auto", where the service picks), a cold catalog,
 * or a model the catalog does not list. Callers must treat empty as "no
 * constraint known" and fall back to their generic options rather than blocking.
 */
export function useVideoModelCapabilities(
  modelId?: string,
): VideoModelCapabilities {
  const { rows } = useVideoCatalog(Boolean(modelId));

  return useMemo(() => {
    const row = findVideoModelRow(rows, modelId);
    if (!row) return NO_CAPABILITIES;
    return {
      durations: videoDurationsOf(row),
      resolutions: row.supported_resolutions ?? [],
      aspectRatios: row.supported_aspect_ratios ?? [],
    };
  }, [modelId, rows]);
}
