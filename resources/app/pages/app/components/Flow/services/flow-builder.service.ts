import { cdpApiConfig } from "@/config/cdp-api";
import { buildCdpHeaders, cdpFetch } from "@/lib/ai-agent/cluega-session-auth";

// Frontend client for the Workflow Builder API (see
// .claude/skills/cdp-workflow/SKILL.md). All traffic goes through the CDP
// gateway with the shared Bearer token + X-Team-Id headers; tenant/user are
// derived server-side from the JWT. Every success is wrapped in `{ data }`
// (list responses add `pagination`); every error in `{ error }`.
const FLOW_PREFIX = "/api/v1/flow-builder";

// Gateway-relative path — `requestFlowApi` prepends the host.
function flowUrl(path: string): string {
  return `${FLOW_PREFIX}${path}`;
}

// --- Types (mirror the API data models) -------------------------------------

export type FlowProjectStatus = "draft" | "published" | "archived";

/** General access: "restricted" (private, the default) or "public" (anyone
 *  with the link can view, read-only, no login). */
export type FlowVisibility = "restricted" | "public";

/** What a project cover url points at; the backend never sniffs it from the url. */
export type FlowProjectCoverType = "image" | "video";

export interface FlowProject {
  id: string;
  name: string;
  status: FlowProjectStatus;
  /** Share state; rows older than the field read as "restricted". */
  visibility?: FlowVisibility;
  /** Cover: the backend's pick of the graph's last image/video node; absent when none. */
  thumbnail_url?: string;
  thumbnail_type?: FlowProjectCoverType;
  created_by?: string;
  /**
   * The creator's star. Always present in list/get/create/update/duplicate
   * responses (never omitted); rows older than the field read as `false`.
   * Creator-only to change — see lib/flow/flowFavorites.ts.
   */
  favorite: boolean;
  asset_count: number;
  credit_used: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface FlowPagination {
  page_no: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface FlowPosition {
  x: number;
  y: number;
}
export interface FlowSize {
  width: number;
  height: number;
}
export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FlowNode {
  id: string;
  type?: string;
  position: FlowPosition;
  config?: Record<string, unknown>;
  asset_ref?: string;
  prompt?: string;
  output?: string;
  parent_group?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
  metadata?: Record<string, unknown>;
}

export interface FlowGroup {
  id: string;
  title?: string;
  color?: string;
  position: FlowPosition;
  size: FlowSize;
  member_node_ids?: string[];
  /** Folded to its port card in the editor; `size` stays the expanded frame. */
  collapsed?: boolean;
}

export interface FlowDocument {
  id: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  viewport: FlowViewport;
  global_config?: Record<string, unknown>;
  updated_at: string;
}

// --- List params & error ----------------------------------------------------

export type FlowSortField = "updated_at" | "created_at" | "name";
export type FlowSortOrder = "asc" | "desc";

export interface ListProjectsParams {
  page_no?: number;
  limit?: number;
  status?: FlowProjectStatus;
  /** Case-insensitive substring filter on project name ("find by name"). */
  name?: string;
  sort?: FlowSortField;
  order?: FlowSortOrder;
  /**
   * `true` → only starred projects; `false` → only unstarred ones (legacy rows
   * without the field included); omitted → everything.
   */
  favorite?: boolean;
  signal?: AbortSignal;
}

export interface ListProjectsResult {
  items: FlowProject[];
  pagination: FlowPagination;
}

/** Error carrying the backend `code` (e.g. `flow_project_not_found`) so callers
 *  can branch on it — 404 vs 409 vs validation. */
export class FlowApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The envelope's `error.details`, when a code carries structured context
   *  (`flow_run_unsupported_node` → `{ node_id, node_type }`). */
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message || code || `flow_request_failed_${status}`);
    this.name = "FlowApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface FlowEnvelope<T> {
  data: T;
  pagination?: FlowPagination;
}

/**
 * Request/envelope plumbing shared by the flow APIs behind the CDP gateway —
 * the builder (this file) and the preset catalog (`flow-presets.service.ts`).
 * `path` is absolute from the gateway root, e.g. `/api/v1/flow-presets`.
 * Auth, the 401 refresh-and-retry and the login redirect all live in `cdpFetch`.
 */
