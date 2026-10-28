/**
 * Wire contract for the CDP **unified media library**
 * (`GET /api/v1/media/library`) — see BACKEND_CLUEGA_CDP/docs/media-library-api.md.
 *
 * Pure: types, query-string building, row normalization and the error shapes.
 * The transport lives in `./api` (which needs `mediaFetch`, and with it the
 * browser session), so keeping this half free of that import makes the mapping
 * rules directly unit-testable.
 *
 * The library is the deduplicated union of every tenant media store, so both
 * media surfaces render the same rows:
 *
 *   - `artifact` → media_ai_artifacts (AI output + workflow uploads)
 *   - `object`   → media_objects      (Knowledge Base uploads)
 *   - `creative` → creatives          (AI creatives catalog)
 *   - `page`     → page_publication   (published web pages; `row_id` is the
 *                                      document id, `url` is the /p/… link)
 */

/** Which backing store a row came from. Drives delete + download routing. */
export type LibraryOrigin = "artifact" | "object" | "creative" | "page";

/** Upload class a row is bucketed under — the two tabs both surfaces show. */
export type LibraryBucket = "ai_upload" | "user_upload";

/** Media category filter (resolved server-side from mime + file extension). */
export type LibraryMediaFilter =
  | "all"
  | "image"
  | "video"
  | "audio"
  | "document";

/** The concrete category a row was classified as. */
export type LibraryMediaType =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "page"
  | "other";

/** One row of the unified library, as returned by the backend. */
export interface MediaLibraryItem {
  /** Origin-prefixed stable id ("artifact:…", "object:…", "creative:…"). */
  key: string;
  origin: LibraryOrigin;
  /** media-ai artifact id (a ULID). Present on artifacts, and on objects that
   *  were ingested as one. Used for delete + the CORS-safe download proxy. */
  artifactId?: string;
  /** Object-store path. Present on `object` rows; the delete handle. */
  objectPath?: string;
  /** The row's own primary key (`row_id` on the wire). Optional — a row without
   *  one cannot be used by anything that needs to STORE a reference to it. */
  rowId?: string;
  /** The Material Center card an `object` row was mirrored into (`asset_id` on
   *  the wire). It is the handle `DELETE /api/v1/assets/:id` moves to the
   *  recycle bin, which is how a discarded file can still be restored. Absent on
   *  every other origin, and on an object row the mirror never filed; a caller
   *  that must be undoable refuses such a row rather than hard-deleting it. The
   *  listing leaves out an object row whose card is in the bin. */
  assetId?: string;
  creativeId?: string;
  /** Storage file id. Present on `creative` rows — the only rows whose URL can
   *  expire, so the only ones needing a client-side re-resolve. */
  fileId?: string;
  fileName: string;
  /** Resolved by the backend. Empty when the file could not be resolved. */
  url: string;
  contentType: string;
  mediaType: LibraryMediaType;
  /** Normalized bucket — which tab this shows under. */
  typeUpload: LibraryBucket;
  workflowId?: string;
  /** Chat session that produced the row. Present on artifacts generated in a
   *  conversation, absent on the creatives catalog — which is what lets the
   *  picker tell "Generation history" rows from plain catalog rows inside the
   *  single `ai_upload` bucket. */
  conversationId?: string;
  /** Generating prompt, folded on from the creatives catalog when deduped. */
  prompt?: string;
  /** False when no delete endpoint exists for this row (a creative with no
   *  mirrored artifact). */
  deletable: boolean;
  size: number;
  createdAt: string;
}

export interface LibraryPagination {
  page_no: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface ListLibraryParams {
  /** Which bucket to load. Omitted means both (the "All" tab). */
  bucket?: LibraryBucket;
  /** Free-text search (backend searches file names, artifact ids and prompts). */
  q?: string;
  /** Category filter. `all` (or omitted) applies no category filter. */
  mediaType?: LibraryMediaFilter;
  /** The workflow project to narrow to. Only used with `scope: "workflow"`. */
  workflowId?: string;
  /** `"all"` (default) lists the whole tenant; `"workflow"` narrows to one
   *  project (only artifacts carry a workflow id). */
  scope?: "all" | "workflow";
  /** Keep only rows linked to *some* workflow (`has_workflow=true`). Like
   *  `scope: "workflow"` this can only match artifact rows, so the object
   *  store and the creatives catalog drop out. */
  hasWorkflow?: boolean;
  /** Keep only rows generated in *some* chat session (`has_conversation=true`).
   *  Artifact rows only — no other source carries a conversation id. */
  hasConversation?: boolean;
  /** Keep only rows from THIS chat session — an equality filter, unlike
   *  `hasConversation`'s *has any*. Sent only when non-empty. */
  conversationId?: string;
  /** Restrict to these origins (`sources=page` lists published pages). */
  sources?: LibraryOrigin[];
  page_no?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface ListLibraryResult {
  items: MediaLibraryItem[];
  pagination: LibraryPagination;
}

/** Raw wire shape — snake_case, exactly as documented. */
export interface LibraryItemPayload {
  id?: string;
  origin?: string;
  artifact_id?: string;
  object_path?: string;
  creative_id?: string;
  file_id?: string;
  row_id?: string;
  asset_id?: string;
  file_name?: string;
  url?: string;
  content_type?: string;
  media_type?: string;
  type_upload?: string;
  workflow_id?: string;
  conversation_id?: string;
  prompt?: string;
  deletable?: boolean;
  size?: number;
  created_at?: string;
}

export interface LibraryEnvelope {
  data?: { items?: LibraryItemPayload[] };
  pagination?: LibraryPagination;
  error?: { code?: string; message?: string };
}

/**
 * Error carrying the backend `code` and HTTP `status` so callers can branch — a
 * `404 not_found` means the library endpoint isn't deployed yet, a `400
 * invalid_argument` means a bad filter value.
 */
export class MediaLibraryError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message || code || `media_library_request_failed_${status}`);
    this.name = "MediaLibraryError";
    this.status = status;
    this.code = code;
  }
}

