import type { Asset as EditorAsset, WorkflowVariable } from "@dogclaw-ad/workflow";

import type { Asset } from "@/lib/cdp/assetsClient";
import type { FlowVariable } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { fromProxiedMediaUrl, toProxiedMediaUrl } from "../shared/mediaProxy";
import { CREATION_SOURCES } from "./constants";
import type { MediaVariableKind, PickedTile, PickerSource } from "./types";

/** `GET /api/v1/assets` filters for one tab of the picker. */
export function pickerListFilters(kind: MediaVariableKind, source: PickerSource) {
  return {
    format: `${kind}/`,
    source: source === "upload" ? ("upload" as const) : CREATION_SOURCES,
  };
}

/** The editor's copy of a saved variable; image urls proxied so the canvas can read pixels. */
export function toWorkflowVariable(variable: FlowVariable): WorkflowVariable {
  const image = variable.kind === "image";
  return {
    id: variable.id,
    name: variable.name,
    kind: variable.kind,
    text: variable.text,
    items: (variable.items ?? []).map((item) => ({
      id: item.asset_id,
      url: image ? toProxiedMediaUrl(item.url) : item.url,
      thumbnailUrl: item.thumbnail_url ? toProxiedMediaUrl(item.thumbnail_url) : undefined,
      mimeType: item.mime_type,
      title: item.title,
    })),
  };
}

/** A library row as a picker tile; real urls, since the grid derives its own thumbnails. */
export function libraryTile(asset: Asset, kind: MediaVariableKind): PickedTile {
  const title = asset.title || asset.name;
  return {
    key: asset.id,
    url: asset.fileUrl,
    thumbnailUrl: asset.thumbUrl || undefined,
    fileName: asset.name,
    title,
    isVideo: kind === "video",
    isAudio: kind === "audio",
    aspect: asset.width && asset.height ? asset.width / asset.height : undefined,
    source: "cluega_db",
    item: {
      asset_id: asset.id,
      url: asset.fileUrl,
      thumbnail_url: asset.thumbUrl || undefined,
      mime_type: asset.mimeType || undefined,
      title: title || undefined,
    },
  };
}

/** A file uploaded from the picker; it has no library id until the mirror files it. */
export function uploadedTile(asset: EditorAsset, file: File, kind: MediaVariableKind): PickedTile {
  const url = fromProxiedMediaUrl(asset.url);
  return {
    key: asset.id ?? url,
    url,
    fileName: file.name,
    title: file.name,
    isVideo: kind === "video",
    isAudio: kind === "audio",
    aspect: asset.width && asset.height ? asset.width / asset.height : undefined,
    source: "cluega_db",
    item: { url, mime_type: asset.mimeType || file.type || undefined, title: file.name },
  };
}
