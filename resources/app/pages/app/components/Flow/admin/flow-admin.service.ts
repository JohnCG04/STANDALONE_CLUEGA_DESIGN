import {
  FlowApiError,
  getProject,
  type FlowPagination,
} from "../services/flow-builder.service";
import {
  PRESET_PREFIX,
  getPreset,
  normalizePreset,
  requestPresetAdminApi,
  localizedText,
  type FlowPreset,
  type FlowPresetCategory,
  type ListPresetsParams,
  type ListPresetsResult,
  type PresetLocalizedText,
} from "../services/flow-presets.service";
import {
  invalidateFlowIndustries,
  normalizeIndustryRow,
  type FlowIndustry,
  type FlowIndustryWire,
} from "../services/flow-industries.service";
import { createWorkflowProjectFromPreset } from "@/lib/workflow/createProjectFromPreset";
import { invalidateFlowPresetCategories } from "../hooks/useFlowPresets";

// The /flow/admin write client. Every route here is operator-only and the
// server enforces that itself (the CDP backend's catalog admins) —
// `requestPresetAdminApi` merely re-checks the same email gate the page uses.
//
//   GET    /api/v1/flow-presets?status=…&is_tool=…  → adminListPresets
//   DELETE /api/v1/flow-presets/:id                 → deletePreset
//   POST   /api/v1/flow-presets/categories          → createPresetCategory
//   PUT    /api/v1/flow-presets/categories/:id      → updatePresetCategory
//   DELETE /api/v1/flow-presets/categories/:id      → deletePresetCategory
//
// Reads (the public list, the taxonomy) stay in flow-presets.service.ts. A row
// is EDITED in the editor's own publish wizard (`resolvePresetWorkflow` opens it;
// `republishPreset` in flow-presets.service.ts saves it), never from here.

/** Every write must drop the session catalog cache, or the gallery chips, the Home
 *  grids and the editor's Save Template picker keep serving the pre-write
 *  snapshot for the rest of the session. */
function invalidateCatalogCaches(): void {
  invalidateFlowPresetCategories();
}

// --- Presets -----------------------------------------------------------------

export type AdminPresetStatusFilter = "all" | "published" | "draft";

export interface AdminListPresetsParams extends ListPresetsParams {
  /** Admin-only: `all` also returns drafts. A legacy backend ignores the param
   *  and serves published rows, so the page degrades to a read-only browser. */
  status?: AdminPresetStatusFilter;
  /** `true` lists only tools (the Tools tab), `false` only templates (the
   *  Workflows tab); omitted lists both. Rows written before the field existed
   *  count as templates server-side. */
  is_tool?: boolean;
}

/** The admin list's query string — pure, so the filter spelling is testable. */
export function buildAdminListPresetsQuery(
  params: AdminListPresetsParams = {},
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("page_no", String(params.page_no ?? 1));
  query.set("limit", String(params.limit ?? 20));
  query.set("status", params.status ?? "all");
  // Filters are OMITTED when unset — `name=` matches the empty substring.
  if (params.category) query.set("category", params.category);
  const name = params.name?.trim();
  if (name) query.set("name", name);
  if (params.is_tool !== undefined) query.set("is_tool", String(params.is_tool));
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  return query;
}

export async function adminListPresets(
  params: AdminListPresetsParams = {},
): Promise<ListPresetsResult> {
  const pageNo = params.page_no ?? 1;
  const limit = params.limit ?? 20;
  const query = buildAdminListPresetsQuery(params);

  const envelope = await requestPresetAdminApi<FlowPreset[]>(
    `${PRESET_PREFIX}?${query.toString()}`,
    { signal: params.signal },
  );
  const items = (envelope.data ?? []).map(normalizePreset);
  return {
    items,
    pagination: envelope.pagination ?? {
      page_no: pageNo,
      limit,
      total_items: items.length,
      total_pages: items.length ? 1 : 0,
    },
  };
}