export async function requestFlowApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<FlowEnvelope<T>> {
  const headers = buildCdpHeaders(
    init.body != null ? { "Content-Type": "application/json" } : undefined,
  );
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...((init.headers as Record<string, string>) ?? {}) },
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    const err = (
      json as { error?: { code?: string; message?: string; details?: unknown } } | undefined
    )?.error;
    throw new FlowApiError(res.status, err?.code ?? "", err?.message ?? "", err?.details);
  }

  return (json ?? { data: undefined }) as FlowEnvelope<T>;
}

const request = <T,>(path: string, init: RequestInit = {}) =>
  requestFlowApi<T>(flowUrl(path), init);

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// --- Endpoints --------------------------------------------------------------

/**
 * The query string of `GET /projects`. Exported for the tests: `favorite` is
 * parsed with strconv.ParseBool server-side, so it must be spelled "true" /
 * "false" and must be ABSENT (not "false") when the caller did not filter.
 */
export function buildListProjectsQuery(
  params: Omit<ListProjectsParams, "signal">,
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("page_no", String(params.page_no ?? 1));
  query.set("limit", String(params.limit ?? 20));
  if (params.status) query.set("status", params.status);
  const name = params.name?.trim();
  if (name) query.set("name", name);
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  if (params.favorite !== undefined) query.set("favorite", String(params.favorite));
  return query;
}

/** 2. List project cards (paginated, no graph). */
export async function listProjects(
  params: ListProjectsParams = {},
): Promise<ListProjectsResult> {
  const query = buildListProjectsQuery(params);

  const envelope = await request<FlowProject[]>(`/projects?${query.toString()}`, {
    signal: params.signal,
  });

  return {
    items: envelope.data ?? [],
    pagination: envelope.pagination ?? {
      page_no: params.page_no ?? 1,
      limit: params.limit ?? 20,
      total_items: envelope.data?.length ?? 0,
      total_pages: 1,
    },
  };
}

