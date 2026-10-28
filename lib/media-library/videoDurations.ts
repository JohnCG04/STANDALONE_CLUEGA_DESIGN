/**
 * Reading a video model's clip lengths off the `GET /models/videos` catalog.
 *
 * Deliberately free of React and of any transport import: the send boundary, the
 * pickers and the workflow host actions all need these, and a hook module would
 * drag the whole api/i18n chain into every one of them.
 */

import type { MediaVideoModel } from "@/resources/app/pages/app/components/Conversation/apis/types";

/** A model id without the relay prefix. Catalog rows are routed ids
 *  (`openrouter/alibaba/happyhorse-1.1`) while some callers hold the bare id the
 *  service registers — `DEFAULT_VIDEO_MODEL_ID` for "Auto" above all — so an
 *  exact-string lookup silently reported "model unknown" and every picker fell
 *  back to its generic duration list. */
export function bareVideoModelId(id: string): string {
  return id.startsWith("openrouter/") ? id.slice("openrouter/".length) : id;
}

/** The catalog row for `modelId`, matching the exact id first so an unexpected
 *  bare/routed collision can never beat a literal hit. */
export function findVideoModelRow(
  rows: readonly MediaVideoModel[] | null | undefined,
  modelId: string | undefined,
): MediaVideoModel | undefined {
  if (!rows || !modelId) return undefined;
  return (
    rows.find((m) => m.id === modelId) ??
    rows.find((m) => bareVideoModelId(m.id) === bareVideoModelId(modelId))
  );
}

export const MIN_VIDEO_DURATION_SECONDS = 5;

export function videoDurationsOf(
  row: MediaVideoModel | null | undefined,
): number[] {
  const raw = row?.durations ?? row?.supported_durations ?? [];
  const durations = raw.filter(
    (d) =>
      typeof d === "number" &&
      Number.isFinite(d) &&
      d >= MIN_VIDEO_DURATION_SECONDS,
  );
  return [...new Set(durations)].sort((a, b) => a - b);
}

export function supportsVideoToVideo(
  row: MediaVideoModel | null | undefined,
): boolean {
  return row?.supports_video_to_video === true;
}

/** Where an edit goes when the catalog cannot answer.
 *
 *  A cold catalog (first paint, a failed `/models/videos` fetch) used to make
 *  `pickVideoEditModelId` return `undefined`, and the turn went out on whatever
 *  model the previous generation used — which for every model but a handful is
 *  a guaranteed `does not accept video input references` 400 from the provider.
 *  Naming a model that is known to read footage is strictly better than that;
 *  media-ai re-checks the pick server-side either way
 *  (`app/llm/video_capabilities.video_edit_model`). */
export const FALLBACK_VIDEO_EDIT_MODEL_ID = "openrouter/bytedance/seedance-2.0";

export function pickVideoEditModelId(
  rows: readonly MediaVideoModel[] | null | undefined,
  currentModelId: string | undefined,
  /** The server's ranking (`video_edit_models`), best first. Without it the
   *  first capable row in catalog order is taken, which is how an edit used to
   *  land on a general video model while a real in-context editor was listed
   *  further down. */
  preferredIds?: readonly string[],
): string {
  const current = findVideoModelRow(rows, currentModelId);
  if (supportsVideoToVideo(current) && current) return current.id;
  for (const id of preferredIds ?? []) {
    const row = findVideoModelRow(rows, id);
    if (row && supportsVideoToVideo(row)) return row.id;
  }
  return (
    (preferredIds ?? [])[0] ??
    rows?.find((row) => supportsVideoToVideo(row))?.id ??
    FALLBACK_VIDEO_EDIT_MODEL_ID
  );
}

/** Every model that can EDIT a video, best first.
 *
 *  What a picker greys the rest against, and what a refusal points at. The
 *  server's ranking leads when it is known; the remaining capable rows keep
 *  catalog order behind it. */
export function videoEditCapableRows(
  rows: readonly MediaVideoModel[] | null | undefined,
  preferredIds?: readonly string[],
): MediaVideoModel[] {
  const capable = (rows ?? []).filter((row) => supportsVideoToVideo(row));
  const ordered: MediaVideoModel[] = [];
  for (const id of preferredIds ?? []) {
    const row = capable.find((r) => bareVideoModelId(r.id) === bareVideoModelId(id));
    if (row && !ordered.includes(row)) ordered.push(row);
  }
  for (const row of capable) if (!ordered.includes(row)) ordered.push(row);
  return ordered;
}

export function acceptsRealPersonInput(
  row: MediaVideoModel | null | undefined,
): boolean {
  return row?.accepts_real_person_input === true;
}

/** Editors registered for exactly this refusal, best first.
 *
 *  A stopgap for the window where the router carries a person-tolerant editor
 *  but media-ai has not published `accepts_real_person_input` for it yet. Always
 *  filtered against the catalog, so a chip can never point at a model the router
 *  does not carry — that would turn one failed turn into a 404. */
export const PERSON_TOLERANT_VIDEO_EDIT_MODEL_IDS = [
  "openrouter/runway/aleph-2",
  "openrouter/minimax/hailuo-3",
] as const;

/** Every model that can edit a video AND whose provider permits a real person
 *  in the footage, best first.
 *
 *  What a refusal points at. Never suggests a model measured as refusing: the
 *  remedy for this failure is a provider with a different input policy, so
 *  offering the same vendor again would just spend another turn. */
export function personTolerantVideoEditRows(
  rows: readonly MediaVideoModel[] | null | undefined,
  preferredIds?: readonly string[],
): MediaVideoModel[] {
  const capable = videoEditCapableRows(rows, preferredIds);
  const measured = capable.filter((row) => acceptsRealPersonInput(row));
  if (measured.length > 0) return measured;
  return PERSON_TOLERANT_VIDEO_EDIT_MODEL_IDS.map((id) =>
    capable.find((row) => bareVideoModelId(row.id) === bareVideoModelId(id)),
  ).filter((row): row is MediaVideoModel => Boolean(row));
}

/** The label to show for a model id — its display name when the catalog knows
 *  it, else the bare id (never the routed `openrouter/...` form, which reads as
 *  plumbing). */
export function videoModelLabel(
  rows: readonly MediaVideoModel[] | null | undefined,
  modelId: string,
): string {
  const row = findVideoModelRow(rows, modelId);
  return row?.display_name || bareVideoModelId(modelId);
}