/** Thrown when a row has no delete endpoint (a creative with no artifact). */
export class NotDeletableError extends Error {
  // Written out rather than a constructor parameter property: this module is
  // loaded by `node --test`'s type-strip mode, which rejects those.
  readonly item: MediaLibraryItem;
  constructor(item: MediaLibraryItem) {
    super(`${item.origin} ${item.key} cannot be deleted`);
    this.name = "NotDeletableError";
    this.item = item;
  }
}

/** Default page size. The endpoint clamps to 100. */
export const DEFAULT_LIBRARY_LIMIT = 24;

const MEDIA_TYPES: LibraryMediaType[] = [
  "image",
  "video",
  "audio",
  "document",
  "page",
  "other",
];

/** Serialize list params. `media_type: all` is omitted so the backend applies no
 *  category filter, `workflow_id` is only sent with `scope=workflow` (alone it
 *  would be ignored), and the `has_*` flags are only sent when true — false is
 *  the backend's default, and an explicit `has_workflow=false` would read as a
 *  filter it is not. */
export function buildLibraryQuery(params: ListLibraryParams): string {
  const query = new URLSearchParams({
    page_no: String(params.page_no ?? 1),
    limit: String(params.limit ?? DEFAULT_LIBRARY_LIMIT),
  });
  const q = params.q?.trim();
  if (q) query.set("q", q);
  if (params.bucket) query.set("type_upload", params.bucket);
  if (params.mediaType && params.mediaType !== "all") {
    query.set("media_type", params.mediaType);
  }
  if (params.scope === "workflow" && params.workflowId) {
    query.set("scope", "workflow");
    query.set("workflow_id", params.workflowId);
  }
  if (params.hasWorkflow) query.set("has_workflow", "true");
  if (params.hasConversation) query.set("has_conversation", "true");
  const conversationId = params.conversationId?.trim();
  if (conversationId) query.set("conversation_id", conversationId);
  if (params.sources?.length) query.set("sources", params.sources.join(","));
  return query.toString();
}

function normalizeOrigin(value: string | undefined): LibraryOrigin {
  return value === "object" || value === "creative" || value === "page" ? value : "artifact";
}

function normalizeMediaType(value: string | undefined): LibraryMediaType {
  return MEDIA_TYPES.find((type) => type === value) ?? "other";
}

function normalizeBucket(value: string | undefined): LibraryBucket {
  return value === "user_upload" ? "user_upload" : "ai_upload";
}

/** Map one wire row onto the client shape, dropping empty optional strings so
 *  `item.artifactId ?? …` fallbacks behave. */
export function toLibraryItem(payload: LibraryItemPayload): MediaLibraryItem {
  const origin = normalizeOrigin(payload.origin);
  return {
    key: payload.id || `${origin}:${payload.artifact_id ?? payload.object_path ?? ""}`,
    origin,
    artifactId: payload.artifact_id || undefined,
    objectPath: payload.object_path || undefined,
    rowId: payload.row_id || undefined,
    assetId: payload.asset_id || undefined,
    creativeId: payload.creative_id || undefined,
    fileId: payload.file_id || undefined,
    fileName: payload.file_name ?? "",
    url: payload.url ?? "",
    contentType: payload.content_type ?? "",
    mediaType: normalizeMediaType(payload.media_type),
    typeUpload: normalizeBucket(payload.type_upload),
    workflowId: payload.workflow_id || undefined,
    conversationId: payload.conversation_id || undefined,
    prompt: payload.prompt || undefined,
    deletable: payload.deletable ?? origin !== "creative",
    size: payload.size ?? 0,
    createdAt: payload.created_at ?? "",
  };
}

/**
 * Rows the backend could not resolve a URL for are dropped rather than rendered
 * as broken cards — an unresolvable file is a catalog row whose bytes are gone.
 * A `creative` row is kept when it still has a `fileId`: deployments without a
 * storage resolver leave the URL blank, and the client can resolve it itself
 * (see lib/creatives/urlCache).
 */
export function isRenderableLibraryItem(item: MediaLibraryItem): boolean {
  return Boolean(item.url) || (item.origin === "creative" && Boolean(item.fileId));
}

/** Read the page out of the response envelope, synthesizing pagination for the
 *  rare case the backend omits it. */
export function readLibraryEnvelope(
  body: LibraryEnvelope | null,
  params: ListLibraryParams,
): ListLibraryResult {
  const items = (body?.data?.items ?? []).map(toLibraryItem).filter(isRenderableLibraryItem);
  return {
    items,
    pagination:
      body?.pagination ?? {
        page_no: params.page_no ?? 1,
        limit: params.limit ?? DEFAULT_LIBRARY_LIMIT,
        total_items: items.length,
        total_pages: items.length ? 1 : 0,
      },
  };
}

/**
 * Map the workflow panel's tab (`AssetSource`) onto the API bucket: "My
 * Creations" (AI-generated) → `ai_upload`, "Uploaded" → `user_upload`.
 */
export function bucketForSource(source: "creation" | "upload"): LibraryBucket {
  return source === "creation" ? "ai_upload" : "user_upload";
}

// Delete routing lives in ./deletePath; re-exported so `./wire` stays the one
// import site for the whole wire contract.
export { artifactDeletePath, deletePathFor } from "./deletePath";
