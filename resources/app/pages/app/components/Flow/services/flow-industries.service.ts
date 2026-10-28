import type { LanguageCode } from "@/i18n/config";
import { presetText } from "@/lib/flow/presetText";

import { FlowApiError, requestFlowApi } from "./flow-builder.service";
import {
  localizedText,
  PRESET_PREFIX,
  type PresetLocalizedText,
} from "./flow-presets.service";

// The catalog's INDUSTRY taxonomy — the READ half. Writes live in the admin
// client (`../admin/flow-admin.service.ts`), same split as the categories.
//
//   GET /api/v1/flow-presets/industries → listPresetIndustries
//
// An industry says what MARKET a workflow serves ("Mẹ và bé", and under it
// "Tã"); a category says what KIND of technique it is. They are independent
// axes, which is why a preset carries one category but any number of industries.

/** One row of the industry table. Shaped 1:1 after the backend's
 *  `dto.FlowIndustryResponse`. */
export interface FlowIndustry {
  /** Table row id — what the admin PUT/DELETE/reorder routes address. */
  id: string;
  /** Lowercase slug — the value presets carry and `?industry=` takes. */
  industry: string;
  /** Operator-authored label in EVERY language it was written in, carried whole
   *  and resolved at render time by `industryLabel` — the same contract a
   *  preset's copy follows, so switching the app's language re-renders without
   *  refetching the taxonomy. Rows written before industries went multilingual
   *  read back as `{ en: "<the old string>", vi: "", zh: "" }`. */
  name: PresetLocalizedText;
  description: PresetLocalizedText;
  /** Parent row's SLUG. Empty/undefined means a top-level industry.
   *  The taxonomy is two levels deep, so a row with a parent has no children. */
  parent?: string;
  /** Curated position among SIBLINGS, not a global rank. */
  sort_order?: number;
  /** Published presets referencing this industry. */
  count: number;
}

/** Wire tolerance: a row could name the slug `industry` (current) or `slug`
 *  (the spelling the category endpoint also accepts), and `parent` could arrive
 *  as `parent_slug` from a hand-rolled deployment. Tolerate all of them here so
 *  no caller has to. */
export interface FlowIndustryWire
  extends Partial<Omit<FlowIndustry, "count" | "id" | "name" | "description">> {
  id?: string;
  slug?: string;
  parent_slug?: string;
  count?: number;
  /** Unknown rather than the locale object: a deployment that predates the
   *  multilingual taxonomy still sends a bare string here, and `localizedText`
   *  is what reconciles the two. */
  name?: unknown;
  description?: unknown;
}

/** An industry with its children attached — what a two-level picker renders. */
export interface FlowIndustryNode extends FlowIndustry {
  children: FlowIndustry[];
}

/** Wire row → the shape every caller reads. Exported because the admin's write
 *  routes echo a row back and must read it by the same rule as the list does —
 *  a raw cast would hand a component the bare string a legacy backend sends. */
export function normalizeIndustryRow(row: FlowIndustryWire): FlowIndustry | null {
  const slug = (row.industry ?? row.slug)?.trim().toLowerCase();
  if (!slug || !row.id) return null;
  const parent = (row.parent ?? row.parent_slug)?.trim().toLowerCase();
  return {
    id: row.id,
    industry: slug,
    name: localizedText(row.name),
    description: localizedText(row.description),
    // "" and "no parent" mean the same thing; collapse to undefined so callers
    // only ever test one of them.
    parent: parent || undefined,
    sort_order: row.sort_order,
    count: row.count ?? 0,
  };
}

/**
 * The industry taxonomy, already in DISPLAY order — every top-level row followed
 * immediately by its own children.
 *
 * Returns `[]` rather than throwing when the backend does not serve this path
 * (404/405). Industries are the newest axis, so a deployment that predates them
 * must leave the rest of Flow working: the admin tab and the Save Template picker
 * simply have nothing to show. Every OTHER failure still throws — a 500 is a real
 * problem and hiding it behind an empty list would only make it hard to find.
 */
