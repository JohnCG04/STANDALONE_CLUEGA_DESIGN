import { toModelOption } from "@dogclaw-ad/workflow";
import type {
  AssetSource,
  AssetType,
  AudioModels,
  HostModelEntry,
  ImageModel,
  WorkflowAsset,
  WorkflowTemplateCategory,
  WorkflowTemplateIndustry,
} from "@dogclaw-ad/workflow";

import type { LanguageCode } from "@/i18n/config";
import type { Asset, ListAssetsParams } from "@/lib/cdp/assetsClient";
import { presetText } from "@/lib/flow/presetText";
import type { AudioModelLanes, AudioModelRow } from "@/lib/media/audioModels";
import type {
  FlowDocument,
  FlowPage,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import {
  industryLabel,
  type FlowIndustry,
} from "@/resources/app/pages/app/components/Flow/services/flow-industries.service";
import type { FlowPresetCategory } from "@/resources/app/pages/app/components/Flow/services/flow-presets.service";
import { documentToGraph, documentViewport } from "../shared/flowGraph";
import { toProxiedMediaUrl } from "../shared/mediaProxy";
import type { RunGraphResult } from "../executor/types";
import { DOCUMENT_SESSION, FORMAT_BY_TYPE, UNTITLED_PAGE } from "./constants";
import type { CanvasState, IconFor, RunAllPageRow, RunTotals } from "./types";

export const editorRoute = (id: string) => `/workflow/${encodeURIComponent(id)}`;

export function toCanvas(document: FlowDocument): CanvasState {
  const { nodes, edges } = documentToGraph(document);
  return {
    status: "ready",
    nodes,
    edges,
    viewport: documentViewport(document),
    // Seeds the optimistic-lock counter for the first autosave.
    version: document.version,
    globalConfig: document.global_config,
  };
}

export const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The panel's query as `GET /api/v1/assets` params: tabs differ only by `workflow_id` scope,
 * documents ride `category`, and sort is fixed newest-first so `cursor` pages stay consistent.
 */
export function panelListParams(input: {
  tab: AssetSource;
  workflowId?: string;
  filter: AssetType | "all";
  q?: string;
  limit: number;
  cursor?: string;
}): ListAssetsParams {
  return {
    workflowId: input.tab === "creation" ? input.workflowId : undefined,
    format: input.filter === "all" ? undefined : FORMAT_BY_TYPE[input.filter],
    category: input.filter === "document" ? "document" : undefined,
    q: input.q || undefined,
    sort: "created_at",
    order: "desc",
    limit: input.limit,
    cursor: input.cursor || undefined,
  };
}

/** The panel's filter bucket for one asset; undefined shows only under "All". */
function panelType(asset: Asset): AssetType | undefined {
  if (asset.mimeType.startsWith("image/")) return "image";
  if (asset.mimeType.startsWith("video/")) return "video";
  if (asset.mimeType.startsWith("audio/")) return "audio";
  if (asset.category === "document") return "document";
  return undefined;
}

/**
 * `id` is the ASSET id (what `DELETE /api/v1/assets/:id` takes), never a media ULID.
 * Only image urls are proxied: proxying a video would stream the whole clip through our origin.
 */
export function assetToWorkflowAsset(asset: Asset): WorkflowAsset {
  const type = panelType(asset);
  const kind = type === "video" || type === "audio" ? type : "image";
  return {
    id: asset.id,
    url: kind === "image" ? toProxiedMediaUrl(asset.fileUrl) : asset.fileUrl,
    kind,
    mimeType: asset.mimeType || undefined,
    width: asset.width,
    height: asset.height,
    source: asset.source === "upload" ? "upload" : "creation",
    type,
    title: asset.title || asset.name,
    thumbnailUrl: asset.thumbUrl ? toProxiedMediaUrl(asset.thumbUrl) : undefined,
    createdAt: asset.createdAt,
  };
}

/**
 * One page of API rows → the grid, shared by the bootstrap seed and the fetch so they agree.
 * Drops rows the card cannot render (not `ready`, or no `fileUrl`): it has no failed state.
 */
export function toPanelAssets(items: Asset[]): WorkflowAsset[] {
  return items
    .filter((asset) => asset.status === "ready" && Boolean(asset.fileUrl))
    .map(assetToWorkflowAsset);
}

function toPickerModels(rows: AudioModelRow[], iconFor: IconFor): ImageModel[] {
  return rows.map((row) => {
    // The package's own mapper, so per-model `voices` / `durations` become capabilities.
    const option = toModelOption(row as HostModelEntry);
    return { ...option, icon: iconFor(option.name) };
  });
}

/** `/models/audio` lanes → the editor's `audioModels` (tts → voice); ids pass verbatim. */
export function toAudioModels(lanes: AudioModelLanes, iconFor: IconFor): AudioModels {
  return {
    voice: toPickerModels(lanes.tts, iconFor),
    music: toPickerModels(lanes.music, iconFor),
    sfx: toPickerModels(lanes.sfx, iconFor),
  };
}

/** Lowest free "Page N", so a create after a delete doesn't collide with a surviving row. */
export function nextPageName(items: FlowPage[]): string {
  const taken = new Set(items.map((page) => page.name));
  for (let n = items.length + 1; ; n++) {
    const name = `Page ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Sentence-case a slug with no operator label ("neon_noir" → "Neon noir"). */
function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

export function toTemplateCategory(
  row: FlowPresetCategory,
  lang: LanguageCode,
): WorkflowTemplateCategory {
  // `id` is the SLUG the list filters on; a label equal to the slug is a backfill placeholder.
  const authored = presetText(row.name, lang).trim();
  return {
    id: row.category,
    name:
      authored && authored !== row.category
        ? authored
        : humanizeSlug(row.category),
  };
}

/** `id` is the SLUG the payload's `industries` and `?industry=` use, never the database id. */
export function toTemplateIndustry(
  row: FlowIndustry,
  lang: LanguageCode,
): WorkflowTemplateIndustry {
  return {
    id: row.industry,
    name: industryLabel(row, lang),
    ...(row.parent ? { parent: row.parent } : {}),
  };
}

/** One session per page; a project without pages has its single document. */
export const sessionKeyOf = (pageId: string | null): string => pageId ?? DOCUMENT_SESSION;

/**
 * The pages to keep mounted (open, still running, Run all pages' current one), in page order,
 * so a page that starts or ends a run never moves the others in the DOM.
 */
export function mountedSessions(
  order: readonly string[],
  wanted: readonly (string | null | undefined)[],
): string[] {
  const keys = new Set(wanted.filter((key): key is string => Boolean(key)));
  const known = order.filter((key) => keys.has(key));
  return [...known, ...[...keys].filter((key) => !order.includes(key))];
}

/** The Run all pages confirmation: every page in display order with its saved node count. */
export function runAllRows(pages: readonly FlowPage[]): RunAllPageRow[] {
  return pages.map((page) => ({
    id: page.id,
    name: page.name || UNTITLED_PAGE,
    nodeCount: page.node_count ?? 0,
  }));
}

export function sumRuns(results: readonly RunGraphResult[]): RunTotals {
  return results.reduce<RunTotals>(
    (sum, r) => ({
      ran: sum.ran + r.ran.length,
      failed: sum.failed + r.failed.length,
      blocked: sum.blocked + r.blocked.length,
      aborted: sum.aborted || r.aborted,
    }),
    { ran: 0, failed: 0, blocked: 0, aborted: false },
  );
}

/** The toast after a run; `null` after a stop, which the user asked for. `pages` = Run all pages. */
export function runSummary(
  totals: RunTotals,
  t: (key: string) => string,
  pages?: number,
): { message: string; tone: "info" | "error" } | null {
  if (totals.aborted) return null;
  if (totals.failed > 0 || totals.blocked > 0) {
    const message = t("appChat.flow.run.summaryFailed")
      .replace("{failed}", String(totals.failed))
      .replace("{blocked}", String(totals.blocked));
    return { message, tone: "error" };
  }
  if (totals.ran === 0) return { message: t("appChat.flow.run.upToDate"), tone: "info" };
  const message =
    pages === undefined
      ? t("appChat.flow.run.summaryDone").replace("{ran}", String(totals.ran))
      : t("appChat.flow.run.allPagesDone")
          .replace("{ran}", String(totals.ran))
          .replace("{pages}", String(pages));
  return { message, tone: "info" };
}
