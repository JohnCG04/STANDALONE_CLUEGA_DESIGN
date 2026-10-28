import { canToggleFlowFavorite } from "@/lib/flow/flowFavorites";

import { PROJECT_NAME_MAX_LENGTH } from "./constants";
import { FlowApiError, type FlowProject } from "./services/flow-builder.service";
import type { ViewMode, WorkflowProject } from "./types";

// Deterministic avatar color derived from a *name* (not a random id), so the
// same name always maps to the same hue — stable and recognizable wherever it is
// drawn: the author avatar on a project card and the workspace tile in the Flow
// sidebar use this one function so they can never disagree about a person's
// colour.
//
// The hue is spread over the full spectrum for easy distinction; saturation and
// lightness are fixed to keep every hue vivid yet dark enough for legible white
// text. Returns a CSS gradient for use as an inline `backgroundImage`.
export function nameToColor(name: string): string {
  const key = name.trim().toLowerCase() || "?";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const from = `hsl(${hue} 65% 45%)`;
  const to = `hsl(${(hue + 24) % 360} 68% 38%)`;
  return `linear-gradient(135deg, ${from}, ${to})`;
}

/** Narrow a raw localStorage read to a view mode, so junk falls back to grid. */
export const isViewMode = (value: string | null): value is ViewMode =>
  value === "grid" || value === "list";

/** Characters in a trimmed name, by code point: `.length` counts an emoji twice. */
export const projectNameLength = (name: string): number => [...name.trim()].length;

/** A name must be non-empty and within the backend's limit to be submitted. */
export const isValidProjectName = (name: string): boolean => {
  const length = projectNameLength(name);
  return length > 0 && length <= PROJECT_NAME_MAX_LENGTH;
};

/** What a refused rename tells the user; the backend's code names the rule that was broken. */
export const renameErrorMessage = (err: unknown, t: (key: string) => string): string => {
  const code = err instanceof FlowApiError ? err.code : "";
  if (code === "flow_name_required") return t("appChat.flow.rename.required");
  if (code !== "flow_name_too_long") return t("appChat.flow.rename.failed");
  const details = (err as FlowApiError).details as { max?: unknown } | undefined;
  const max = typeof details?.max === "number" ? details.max : PROJECT_NAME_MAX_LENGTH;
  return t("appChat.flow.rename.maxLength").replace("{max}", String(max));
};

const localeFor = (lang: string) => (lang === "vn" ? "vi" : lang);

/** Localized "3 mins ago" style label from an RFC3339 timestamp. */
export function formatRelative(iso: string, lang: string, justNow: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return justNow;
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of units) {
    if (abs >= seconds) return rtf.format(Math.round(diffSec / seconds), unit);
  }
  return rtf.format(diffSec, "second");
}

/** The API project as the cards and rows read it. */
export function toViewModel(
  project: FlowProject,
  lang: string,
  justNow: string,
  author: { initials: string; displayName: string },
  currentUserId: string | null,
): WorkflowProject {
  // The avatar represents the creator (the signed-in user), not the project —
  // its initial and color both derive from the user's name so they stay coherent.
  const initial = author.initials || "U";
  return {
    id: project.id,
    name: project.name,
    assets: project.asset_count,
    credits: project.credit_used,
    thumbnailUrl: project.thumbnail_url,
    thumbnailType: project.thumbnail_type,
    authorInitial: initial,
    authorColor: nameToColor(author.displayName || initial),
    updatedLabel: formatRelative(project.updated_at, lang, justNow),
    favorite: project.favorite,
    canFavorite: canToggleFlowFavorite(project, currentUserId),
  };
}
