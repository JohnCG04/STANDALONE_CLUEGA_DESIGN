"use client";

import { useMemo } from "react";
import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { toModelOption } from "@dogclaw-ad/workflow";
import type { AudioModels, HostModelEntry, ImageModel } from "@dogclaw-ad/workflow";

import { listAudioModelLanes } from "@/lib/media/audioModels";
import {
  fetchImageModels,
  fetchTextModels,
  fetchVideoModels,
} from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { toAudioModels } from "../helpers";
import { resolveModelIcon } from "../modelIcon";
import type { CatalogRow } from "../types";

// The package's own mapper keeps `capabilities`; only the icon is ours (the service ships none).
function toPickerModel(m: CatalogRow): ImageModel {
  // The response carries the full gateway row, which is what `HostModelEntry` models.
  const row = m as HostModelEntry;
  const option = toModelOption(row);
  return {
    ...option,
    icon: resolveModelIcon(
      [option.name, row.provider_name, m.id].filter(Boolean).join(" "),
    ),
  };
}

// Rows stay plain JSON in the cache: icons are JSX, so they are added on read.
// No `signal`: the fetch is shared, so an unmounting editor must not cancel it for the next.
function catalogQuery<T>(kind: string, fetchRows: () => Promise<T>) {
  return queryOptions({
    queryKey: ["media", "models", kind],
    queryFn: () => fetchRows(),
    staleTime: Infinity,
    // A failed catalog settles at once (pickers keep their defaults); the next prewarm retries it.
    retry: false,
  });
}

const imageModelsQuery = catalogQuery("image", fetchImageModels);
const videoModelsQuery = catalogQuery("video", fetchVideoModels);
const textModelsQuery = catalogQuery("text", fetchTextModels);
const audioModelsQuery = catalogQuery("audio", listAudioModelLanes);

let loggedCatalogFailure = false;

/**
 * Fill the four catalogs: a cached one is not refetched, a failed one is retried. Call it eagerly
 * (from the flow list) so the editor's pickers open on real models instead of the defaults.
 */
export async function prewarmWorkflowModels(queryClient: QueryClient): Promise<void> {
  const results = await Promise.allSettled([
    queryClient.fetchQuery(imageModelsQuery),
    queryClient.fetchQuery(videoModelsQuery),
    queryClient.fetchQuery(textModelsQuery),
    queryClient.fetchQuery(audioModelsQuery),
  ]);

  const failures = results.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : "request failed"]
      : [],
  );
  if (failures.length === 0 || loggedCatalogFailure) return;
  loggedCatalogFailure = true;
  console.info("Workflow model catalogs unavailable; using built-in defaults.", failures);
}

function usePickerModels(rows: CatalogRow[] | undefined): ImageModel[] | undefined {
  return useMemo(() => rows?.filter((m) => m && m.id).map(toPickerModel), [rows]);
}

/**
 * The media-ai catalogs for the editor's pickers; `undefined` keeps its built-in defaults.
 * A prewarmed catalog is returned on the first render, so there is no default-model flash.
 */
export function useWorkflowModels(): {
  models: ImageModel[] | undefined;
  videoModels: ImageModel[] | undefined;
  textModels: ImageModel[] | undefined;
  audioModels: AudioModels | undefined;
} {
  const { data: imageRows } = useQuery(imageModelsQuery);
  const { data: videoRows } = useQuery(videoModelsQuery);
  const { data: textRows } = useQuery(textModelsQuery);
  const { data: audioLanes } = useQuery(audioModelsQuery);

  const models = usePickerModels(imageRows);
  const videoModels = usePickerModels(videoRows);
  const textModels = usePickerModels(textRows);
  const audioModels = useMemo(
    () => (audioLanes ? toAudioModels(audioLanes, resolveModelIcon) : undefined),
    [audioLanes],
  );

  return { models, videoModels, textModels, audioModels };
}