/**
 * The workflow a preset was published FROM — what the admin table's Edit action
 * opens. Only `GET /flow-presets/:id` carries the link (`workflow_project_id`
 * is not on the list projection), so resolving it costs one read per click.
 *
 * `null` for a row with no workflow behind it — a seeded card, or one published
 * before the link existed. Such a card has no canvas to open, so the caller
 * falls back to the dialog.
 */
export async function getPresetWorkflowProjectId(
  presetId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const detail = await getPreset(presetId, signal);
  return detail.workflow_project_id?.trim() || null;
}

/**
 * The workflow the admin's Edit action opens a row on: its own, when this
 * account can open it. Otherwise — never linked, deleted since (the link is not
 * cleared with it), or living in the PUBLISHER's tenant (projects are
 * tenant-scoped, presets global) — a fresh copy made from the graph the row
 * stores, so the editor's publish wizard has a canvas. Saving the edit
 * republishes the row with that copy as its workflow.
 */
export async function resolvePresetWorkflow(
  presetId: string,
  signal?: AbortSignal,
): Promise<{ workflowId: string; copied: boolean }> {
  const linked = await getPresetWorkflowProjectId(presetId, signal);
  if (linked) {
    try {
      await getProject(linked);
      return { workflowId: linked, copied: false };
    } catch (cause) {
      const gone =
        cause instanceof FlowApiError &&
        (cause.status === 404 || cause.status === 403);
      if (!gone) throw cause;
    }
  }
  return {
    workflowId: await createWorkflowProjectFromPreset(presetId),
    copied: true,
  };
}