export async function listPresetIndustries(
  signal?: AbortSignal,
): Promise<FlowIndustry[]> {
  try {
    const envelope = await requestFlowApi<FlowIndustryWire[]>(
      `${PRESET_PREFIX}/industries`,
      { signal },
    );
    return (envelope.data ?? []).flatMap((row) => {
      const normalized = normalizeIndustryRow(row);
      return normalized ? [normalized] : [];
    });
  } catch (error) {
    if (isIndustriesUnavailable(error)) return [];
    throw error;
  }
}

/** Whether the failure means "this backend has no industry taxonomy" rather than
 *  "the request went wrong". Exported because the admin tab has to make the same
 *  call about its writes. */
export function isIndustriesUnavailable(error: unknown): boolean {
  return (
    error instanceof FlowApiError &&
    (error.status === 404 || error.status === 405)
  );
}

/**
 * Group the flat rows into parents-with-children.
 *
 * A row whose parent slug names nothing present is promoted to the top level
 * rather than dropped — the same call the backend makes, and for the same
 * reason: an orphan must stay visible in the one screen that can repair it.
 * Input order is preserved, because the endpoint already sorted it.
 */
export function buildIndustryTree(rows: FlowIndustry[]): FlowIndustryNode[] {
  const known = new Set(rows.map((row) => row.industry));
  const nodes = new Map<string, FlowIndustryNode>();
  const roots: FlowIndustryNode[] = [];

  for (const row of rows) {
    if (!row.parent || !known.has(row.parent)) {
      const node: FlowIndustryNode = { ...row, parent: undefined, children: [] };
      nodes.set(row.industry, node);
      roots.push(node);
    }
  }
  for (const row of rows) {
    if (!row.parent) continue;
    nodes.get(row.parent)?.children.push(row);
  }
  return roots;
}

/** Every slug a selection covers: the picked ones plus, for a picked parent,
 *  its children. Mirrors the backend's filter expansion, for the client-side
 *  label and count work that should not need a round trip. */
export function expandIndustrySelection(
  selected: string[],
  rows: FlowIndustry[],
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent) continue;
    const list = childrenOf.get(row.parent) ?? [];
    list.push(row.industry);
    childrenOf.set(row.parent, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slug of selected) {
    for (const candidate of [slug, ...(childrenOf.get(slug) ?? [])]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

/**
 * Display label for a row in the reader's language: the authored name resolved
 * for `lang` (falling back through en → vi → zh, as `presetText` defines), else
 * the slug itself.
 *
 * Kept here so the picker, the admin table and the filter bar all spell it the
 * same way — and so the fallback chain lives in ONE place. `lang` is a parameter
 * rather than a hook call because the trend helpers resolve labels outside React.
 */
export function industryLabel(
  row: Pick<FlowIndustry, "industry" | "name">,
  lang: LanguageCode,
): string {
  return presetText(row.name, lang) || row.industry;
}

// --- Session cache -----------------------------------------------------------
//
// The same hand-rolled cache the category taxonomy uses (see
// `../hooks/useFlowPresets.ts`): the table changes only when an operator edits
// it, and several unrelated surfaces ask for it on the same page.

let industriesCache: FlowIndustry[] | null = null;
let industriesInFlight: Promise<FlowIndustry[]> | null = null;

/** The taxonomy, fetched once per session. Concurrent callers share one request. */
export function loadFlowIndustries(): Promise<FlowIndustry[]> {
  if (industriesCache) return Promise.resolve(industriesCache);
  if (industriesInFlight) return industriesInFlight;
  industriesInFlight = listPresetIndustries()
    .then((rows) => {
      industriesCache = rows;
      return rows;
    })
    .finally(() => {
      industriesInFlight = null;
    });
  return industriesInFlight;
}

/** Drop the cached taxonomy. Every industry write must call this, or the Save
 *  Template picker keeps serving the pre-write snapshot for the rest of the
 *  session. */
export function invalidateFlowIndustries(): void {
  industriesCache = null;
}