/** 1. Create a project (+ empty document). */
export async function createProject(name: string): Promise<FlowProject> {
  const envelope = await request<FlowProject>(`/projects`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return envelope.data;
}

/** 3. Deep-copy a project + its graph. */
export async function duplicateProject(id: string): Promise<FlowProject> {
  const envelope = await request<FlowProject>(
    `/projects/${encodeURIComponent(id)}/duplicate`,
    { method: "POST" },
  );
  return envelope.data;
}

/** 4. Get one project's metadata. */
export async function getProject(id: string): Promise<FlowProject> {
  const envelope = await request<FlowProject>(
    `/projects/${encodeURIComponent(id)}`,
  );
  return envelope.data;
}

/**
 * What `PATCH /projects/:id` accepts — every field optional. `favorite` is
 * creator-only: a non-creator sending it (even alongside a rename) gets a
 * `403 forbidden` and NOTHING in the patch is applied.
 */
export interface UpdateProjectPatch {
  name?: string;
  status?: FlowProjectStatus;
  favorite?: boolean;
}

/** 5. Rename / change status / star. */
export async function updateProject(
  id: string,
  patch: UpdateProjectPatch,
): Promise<FlowProject> {
  const envelope = await request<FlowProject>(
    `/projects/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return envelope.data;
}

/**
 * 5b. Star / unstar a project (`PATCH /projects/:id { favorite }`).
 *
 * Returns the canonical card. The server does NOT bump `updated_at` for this,
 * so a list sorted by updated_at keeps its order — patch the row in place from
 * the response rather than refetching. Creator-only (403 for anyone else; see
 * `canToggleFlowFavorite`), and a duplicate always starts unstarred.
 */
export async function setProjectFavorite(
  id: string,
  favorite: boolean,
): Promise<FlowProject> {
  return updateProject(id, { favorite });
}

/**
 * The owner-side share state. `url` is present only when the project is public
 * AND the server has a share base URL configured; otherwise the frontend mints
 * the link from its own origin (the link path is `/workflow/:id`).
 */
export interface FlowShare {
  visibility: FlowVisibility;
  url?: string;
}

/** 6b. Read a project's share state (`GET /projects/:id/share`). */
export async function getShare(id: string): Promise<FlowShare> {
  const envelope = await request<FlowShare>(
    `/projects/${encodeURIComponent(id)}/share`,
  );
  return envelope.data;
}

/**
 * 6c. Set a project's share visibility (`PUT /projects/:id/share`).
 * Creator-only, like favoriting — anyone else gets a `403 forbidden`.
 */
export async function setShareVisibility(
  id: string,
  visibility: FlowVisibility,
): Promise<FlowShare> {
  const envelope = await request<FlowShare>(
    `/projects/${encodeURIComponent(id)}/share`,
    { method: "PUT", body: JSON.stringify({ visibility }) },
  );
  return envelope.data;
}

// --- Public share view (anonymous) -------------------------------------------
//
// Data source of the read-only viewer at `/share/workflow/:id`. Plain `fetch`,
// NOT `cdpFetch`: these routes take no JWT, and the 401 refresh + login
// redirect would bounce an anonymous visitor — or a signed-in user of another
// tenant — away from a page that needs no session at all. Every dead end
// (unknown id, restricted or deleted project) is a `404 share_not_found`,
// indistinguishable on purpose.

const PUBLIC_FLOW_PREFIX = "/api/v1/public/flow-builder";

/** One page-switcher entry of the anonymous view — no version, no owner fields. */
export interface PublicFlowPage {
  id: string;
  name: string;
  order: number;
  node_count: number;
  thumbnail_url?: string;
  updated_at: string;
}

/** The anonymous view of a shared project: the card plus the page switcher. */
export interface PublicFlowProject {
  id: string;
  name: string;
  thumbnail_url?: string;
  page_count: number;
  updated_at: string;
  pages: PublicFlowPage[];
}

async function requestPublicFlowApi<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${cdpApiConfig.baseUrl}${PUBLIC_FLOW_PREFIX}${path}`, {
    cache: "no-store",
    signal,
  });
  const text = await res.text();
  const json = text ? safeJsonParse(text) : undefined;
  if (!res.ok) {
    const err = (
      json as { error?: { code?: string; message?: string } } | undefined
    )?.error;
    throw new FlowApiError(res.status, err?.code ?? "", err?.message ?? "");
  }
  return (json as FlowEnvelope<T>).data;
}

/** Anonymous card + pages of a "public" project. */
export async function getPublicProject(
  id: string,
  signal?: AbortSignal,
): Promise<PublicFlowProject> {
  return requestPublicFlowApi<PublicFlowProject>(
    `/projects/${encodeURIComponent(id)}`,
    signal,
  );
}

/** Anonymous read-only graph of one page of a "public" project. */
export async function getPublicPageDocument(
  id: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<FlowDocument> {
  return requestPublicFlowApi<FlowDocument>(
    `/projects/${encodeURIComponent(id)}/pages/${encodeURIComponent(pageId)}/document`,
    signal,
  );
}

/** 7. Delete a project + document. */
export async function deleteProject(
  id: string,
): Promise<{ deleted: boolean; id: string }> {
  const envelope = await request<{ deleted: boolean; id: string }>(
    `/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return envelope.data;
}

/** 8. Load the full graph (the "workflow detail by id"). */
export async function getDocument(id: string): Promise<FlowDocument> {
  const envelope = await request<FlowDocument>(
    `/projects/${encodeURIComponent(id)}/document`,
  );
  return envelope.data;
}

/** 9. Save the full graph (autosave, optimistic-lock on `expected_version`). */
export async function saveDocument(
  id: string,
  graph: Omit<FlowDocument, "id" | "version" | "updated_at">,
  expectedVersion: number,
): Promise<{ version: number; updated_at: string }> {
  const envelope = await request<{ version: number; updated_at: string }>(
    `/projects/${encodeURIComponent(id)}/document`,
    {
      method: "PUT",
      body: JSON.stringify({ expected_version: expectedVersion, ...graph }),
    },
  );
  return envelope.data;
}

// --- Pages (a project split across several canvases) ------------------------
//
// A project owns an ordered list of pages, and each page owns its own document
// — the graph the editor renders. `/projects/:id/document` stays the legacy
// single-canvas route: a project created before pages, or a backend without
// them, returns an empty page list and keeps using it (see `useWorkflowPages`).
//
// Only the routes the editor actually needs are wired here. The backend also
// has `POST /pages/:page_id/duplicate` and `GET /pages/:page_id`; the first is
// deferred (duplicate is done client-side, see `useWorkflowPages`) and the
// second is redundant with the list.

export interface FlowPage {
  id: string;
  name: string;
  /** Display order within the project; the list is already returned sorted. */
  sort_order?: number;
  /** The page document's optimistic-lock counter, when the list carries it. */
  version?: number;
  /** Nodes in the page's last saved document. */
  node_count?: number;
  created_at?: string;
  updated_at?: string;
}

/** 10. List a project's pages, in display order. */
export async function listPages(
  projectId: string,
  signal?: AbortSignal,
): Promise<FlowPage[]> {
  const envelope = await request<FlowPage[]>(
    `/projects/${encodeURIComponent(projectId)}/pages`,
    { signal },
  );
  return envelope.data ?? [];
}

/** 11. Create a page (+ its empty document) and return the new row. */
export async function createPage(
  projectId: string,
  name: string,
): Promise<FlowPage> {
  const envelope = await request<FlowPage>(
    `/projects/${encodeURIComponent(projectId)}/pages`,
    { method: "POST", body: JSON.stringify({ name }) },
  );
  return envelope.data;
}

/** 12. Rename a page (the other half of "edit a page"). */
export async function renamePage(
  projectId: string,
  pageId: string,
  name: string,
): Promise<FlowPage> {
  const envelope = await request<FlowPage>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
  return envelope.data;
}

/** 13. Delete a page + its document. */
export async function deletePage(
  projectId: string,
  pageId: string,
): Promise<{ deleted: boolean; id: string }> {
  const envelope = await request<{ deleted: boolean; id: string }>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
    { method: "DELETE" },
  );
  return envelope.data;
}

/**
 * 14. Rewrite the page order (the Content drawer's drag-to-reorder).
 *
 * `pageIds` must be the COMPLETE current list in the new order: the backend
 * refuses a partial one, because only a whole-list rewrite is idempotent and
 * therefore safe for the client to retry after a timeout. Returns the list as
 * the server now holds it, already sorted — adopt it rather than the optimistic
 * order.
 */
export async function reorderPages(
  projectId: string,
  pageIds: string[],
): Promise<FlowPage[]> {
  const envelope = await request<FlowPage[]>(
    `/projects/${encodeURIComponent(projectId)}/pages/reorder`,
    { method: "PUT", body: JSON.stringify({ page_ids: pageIds }) },
  );
  return envelope.data ?? [];
}

/** 15. Load one page's graph — the multi-page form of `getDocument`. */
export async function getPageDocument(
  projectId: string,
  pageId: string,
): Promise<FlowDocument> {
  const envelope = await request<FlowDocument>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/document`,
  );
  return envelope.data;
}

/** 16. Save one page's graph (autosave; same optimistic lock as the project). */
export async function savePageDocument(
  projectId: string,
  pageId: string,
  graph: Omit<FlowDocument, "id" | "version" | "updated_at">,
  expectedVersion: number,
): Promise<{ version: number; updated_at: string }> {
  const envelope = await request<{ version: number; updated_at: string }>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/document`,
    {
      method: "PUT",
      body: JSON.stringify({ expected_version: expectedVersion, ...graph }),
    },
  );
  return envelope.data;
}

// --- Version history (one snapshot per autosave that changed the graph) ------

/** One row of a page's version list; the graph itself comes from `getDocumentVersion`. */
export interface FlowDocumentVersionMeta {
  version: number;
  page_id: string;
  saved_at: string;
  saved_by?: string;
  node_count: number;
  edge_count: number;
}

/** A full snapshot. `version` is a label here, never an `expected_version` lock value. */
export interface FlowDocumentVersion extends FlowDocumentVersionMeta {
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  viewport: FlowViewport;
  global_config?: Record<string, unknown>;
}

/** Versions path of a page, or of the legacy project document when there are no pages. */
function versionsPath(projectId: string, pageId?: string): string {
  const project = `/projects/${encodeURIComponent(projectId)}`;
  return pageId
    ? `${project}/pages/${encodeURIComponent(pageId)}/versions`
    : `${project}/document/versions`;
}

/** 17. List the kept versions of a page, newest first. */
export async function listDocumentVersions(
  projectId: string,
  pageId?: string,
  signal?: AbortSignal,
): Promise<FlowDocumentVersionMeta[]> {
  const envelope = await request<FlowDocumentVersionMeta[]>(
    versionsPath(projectId, pageId),
    { signal },
  );
  return envelope.data ?? [];
}

/** 18. Load one version's full graph. */
export async function getDocumentVersion(
  projectId: string,
  pageId: string | undefined,
  version: number,
): Promise<FlowDocumentVersion> {
  const envelope = await request<FlowDocumentVersion>(
    `${versionsPath(projectId, pageId)}/${version}`,
  );
  return envelope.data;
}

/** 18b. Delete one kept version; the page's newest (its "Current") is refused with a 409. */
export async function deleteDocumentVersion(
  projectId: string,
  pageId: string | undefined,
  version: number,
): Promise<{ deleted: boolean; version: number }> {
  const envelope = await request<{ deleted: boolean; version: number }>(
    `${versionsPath(projectId, pageId)}/${version}`,
    { method: "DELETE" },
  );
  return envelope.data;
}

// --- Variables (reusable project media / text, placed as canvas nodes) ------

export type FlowVariableKind = "image" | "video" | "audio" | "text";

/** One media file of a variable — a snapshot of the library row it was picked from. */
export interface FlowVariableItem {
  asset_id?: string;
  url: string;
  thumbnail_url?: string;
  mime_type?: string;
  title?: string;
}

export interface FlowVariable {
  id: string;
  project_id: string;
  /** Free text, not unique; the backend defaults a blank one to "Untitled Variable". */
  name: string;
  kind: FlowVariableKind;
  /** Media files of an image / video / audio variable; `[]` for text. */
  items: FlowVariableItem[];
  text?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFlowVariableInput {
  name?: string;
  kind: FlowVariableKind;
  items?: FlowVariableItem[];
  text?: string;
}

function variablesPath(projectId: string, variableId?: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}/variables`;
  return variableId ? `${base}/${encodeURIComponent(variableId)}` : base;
}

/** 19. List a project's variables, oldest first. */
export async function listVariables(
  projectId: string,
  signal?: AbortSignal,
): Promise<FlowVariable[]> {
  const envelope = await request<FlowVariable[]>(variablesPath(projectId), { signal });
  return envelope.data ?? [];
}

/** 20. Create a variable from picked library files, or from text. */
export async function createVariable(
  projectId: string,
  input: CreateFlowVariableInput,
): Promise<FlowVariable> {
  const envelope = await request<FlowVariable>(variablesPath(projectId), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return envelope.data;
}

/** 21. Rename a variable — the only edit after create; its content and kind are fixed. */
export async function renameVariable(
  projectId: string,
  variableId: string,
  name: string,
): Promise<FlowVariable> {
  const envelope = await request<FlowVariable>(variablesPath(projectId, variableId), {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return envelope.data;
}

/** 22. Delete a variable. Nodes already placed from it keep their own copy. */
export async function deleteVariable(
  projectId: string,
  variableId: string,
): Promise<{ deleted: boolean; id: string }> {
  const envelope = await request<{ deleted: boolean; id: string }>(
    variablesPath(projectId, variableId),
    { method: "DELETE" },
  );
  return envelope.data;
}

// --- Flow jobs (the per-page job ledger) -------------------------------------
//
// The ledger records which media jobs a page is waiting on — job id, the node
// that placed it, and whether the result has been drawn onto the canvas — so a
// reload mid-render no longer loses the job (see docs/flow-jobs-api.md in the
// workflow repo). The gateway seeds a row itself when `POST /media/jobs`
// carries `page_id`/`node_id` at the top level, and writes `status` + `outputs`
// into it on every poll that passes through — `outputs`, `created_at` and
// `updated_at` are therefore SERVER fields; anything the client sends for them
// is ignored.

/** Job lifecycle in the ledger — media-ai's `status` vocabulary, never `state`. */
export type FlowJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "stopped";

/** `succeeded` / `failed` / `stopped` — rows a full-sync PUT may prune.
 *  `stopped` is terminal but NOT a failure: a cancelled job keeps (and bills)
 *  every artifact finished before the cancel landed, so it may carry outputs. */
export function isTerminalFlowJobStatus(status: FlowJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "stopped";
}

/** `audio` is a Voice / Music / Sound Effects track: polled like an image, stored like a clip. */
export type FlowJobKind = "image" | "video" | "audio";

/** One finished artifact, written into the row by the gateway on poll. */
export interface FlowAssetRef {
  source?: string;
  id?: string;
  url: string;
  meta?: Record<string, unknown>;
}

export interface FlowJob {
  /** media-ai's job id — the ledger's upsert key. */
  job_id: string;
  /** Sibling jobs born from one submit (video `n>1` fan-out) share it. */
  group_id?: string;
  /** The canvas node that placed the job — the one thread back to the graph. */
  node_id: string;
  /** Which submit on that node this was (0,1,2…) — decides the active slot. */
  seq: number;
  kind: FlowJobKind;
  status: FlowJobStatus;
  /** Set once the result has been drawn into the graph document. SHARED across
   *  devices (the graph is shared too); set/update only, never cleared. */
  applied_at?: string;
  /** Echo of the submitted payload, so Retry needn't re-read the graph. */
  request?: Record<string, unknown>;
  /** SERVER field — written by the gateway, ignored when the client sends it. */
  outputs?: FlowAssetRef[];
  /** SERVER field — the job was stopped with `discard_outputs`: billed, but
   *  nothing it made may be drawn, even an output the row still lists. */
  discarded?: boolean;
  error?: string;
  /** SERVER field. */
  created_at?: string;
  /** SERVER field. */
  updated_at?: string;
}

/** What a full-sync PUT may carry — the server-owned fields are cut at the
 *  type so nobody mistakes sending them for writing them. */
export type FlowJobWrite = Omit<
  FlowJob,
  "outputs" | "discarded" | "created_at" | "updated_at"
>;

/** Server cap on rows per body; beyond it the PUT is a 400 and nothing is
 *  written. Pruning below it is the client's job. */
export const MAX_FLOW_JOBS_PER_PAGE = 200;

/**
 * 16. Read the ledger — the rehydrate call, fired the moment a page opens.
 * A page with no ledger (or an unknown page id) answers `200` with an empty
 * list, never a 404 — the rehydrate path must not throw at the editor. This
 * call is also when the server's reaper runs: a non-terminal row untouched for
 * 20 minutes comes back `stopped`, which may differ from the client's last
 * write — that is correct, not a bug.
 */
export async function listPageJobs(
  projectId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<FlowJob[]> {
  const envelope = await request<{ jobs: FlowJob[] }>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/jobs`,
    { signal },
  );
  return envelope.data?.jobs ?? [];
}

/**
 * 17. Write the ledger — an idempotent full sync: the body is the ENTIRE set
 * of jobs the ledger should hold. Returns the canonical ledger read back;
 * treat THAT as the truth, not the body just sent — the server coerces unknown
 * enums, keeps `succeeded`/`failed`/`stopped` from regressing to non-terminal,
 * and refuses to delete a non-terminal row that is merely missing from the
 * body (cancel first, prune after).
 */
export async function syncPageJobs(
  projectId: string,
  pageId: string,
  jobs: FlowJobWrite[],
): Promise<FlowJob[]> {
  if (jobs.length > MAX_FLOW_JOBS_PER_PAGE) {
    throw new FlowApiError(
      400,
      "invalid_argument",
      `flow job sync exceeds ${MAX_FLOW_JOBS_PER_PAGE} rows; prune first`,
    );
  }
  const envelope = await request<{ jobs: FlowJob[] }>(
    `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/jobs`,
    { method: "PUT", body: JSON.stringify({ jobs }) },
  );
  return envelope.data?.jobs ?? [];
}