export async function deletePreset(id: string): Promise<void> {
  await requestPresetAdminApi<{ id: string; deleted: boolean }>(
    `${PRESET_PREFIX}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  invalidateCatalogCaches();
}

// --- Categories --------------------------------------------------------------

export interface CreatePresetCategoryInput {
  /** Copy in every locale, exactly as the preset wizard sends it. The server
   *  reads a bare string too, but the admin form always knows all three, so it
   *  always sends the object. */
  name: PresetLocalizedText;
  /** Lowercase unique slug — the backend binds it as `category`; the server
   *  derives one from `name.en` when omitted. */
  category?: string;
  description?: PresetLocalizedText;
  sort_order?: number;
}

/** Slug is deliberately absent: renaming it would orphan every preset's
 *  `category`/`categories` references. The editable thing is the display name.
 *
 *  `name`/`description` go as the WHOLE locale object: the server replaces its
 *  stored translations with what an object carries, so sending only the language
 *  the operator happened to edit would delete the other two. */
export interface UpdatePresetCategoryInput {
  name?: PresetLocalizedText;
  description?: PresetLocalizedText;
  sort_order?: number;
}

/** A write echoes the saved row back; read it by the same rule the list does, so
 *  a legacy backend's bare `name` never reaches a component as a string. */
function normalizeCategoryRow(
  raw: Partial<Omit<FlowPresetCategory, "name" | "description">> & {
    slug?: string;
    name?: unknown;
    description?: unknown;
  },
): FlowPresetCategory {
  return {
    id: raw.id,
    category: (raw.slug ?? raw.category ?? "").trim().toLowerCase(),
    name: localizedText(raw.name),
    description: localizedText(raw.description),
    sort_order: raw.sort_order,
    count: raw.count ?? 0,
  };
}

export async function createPresetCategory(
  input: CreatePresetCategoryInput,
): Promise<FlowPresetCategory> {
  const envelope = await requestPresetAdminApi<Record<string, unknown>>(
    `${PRESET_PREFIX}/categories`,
    { method: "POST", body: JSON.stringify(input) },
  );
  invalidateCatalogCaches();
  return normalizeCategoryRow(envelope.data ?? {});
}

export async function updatePresetCategory(
  id: string,
  input: UpdatePresetCategoryInput,
): Promise<FlowPresetCategory> {
  const envelope = await requestPresetAdminApi<Record<string, unknown>>(
    `${PRESET_PREFIX}/categories/${encodeURIComponent(id)}`,
    // The backend registers this route as PUT — PATCH is a 404 there.
    { method: "PUT", body: JSON.stringify(input) },
  );
  invalidateCatalogCaches();
  return normalizeCategoryRow(envelope.data ?? {});
}

export async function deletePresetCategory(id: string): Promise<void> {
  await requestPresetAdminApi<{ id: string; deleted: boolean }>(
    `${PRESET_PREFIX}/categories/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  invalidateCatalogCaches();
}

/**
 * Persist a drag-and-drop reorder of the whole chip row: each id's POSITION in
 * the array becomes its `sort_order`.
 *
 * The list must name every category exactly once — the server refuses a partial
 * one rather than guessing where the omitted rows belong, so a client that raced
 * a concurrent create gets a 400 and re-reads. Returns the table as the server
 * now holds it; adopt that rather than the optimistic order, exactly as
 * `reorderPages` callers do.
 */
export async function reorderPresetCategories(
  ids: string[],
): Promise<FlowPresetCategory[]> {
  const envelope = await requestPresetAdminApi<Record<string, unknown>[]>(
    `${PRESET_PREFIX}/categories/reorder`,
    { method: "PUT", body: JSON.stringify({ ids }) },
  );
  invalidateCatalogCaches();
  return (envelope.data ?? []).map(normalizeCategoryRow);
}

// --- Industries --------------------------------------------------------------
//
//   POST   /api/v1/flow-presets/industries          → createPresetIndustry
//   PUT    /api/v1/flow-presets/industries/reorder  → reorderPresetIndustries
//   PUT    /api/v1/flow-presets/industries/:id      → updatePresetIndustry
//   DELETE /api/v1/flow-presets/industries/:id      → deletePresetIndustry
//
// The read (`listPresetIndustries`) lives in ../services/flow-industries.service.ts.

export interface CreatePresetIndustryInput {
  /** Copy in every locale, exactly as the preset wizard sends it. The server
   *  reads a bare string too, but the admin form always knows all three, so it
   *  always sends the object. */
  name: PresetLocalizedText;
  /** Lowercase unique slug; the server derives one from `name.en` when omitted. */
  industry?: string;
  description?: PresetLocalizedText;
  /** SLUG of an existing TOP-LEVEL industry, or omitted for a top-level row. */
  parent?: string;
  sort_order?: number;
}

/** Slug is absent for the same reason as the category's: presets reference it.
 *  `parent` IS editable — send `""` to promote a child to the top level.
 *
 *  `name`/`description` go as the WHOLE locale object: the server replaces its
 *  stored translations with what an object carries, so sending only the language
 *  the operator happened to edit would delete the other two. */
export interface UpdatePresetIndustryInput {
  name?: PresetLocalizedText;
  description?: PresetLocalizedText;
  parent?: string;
  sort_order?: number;
}

/** Where one row lands after a drop: its parent and its position among that
 *  parent's children. Both travel, because one drag in a tree can change both. */
export interface IndustryPlacement {
  id: string;
  /** `""` for a top-level row. */
  parent: string;
  sort_order: number;
}

export async function createPresetIndustry(
  input: CreatePresetIndustryInput,
): Promise<FlowIndustry> {
  const envelope = await requestPresetAdminApi<FlowIndustryWire>(
    `${PRESET_PREFIX}/industries`,
    { method: "POST", body: JSON.stringify(input) },
  );
  invalidateFlowIndustries();
  return requireIndustryRow(envelope.data);
}

export async function updatePresetIndustry(
  id: string,
  input: UpdatePresetIndustryInput,
): Promise<FlowIndustry> {
  const envelope = await requestPresetAdminApi<FlowIndustryWire>(
    `${PRESET_PREFIX}/industries/${encodeURIComponent(id)}`,
    // PUT, matching the category route — the backend registers no PATCH here.
    { method: "PUT", body: JSON.stringify(input) },
  );
  invalidateFlowIndustries();
  return requireIndustryRow(envelope.data);
}

export async function deletePresetIndustry(id: string): Promise<void> {
  await requestPresetAdminApi<{ id: string; deleted: boolean }>(
    `${PRESET_PREFIX}/industries/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  invalidateFlowIndustries();
}

/**
 * Persist a whole drag-and-drop result on the tree in ONE request.
 *
 * Every row travels with its parent and its sibling position, so a drop that
 * moves a row sideways and re-parents it in the same gesture is still one write.
 * The server validates the entire payload — full coverage, at most two levels, no
 * cycles — before touching anything, so a rejected drop leaves the stored tree
 * exactly as it was and the client can simply roll back to its snapshot.
 */
export async function reorderPresetIndustries(
  items: IndustryPlacement[],
): Promise<FlowIndustry[]> {
  const envelope = await requestPresetAdminApi<FlowIndustryWire[]>(
    `${PRESET_PREFIX}/industries/reorder`,
    { method: "PUT", body: JSON.stringify({ items }) },
  );
  invalidateFlowIndustries();
  return (envelope.data ?? []).flatMap((row) => {
    const normalized = normalizeIndustryRow(row);
    return normalized ? [normalized] : [];
  });
}

/** A write echoes the saved row back; read it by the SAME rule as the list does,
 *  so a legacy backend's bare `name` never reaches a component as a string.
 *  A row the normalizer rejects means the server answered with something this
 *  client cannot render — louder than a half-built row the UI would show. */
function requireIndustryRow(data: FlowIndustryWire | undefined): FlowIndustry {
  const row = data ? normalizeIndustryRow(data) : null;
  if (!row) throw new Error("industry response is missing its id or slug");
  return row;
}

// --- Copy helpers (pure — covered by flow-admin.service.test.ts) -------------

/** Blank copy in every locale — what a preset with no description seeds from. */
export const EMPTY_LOCALIZED: PresetLocalizedText = { en: "", vi: "", zh: "" };

/** Trim each locale; blanks stay blank rather than disappearing, so clearing a
 *  translation in the dialog actually clears it on the record. */
export function trimLocalized(text: PresetLocalizedText): PresetLocalizedText {
  return { en: text.en.trim(), vi: text.vi.trim(), zh: text.zh.trim() };
}

/** Auto-suggested slug for a new category: "Neon Noir!" → "neon-noir". */
export function slugifyCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Admin-write errors as a translated sentence (the Products `describeError`
 * convention). 404/405 means the admin route is not deployed on this backend
 * yet — the page feature-detects per action instead of pre-probing, the same
 * philosophy as `deriveTopicsFromCatalog`.
 */
export function describeFlowAdminError(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof FlowApiError) {
    if (error.status === 401 || error.status === 403) {
      return t("appChat.flowAdmin.errors.forbidden");
    }
    if (error.status === 404 || error.status === 405) {
      return t("appChat.flowAdmin.errors.apiUnavailable");
    }
    if (error.status === 409) {
      // The backend emits `flow_category_in_use`; the bare spelling was what this
      // check looked for originally, so the specific copy never rendered. Both
      // are accepted rather than swapped, in case a deployment is still on the
      // older wording.
      if (error.code === "category_in_use" || error.code === "flow_category_in_use") {
        return t("appChat.flowAdmin.categories.inUse");
      }
      // An industry refuses deletion for two different reasons — presets still
      // carry it, or children still sit under it — and only the server knows
      // which, so its message is shown verbatim.
      if (error.code === "flow_industry_in_use") {
        return error.message || t("appChat.flowAdmin.industries.inUse");
      }
      if (error.code === "flow_preset_slug_taken") {
        return t("appChat.flowAdmin.errors.slugTaken");
      }
      return t("appChat.flowAdmin.errors.conflict");
    }
    // A drop the taxonomy cannot hold (a third level, a cycle). The server names
    // the offending row, which is more use than a generic "invalid".
    if (error.status === 400 && error.code === "flow_industry_invalid_parent") {
      return error.message || t("appChat.flowAdmin.industries.invalidParent");
    }
    if (error.message && error.message !== error.code) return error.message;
  }
  return t("appChat.flowAdmin.errors.generic");
}

export type { FlowPagination };
