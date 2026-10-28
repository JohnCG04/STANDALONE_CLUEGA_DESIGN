/**
 * Client for the Material Center (資料庫 / 素材中心) routes.
 *
 * Mirrors BACKEND_CLUEGA_CDP/internal/adapter/http/handler/assets.go. The wire
 * shape is snake_case; this module is the only place that translates it, so
 * components only ever see camelCase.
 *
 * This replaces the three-store union behind /api/artifacts/media for the
 * All / Design / Files tabs: one query answers every category, both display
 * modes and the recycle bin, and it carries the source badge data the PRD
 * requires on every card.
 */

import { CdpApiError } from "@/lib/cdp/errors";
import { cdpApiConfig } from "@/config/cdp-api";
import { getCdpAccessToken } from "@/lib/cdp/session";
import { notifyAssetLibraryChanged } from "@/lib/assets/assetLibraryChannel";
import { cdpFetch } from "@/lib/cdp/fetch";
import { toSignedAccess, type RawSignedAccess, type SignedAccess } from "@/lib/cdp/signedAccess";

/**
 * What the asset is — six values, matching the seven-item dropdown (All + six
 * types) in PRD v1.6 §2.1. `ad_sheet` is a category of its own, not a document
 * (E-M11); the earlier v3.1 review had folded the two together.
 */
export type AssetCategory =
  | "design"
  | "video"
  | "ad_sheet"
  | "document"
  | "copy"
  | "product";

/** How it entered the library — the data behind the source badge (PRD §3.4). */
export type AssetSource = "upload" | "chat" | "workflow" | "bot";

/**
 * Who owns an asset or a folder: `personal` is the owner plus whoever its folder
 * was shared with, `enterprise` is the whole company (PRD v1.6 §3.4 — "mọi phân
 * loại đồng loạt hỗ trợ sở hữu cá nhân/công ty").
 *
 * The wire values are the Script Library's, because the backend stores both in
 * the same column vocabulary; the UI labels them "của tôi" / "công ty".
 */
export type AssetScope = "personal" | "enterprise";

/** Background processing state; each one renders as a different card. */
export type AssetStatus = "processing" | "ready" | "failed";

export type AssetSortField = "created_at" | "updated_at" | "name" | "size" | "used_count";

/**
 * Which half of the pipeline failed. Both wear the same failed card, but they
 * mean different things to the user: "ingest" is content that never entered the
 * library at all (§3.5 — it must still be visible, never silently dropped),
 * "processing" is content that is safely stored but has no thumbnail yet.
 */
export type AssetFailureStage = "ingest" | "processing";

export interface AssetFailure {
  stage: AssetFailureStage;
  /** Machine cause, e.g. quota_exceeded / invalid_argument / origin_unavailable. */
  code: string;
  /** The sentence the card shows. */
  message: string;
  /** Whether the card should offer "retry". */
  retryable: boolean;
}

/**
 * Where the asset came from. Which fields are filled depends on `source`, and
 * all of them can be empty: content produced before the AI service started
 * sending ids still belongs in the library, and renders with the badge but a
 * disabled jump button.
 */
export interface AssetSourceRef {
  conversationId?: string;
  messageId?: string;
  workflowId?: string;
  nodeId?: string;
  runId?: string;
  /** The Pulse Bot a bot-sourced file came from (LIB2-006). */
  botId?: string;
  /** The Pulse Channel that delivered a bot-sourced file; with `messageId`, what "Locate in task" opens. */
  groupId?: string;
}

export interface Asset {
  id: string;
  /**
   * The unified asset code (Core's Asset Registry: display code, e.g.
   * "GRB6PT21X") and the canonical id behind it ("crv_…"). Empty until the
   * workspace issues them, and for content that stays unregistered.
   */
  displayCode?: string;
  registryId?: string;
  /**
   * Why a row has no code that is not just "a few seconds": "intermediate" is
   * a workflow output fed into another node, given its code once the user
   * keeps it (PRD A3, {@link promoteAssetsForCode}).
   */
  registryHold?: "intermediate";
  category: AssetCategory;
  source: AssetSource;
  sourceRef: AssetSourceRef;
  name: string;
  description: string;
  fileUrl: string;
  /** 400px card image. Empty while the processing worker has not run. */
  thumbUrl: string;
  /**
   * Thumbnail set keyed by width: 40 (list), 400 (grid), 1200 (preview), plus
   * the non-numeric `preview` entry — the PDF an office document was converted
   * to, which is what makes a .docx viewable inline. Empty until the worker has
   * run, or permanently so where the deployment carries no converter.
   */
  thumbUrls: Record<string, string>;
  /**
   * The same file and pictures behind links that expire (LIB-166) — what the
   * Library's own screens load from. `fileUrl` / `thumbUrl` above stay the
   * references to hand on and store. Absent on a backend without signing.
   */
  access?: SignedAccess;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Parsed at ingest so a document card is readable without opening it. */
  title: string;
  summary: string;
  status: AssetStatus;
  /**
   * The backend still owes this asset a thumbnail, a duration or a parsed title.
   *
   * Separate from `status` because an upload is filed `ready` the moment its
   * bytes are stored — deliberately, so the card is usable at once — while its
   * thumbnail arrives seconds later. Watching `status` alone therefore never
   * re-checked an upload, and an empty document card sat there until something
   * else refreshed the list. Watching "no thumbnail" instead would never stop:
   * an audio file is filed as a document, cannot be rendered, and never gets one.
   * This is the backend's own answer (domain.Asset.AwaitsDerivative), and it goes
   * false as soon as it stops trying.
   */
  awaitingDerivative: boolean;
  /**
   * Chat or workflow output filed while the company was over its storage plan
   * (LIB-058). It says when the file was saved, not whether the company is over
   * now — the storage banner answers that. Absent reads as false.
   */
  overQuota?: boolean;
  /** Shown verbatim on a failed card. */
  failureReason: string;
  /**
   * Present on a failed asset, and on a ready one whose preview did not render
   * (stage "processing" — the file works, the card warns). `stage` tells the two failures apart:
   * "ingest" means the content never made it into the library (chat or workflow
   * output the backend could not file), "processing" means it is filed but a
   * thumbnail or preview could not be produced. `retryable` decides whether the
   * card offers a retry at all — a button that cannot work is worse than none.
   */
  failure?: AssetFailure;
  folderId: string;
  /** Set when the asset sits in a folder — cross-folder results say where. */
  folderName: string;
  /**
   * Personal or company ownership (§3.4). Rows written before the column existed
   * read back as "personal", which is the safe default: an asset nobody
   * classified must not present itself as company-wide.
   */
  scope: AssetScope;
  /**
   * Whether the signed-in user owns this asset. Resolved by the server, because
   * only it knows who is asking: the ownership transfer is the owner's (or an
   * admin's) call, so the control is drawn from this rather than from comparing
   * ids the client cannot learn.
   */
  isOwner: boolean;
  /**
   * Who put it in the library — the person who uploaded it, or whose chat or
   * workflow produced it (LIB-026). Not the owner: ownership can be handed to the
   * company, the author cannot change. Empty on a row that predates the column.
   */
  createdByUserId: string;
  /**
   * Whether *this* user starred it. A personal flag, not a property of the asset
   * (PRD v1.6 §3.3), and independent of folders — moving an asset never changes
   * it (§3.4).
   */
  isFavorite: boolean;
  parentId: string;
  version: number;
  metadata: Record<string, unknown>;
  usedCount: number;
  lastUsedAt: string;
  /**
   * The last open, preview, download, attachment, use or script link
   * (LIB2-017); empty until the first one, or from a server that predates it.
   * Optional so the many hand-built assets in other modules' code still type.
   */
  lastAccessedAt?: string;
  /**
   * Set while the asset is archived (LIB2-018): it keeps its place and its
   * folder, and stops counting toward storage until it is opened again.
   */
  archivedAt?: string;
  deletedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The company's storage allowance, in bytes (PRD v1.6 §3.4).
 *
 * Bytes at company level, not a per-user row count: v1.6 replaced "500 assets per
 * user" with "1TB per company, tính theo byte thực lưu". The recycle bin counts
 * towards it until the 30-day purge frees it, which is why the refusal copy tells
 * the user to empty it.
 */
/**
 * Where usage stands against the plan (Phase 2 storage rules, "Storage states"):
 * normal below 80%, alert 80–100%, overage past 100% with credits or auto
 * top-up, grace past 100% without them up to 110%, blocked past that, and
 * cancelled while a cancelled plan is read-only.
 */
export type StorageState = "normal" | "alert" | "overage" | "grace" | "blocked" | "cancelled";

export interface AssetQuota {
  usedBytes: number;
  totalBytes: number;
  /** Never negative — automatic ingest may push used past total. */
  remainingBytes: number;
  /** Manual uploads are refused from here on; automatic ingest still passes. */
  exceeded: boolean;
  /** ≥80% of the allowance: the banner appears from here (§3.4). */
  warning: boolean;
  /**
   * Past the overflow ceiling: chat and workflow output is no longer saved to
   * the Library either (LIB-058). Absent reads as false.
   */
  autoFull?: boolean;
  /** The storage state (LIB2-008). Absent from a server that predates it. */
  state?: StorageState;
  /** Usage as a share of the plan, one decimal, NOT clamped: it may pass 100. */
  percent?: number;
  /**
   * The most a write may take usage to, in bytes; 0 = no cap (credits left or
   * auto top-up on). Absent from an older server, which capped at the plan.
   */
  writeLimitBytes?: number;
  /**
   * Credits owed for storage overage the wallet could not cover (balance went
   * negative); taken from the next top-up. Absent from the list responses and
   * from an older server; read as 0.
   */
  pendingCredits?: number;
}

export interface ListAssetsResult {
  items: Asset[];
  /** Empty on the last page. */
  nextCursor: string;
  quota: AssetQuota;
}

export interface ListAssetsParams {
  category?: AssetCategory;
  /** One source, or several (sent comma-joined) — e.g. every AI origin at once. */
  source?: AssetSource | readonly AssetSource[];
  status?: AssetStatus;
  /** Matches name, title and summary. */
  q?: string;
  /** Everything one workflow run produced, across folders. */
  runId?: string;
  /**
   * Everything one workflow produced or ingested, across runs and folders —
   * uploads sent from its editor included (the mirror keeps workflow_id in
   * source_ref regardless of source).
   */
  workflowId?: string;
  /** Mime prefix, e.g. "image/" or "application/pdf". */
  format?: string;
  /**
   * The asset filed from this MEDIA-LIBRARY row — a media_ai_artifacts /
   * media_objects id, not an asset id. The one way to cross between the two id
   * spaces: a Script Library video link stores the media row id, while the
   * playable url lives on the asset the mirror filed from it.
   */
  mirrorRowId?: string;
  /**
   * "root" lists only unfiled assets (the All view's asset strip), a uuid lists
   * one folder, and leaving it out searches across folders — three different
   * questions a nullable id cannot express.
   */
  folder?: "root" | { id: string };
  dateFrom?: string;
  dateTo?: string;
  /** Switches to the recycle bin. */
  deleted?: boolean;
  /** Narrows to what this user starred. */
  favorite?: boolean;
  /** Narrows to archived items (LIB2-018). */
  archived?: boolean;
  /** Narrows to personal or company ownership — the "của tôi / công ty" split. */
  scope?: AssetScope;
  sort?: AssetSortField;
  order?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

interface RawAsset {
  id: string;
  display_code?: string;
  registry_id?: string;
  registry_hold?: string;
  category: AssetCategory;
  source: AssetSource;
  source_ref?: {
    conversation_id?: string;
    message_id?: string;
    workflow_id?: string;
    node_id?: string;
    run_id?: string;
    bot_id?: string;
    group_id?: string;
  };
  name: string;
  description?: string;
  file_url?: string;
  thumb_url?: string;
  thumb_urls?: Record<string, string>;
  access?: RawSignedAccess;
  mime_type?: string;
  size?: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  title?: string;
  summary?: string;
  awaiting_derivative?: boolean;
  over_quota?: boolean;
  status: AssetStatus;
  failure_reason?: string;
  failure?: {
    stage?: string;
    code?: string;
    message?: string;
    retryable?: boolean;
  };
  folder_id?: string;
  folder_name?: string;
  scope?: AssetScope;
  is_owner?: boolean;
  created_by_user_id?: string;
  is_favorite?: boolean;
  parent_id?: string;
  version?: number;
  metadata?: Record<string, unknown>;
  used_count?: number;
  last_used_at?: string;
  last_accessed_at?: string;
  archived_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

interface RawListAssets {
  items?: RawAsset[] | null;
  next_cursor?: string;
  quota?: {
    used_bytes?: number;
    total_bytes?: number;
    remaining_bytes?: number;
    exceeded?: boolean;
    warning?: boolean;
  };
}

/**
 * Reads the failure block, falling back for a backend that predates it.
 *
 * The fallback matters more than it looks: a failed card whose `failure` is
 * missing would render with no retry at all, so a deployment one version behind
 * would quietly lose the button. A failed asset with no block is therefore
 * treated as a retryable processing failure — the state this endpoint could
 * already produce before the ingest half existed.
 *
 * The block is read whatever the status says. A `ready` asset carries one when
 * its bytes stored cleanly but its preview did not render; gating on "failed"
 * threw that block away, so the card showed no warning and no retry even though
 * the server had recorded the reason (LIB-067 / BUG-741). Every reader of
 * `failure` checks the status itself, so this does not turn a ready card red.
 */
function toAssetFailure(raw: RawAsset): AssetFailure | undefined {
  if (!raw.failure && raw.status !== "failed") return undefined;
  const stage: AssetFailureStage = raw.failure?.stage === "ingest" ? "ingest" : "processing";
  return {
    stage,
    code: raw.failure?.code ?? "",
    message: raw.failure?.message || raw.failure_reason || "",
    retryable: raw.failure?.retryable ?? true,
  };
}

function toAsset(raw: RawAsset): Asset {
  return {
    id: raw.id,
    displayCode: raw.display_code || undefined,
    registryId: raw.registry_id || undefined,
    registryHold: raw.registry_hold === "intermediate" ? "intermediate" : undefined,
    category: raw.category,
    source: raw.source,
    sourceRef: {
      conversationId: raw.source_ref?.conversation_id,
      messageId: raw.source_ref?.message_id,
      workflowId: raw.source_ref?.workflow_id,
      nodeId: raw.source_ref?.node_id,
      runId: raw.source_ref?.run_id,
      botId: raw.source_ref?.bot_id,
      groupId: raw.source_ref?.group_id,
    },
    name: raw.name,
    description: raw.description ?? "",
    fileUrl: raw.file_url ?? "",
    thumbUrl: raw.thumb_url ?? "",
    thumbUrls: raw.thumb_urls ?? {},
    access: toSignedAccess(raw.access),
    mimeType: raw.mime_type ?? "",
    size: raw.size ?? 0,
    width: raw.width,
    height: raw.height,
    durationMs: raw.duration_ms,
    title: raw.title ?? "",
    summary: raw.summary ?? "",
    status: raw.status,
    // Defaults to false rather than true: a backend that does not send it is one
    // that predates the field, and assuming "work is coming" there would poll
    // every card on screen for the whole watch budget.
    awaitingDerivative: raw.awaiting_derivative ?? false,
    overQuota: raw.over_quota === true,
    failureReason: raw.failure_reason ?? "",
    failure: toAssetFailure(raw),
    folderId: raw.folder_id ?? "",
    folderName: raw.folder_name ?? "",
    scope: raw.scope ?? "personal",
    isOwner: raw.is_owner ?? false,
    createdByUserId: raw.created_by_user_id ?? "",
    isFavorite: raw.is_favorite ?? false,
    parentId: raw.parent_id ?? "",
    version: raw.version ?? 1,
    metadata: raw.metadata ?? {},
    usedCount: raw.used_count ?? 0,
    lastUsedAt: raw.last_used_at ?? "",
    lastAccessedAt: raw.last_accessed_at ?? "",
    archivedAt: raw.archived_at ?? "",
    deletedAt: raw.deleted_at ?? "",
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function folderParam(folder: ListAssetsParams["folder"]): string | undefined {
  if (folder === undefined) return undefined;
  return folder === "root" ? "root" : folder.id;
}

/** GET /api/v1/assets — one screen of the library plus the owner's quota. */
export async function listAssets(
  params: ListAssetsParams = {},
  signal?: AbortSignal,
): Promise<ListAssetsResult> {
  const data = await cdpFetch<RawListAssets>("/api/v1/assets", {
    auth: { kind: "auto" },
    signal,
    searchParams: {
      category: params.category,
      source: typeof params.source === "string" ? params.source : params.source?.join(","),
      status: params.status,
      q: params.q || undefined,
      run_id: params.runId || undefined,
      workflow_id: params.workflowId || undefined,
      format: params.format || undefined,
      mirror_row_id: params.mirrorRowId || undefined,
      folder_id: folderParam(params.folder),
      date_from: params.dateFrom || undefined,
      date_to: params.dateTo || undefined,
      deleted: params.deleted ? "true" : undefined,
      favorite: params.favorite ? "true" : undefined,
      archived: params.archived ? "true" : undefined,
      scope: params.scope,
      sort: params.sort,
      order: params.order,
      limit: params.limit,
      cursor: params.cursor || undefined,
    },
  });

  return {
    items: (data.items ?? []).map(toAsset),
    nextCursor: data.next_cursor ?? "",
    quota: toAssetQuota(data.quota),
  };
}

interface RawAssetQuota {
  used_bytes?: number;
  total_bytes?: number;
  remaining_bytes?: number;
  exceeded?: boolean;
  warning?: boolean;
  auto_full?: boolean;
  state?: string;
  percent?: number;
  write_limit_bytes?: number;
  pending_credits?: number;
}

const STORAGE_STATES: readonly StorageState[] = ["normal", "alert", "overage", "grace", "blocked", "cancelled"];

function toAssetQuota(raw: RawAssetQuota | undefined | null): AssetQuota {
  const quota: AssetQuota = {
    usedBytes: raw?.used_bytes ?? 0,
    totalBytes: raw?.total_bytes ?? 0,
    remainingBytes: raw?.remaining_bytes ?? 0,
    exceeded: raw?.exceeded ?? false,
    warning: raw?.warning ?? false,
    autoFull: raw?.auto_full === true,
  };
  // Each new field only when the server sent it, so an older server reads
  // exactly as it did before.
  if (STORAGE_STATES.includes(raw?.state as StorageState)) quota.state = raw?.state as StorageState;
  if (typeof raw?.percent === "number" && Number.isFinite(raw.percent)) quota.percent = raw.percent;
  if (typeof raw?.write_limit_bytes === "number" && raw.write_limit_bytes >= 0) {
    quota.writeLimitBytes = raw.write_limit_bytes;
  }
  if (typeof raw?.pending_credits === "number" && raw.pending_credits > 0) {
    quota.pendingCredits = Math.round(raw.pending_credits);
  }
  return quota;
}

/**
 * GET /api/v1/asset-library/storage — the company's allowance on its own.
 *
 * The same figures every list response carries. It exists because three of the
 * Library's eight categories draw their own content and never ask for an asset
 * list, so a header reading the list's copy had nothing to show on them.
 */
export async function getStorageQuota(signal?: AbortSignal): Promise<AssetQuota> {
  const raw = await cdpFetch<RawAssetQuota>("/api/v1/asset-library/storage", {
    auth: { kind: "auto" },
    signal,
  });
  return toAssetQuota(raw);
}

/**
 * Where an asset came from, once the backend has confirmed the origin still
 * exists and belongs to this user.
 *
 * Ids rather than a URL on purpose: the route that opens a workflow is the
 * frontend's own business, so the two sides can change independently.
 */
export interface AssetSourceLink {
  kind: AssetSource;
  conversationId: string;
  messageId: string;
  workflowId: string;
  nodeId: string;
  runId: string;
  /** The Pulse Bot to open (LIB2-006); "" for every other source. */
  botId: string;
  /** The Pulse Channel that delivered a bot's file; "" for a direct chat or an older backend. */
  groupId: string;
  /**
   * What the source is called — the conversation's title, the workflow's name
   * (§3.2). "" when it has none yet, or when the deployment's backend predates
   * the field; the badge then reads as its label alone rather than as a gap.
   *
   * It arrives here and not on the list row because the backend only hands it
   * over once it has confirmed the caller may open the source.
   */
  name: string;
  /**
   * `workflowId` is a catalog preset a tool run came out of, not a project
   * (LIB-018): it opens on the catalog's page, and `names` is its name per
   * locale. False against a backend that predates the field.
   */
  preset: boolean;
  names: Record<string, string>;
  /**
   * The node that produced the file: the name the person gave it, else its
   * type for the client to name. Both "" when unknown.
   */
  nodeLabel: string;
  nodeType: string;
}

/**
 * Why a source cannot be opened. Three states, because they call for three
 * different sentences: something was deleted, something belongs to someone else,
 * or there was never anything to open in the first place.
 */
export type AssetSourceProblem = "deleted" | "forbidden" | "unlinked";

interface RawSourceLink {
  kind?: string;
  conversation_id?: string;
  message_id?: string;
  workflow_id?: string;
  node_id?: string;
  run_id?: string;
  bot_id?: string;
  group_id?: string;
  name?: string;
  preset?: boolean;
  names?: unknown;
  node_label?: string;
  node_type?: string;
}

function stringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

/**
 * GET /api/v1/assets/:id/source-link — asked before the source badge navigates.
 *
 * The check has to happen server-side: only the backend can see whether the
 * conversation or workflow is still there and who owns it. Resolving on click
 * rather than stamping every row of the list keeps the check fresh and the list
 * query untouched — the trade is that the first click on a dead source is what
 * discovers it, which is why the caller downgrades the badge afterwards.
 */
export async function resolveAssetSource(
  id: string,
  signal?: AbortSignal,
): Promise<AssetSourceLink> {
  const raw = await cdpFetch<RawSourceLink>(
    `/api/v1/assets/${encodeURIComponent(id)}/source-link`,
    { auth: { kind: "auto" }, signal },
  );
  return {
    kind: (raw.kind as AssetSource) ?? "upload",
    conversationId: raw.conversation_id ?? "",
    messageId: raw.message_id ?? "",
    workflowId: raw.workflow_id ?? "",
    nodeId: raw.node_id ?? "",
    runId: raw.run_id ?? "",
    botId: raw.bot_id ?? "",
    groupId: raw.group_id ?? "",
    name: (raw.name ?? "").trim(),
    preset: raw.preset === true,
    names: stringRecord(raw.names),
    nodeLabel: (raw.node_label ?? "").trim(),
    nodeType: (raw.node_type ?? "").trim(),
  };
}

/**
 * Reads an error from resolveAssetSource as one of the two states the UI shows.
 * Anything else — a network blip, a 500 — is not a verdict about the source and
 * returns null, so the badge stays as it is and the click can be retried.
 */
export function assetSourceProblem(error: unknown): AssetSourceProblem | null {
  if (!(error instanceof CdpApiError)) return null;
  // Matched on the code alone, never on the status. A bare 404 is ambiguous —
  // it is also what an environment whose backend predates this endpoint answers,
  // and what a missing asset id answers — and treating those as "the source was
  // deleted" would switch the jump off for every badge on a deployment that is
  // simply a version behind. Only the backend saying `source_deleted` is a
  // verdict about the source.
  if (error.code === "source_forbidden") return "forbidden";
  if (error.code === "source_deleted") return "deleted";
  if (error.code === "source_unlinked") return "unlinked";
  return null;
}

/** One media row's analysis, as GET /api/v1/media/analysis answers it. */
export interface MediaAnalysis {
  /** kb_ingest lifecycle: pending | processing | ready | failed | skipped. */
  status: string;
  description: string;
  labels: string[];
}

interface RawMediaAnalysis {
  analysis_status?: string;
  ai_metadata?: { description?: string; labels?: string[] | null };
}

/**
 * Analysis state for several media rows at once, keyed by row id.
 *
 * The Material Center lists ASSETS, while the AI analysis of an upload is
 * recorded on the media row the asset was filed from. This is the bridge: pass
 * the mirror row ids of the assets on screen and get their analysis back in one
 * request, instead of teaching the asset list a join no index serves.
 *
 * Rows the tenant does not own are absent rather than reported, so a missing key
 * means "no analysis", never "someone else's analysis".
 */
export async function fetchMediaAnalysis(
  rowIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, MediaAnalysis>> {
  const ids = [...new Set(rowIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, MediaAnalysis>();
  if (ids.length === 0) return out;
  const raw = await cdpFetch<Record<string, RawMediaAnalysis>>(
    `/api/v1/media/analysis?ids=${encodeURIComponent(ids.join(","))}`,
    { auth: { kind: "auto" }, signal },
  );
  for (const [id, value] of Object.entries(raw ?? {})) {
    out.set(id, {
      status: value.analysis_status ?? "",
      description: value.ai_metadata?.description ?? "",
      labels: value.ai_metadata?.labels ?? [],
    });
  }
  return out;
}

/**
 * The asset filed from one media-library row, or null when nothing was.
 *
 * Exists for the script picker: a link gives it a media row id, and the media
 * library cannot always produce a url for that row (an object row with no file id
 * answers with none), while the asset filed from it carries one. Asking by id
 * rather than by name because names repeat and this must not attach a different
 * file that happens to share one.
 */
export async function findAssetByMirrorRow(
  rowId: string,
  signal?: AbortSignal,
): Promise<Asset | null> {
  const id = rowId.trim();
  if (!id) return null;
  const { items } = await listAssets({ mirrorRowId: id, limit: 1 }, signal);
  return items[0] ?? null;
}

/** GET /api/v1/assets/:id — the detail panel, including its source block. */
export async function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  const raw = await cdpFetch<RawAsset>(`/api/v1/assets/${encodeURIComponent(id)}`, {
    auth: { kind: "auto" },
    signal,
  });
  return toAsset(raw);
}

/**
 * The body of PATCH /assets/:id: rename, move, ownership, star (PRD v1.6 §9.1).
 *
 * `folder` distinguishes three intents that a nullable id cannot: absent leaves
 * the folder alone, "root" moves the asset out of its folder, and an id files it
 * into that folder.
 */
export interface PatchAssetInput {
  name?: string;
  /**
   * Re-files the asset under another category. The row keeps its id, its source
   * and its folder — the backend is explicit about that, because "change the
   * category" reads to a user like "move it" and must not lose its history.
   */
  category?: AssetCategory;
  /** Free text. "" is a real value: it clears a description (LIB-036). */
  description?: string;
  folder?: "root" | { id: string };
  scope?: AssetScope;
  favorite?: boolean;
  /**
   * Required when `scope` changes: the transfer between personal and company
   * ownership is confirmed twice and written to the audit trail (§3.4). Without
   * it the backend answers 409 `confirmation_required`.
   */
  confirm?: boolean;
}

/**
 * PATCH /api/v1/assets/:id — rename, move between folders, change ownership, or
 * set this user's star.
 *
 * Returns the asset as the server now reads it, so a caller that guessed
 * optimistically can settle on the truth rather than keep its guess. That matters
 * for a move in particular: `folderName` changes with it, and the card renders
 * from it.
 */
export async function patchAsset(
  id: string,
  input: PatchAssetInput,
  signal?: AbortSignal,
): Promise<Asset> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.category !== undefined) body.category = input.category;
  // Sent when present even as "", which is how a description is cleared: the
  // backend reads the key, not the value.
  if (input.description !== undefined) body.description = input.description;
  if (input.folder !== undefined) {
    // null is a real instruction here ("move to the root"), which is why the
    // backend reads the key's presence rather than the value alone.
    body.folder_id = input.folder === "root" ? null : input.folder.id;
  }
  if (input.scope !== undefined) body.scope = input.scope;
  if (input.favorite !== undefined) body.favorite = input.favorite;
  if (input.confirm) body.confirm = true;

  const raw = await cdpFetch<RawAsset>(`/api/v1/assets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: { kind: "auto" },
    body,
    signal,
  });
  notifyAssetLibraryChanged("asset.patched");
  return toAsset(raw);
}

/**
 * PATCH /api/v1/assets/:id — add or remove this user's star.
 *
 * Kept as its own function because that is how the card calls it; it is
 * patchAsset with one field.
 */
export async function setAssetFavorite(
  id: string,
  favorite: boolean,
  signal?: AbortSignal,
): Promise<Asset> {
  return patchAsset(id, { favorite }, signal);
}

/**
 * POST /api/v1/assets/promote — the user keeps these rows ("save"), so an
 * intermediate workflow output is given its unified code within seconds
 * (PRD A3). Answers the ids it marked; a row the caller may not open, or one
 * that needed no promotion, is left out.
 */
export async function promoteAssetsForCode(ids: string[], signal?: AbortSignal): Promise<string[]> {
  const raw = await cdpFetch<{ promoted?: string[] }>("/api/v1/assets/promote", {
    method: "POST",
    auth: { kind: "auto" },
    body: { asset_ids: ids, reason: "save" },
    signal,
  });
  return raw?.promoted ?? [];
}

/**
 * The Database module's per-company preferences (PRD v1.6 §3.4 storage model).
 *
 * `canEdit` comes from the server, which resolves the caller's tenant role — the
 * page must not decide a permission from a token it parsed itself, and the write
 * is refused server-side regardless (§2.3).
 */
export interface AssetLibrarySettings {
  /**
   * Keep the AI's plan document (.md), charged to storage, opened from the
   * detail of the asset it planned and never listed in Files. On by default
   * (LIB2-015); off stops new ones and keeps those already kept.
   */
  keepAIPlanDocuments: boolean;
  /** Whether this caller may change these settings (tenant administrator). */
  canEdit: boolean;
  /** Who last changed it, empty on a setting nobody has touched. */
  updatedBy: string;
  updatedAt: string;
}

interface RawLibrarySettings {
  keep_ai_plan_documents?: boolean;
  can_edit?: boolean;
  updated_by?: string;
  updated_at?: string;
}

function toLibrarySettings(raw: RawLibrarySettings): AssetLibrarySettings {
  return {
    // A server that does not say reads as the default, which is to keep them.
    keepAIPlanDocuments: raw.keep_ai_plan_documents ?? true,
    canEdit: raw.can_edit ?? false,
    updatedBy: raw.updated_by ?? "",
    updatedAt: raw.updated_at ?? "",
  };
}

/** GET /api/v1/asset-library/settings */
export async function getLibrarySettings(
  signal?: AbortSignal,
): Promise<AssetLibrarySettings> {
  const raw = await cdpFetch<RawLibrarySettings>("/api/v1/asset-library/settings", {
    auth: { kind: "auto" },
    signal,
  });
  return toLibrarySettings(raw);
}

/**
 * PATCH /api/v1/asset-library/settings — administrators only.
 *
 * A non-administrator gets 403 `forbidden`; the dialog does not offer the switch
 * to them, and this is what makes that true rather than decorative.
 */
export async function setLibrarySettings(
  input: { keepAIPlanDocuments: boolean },
  signal?: AbortSignal,
): Promise<AssetLibrarySettings> {
  const raw = await cdpFetch<RawLibrarySettings>("/api/v1/asset-library/settings", {
    method: "PATCH",
    auth: { kind: "auto" },
    body: { keep_ai_plan_documents: input.keepAIPlanDocuments },
    signal,
  });
  // keep_ai_plan_documents decides whether new AI plan documents are kept, which
  // moves the storage figures every list carries.
  notifyAssetLibraryChanged("library.settings");
  return toLibrarySettings(raw);
}

/** What a delete answers: how many rows went, and how long they can come back. */
export interface DeleteAssetsResult {
  deleted: number;
  /** ISO timestamp the recycle bin keeps them until (30 days, §3.3). */
  restoreUntil: string;
  /**
   * How many of the ids the caller may see but not delete — somebody else's file
   * in a folder shared with them. Reported apart from the plain shortfall because
   * "3 of 5 deleted" reads as a bug, while "2 belong to someone else" is an answer
   * (the server counts these the same way a move reports `forbidden`).
   */
  forbidden: number;
}

/**
 * DELETE /api/v1/assets/:id — soft delete.
 *
 * Always soft: the asset moves to the recycle bin and stays restorable for 30
 * days (§3.3). Nothing in the API removes an asset outright; the purge worker
 * does that when the window closes, which is also when its storage is released.
 */
export async function deleteAsset(id: string, signal?: AbortSignal): Promise<DeleteAssetsResult> {
  const raw = await cdpFetch<{ deleted?: number; restore_until?: string; forbidden?: number }>(
    `/api/v1/assets/${encodeURIComponent(id)}`,
    { method: "DELETE", auth: { kind: "auto" }, signal },
  );
  notifyAssetLibraryChanged("asset.deleted");
  return {
    deleted: raw.deleted ?? 0,
    restoreUntil: raw.restore_until ?? "",
    forbidden: raw.forbidden ?? 0,
  };
}

/**
 * POST /api/v1/assets/bulk-delete — the multi-select bar's delete, ≤200 ids.
 *
 * `deleted` can be lower than the number of ids sent: rows already in the bin, or
 * belonging to someone else, are not counted. The summary shows the difference
 * rather than claiming everything went.
 */
export async function deleteAssets(
  ids: string[],
  signal?: AbortSignal,
): Promise<DeleteAssetsResult & { requested: number }> {
  const raw = await cdpFetch<{
    deleted?: number;
    requested?: number;
    restore_until?: string;
    forbidden?: number;
  }>("/api/v1/assets/bulk-delete", {
    method: "POST",
    auth: { kind: "auto" },
    body: { ids },
    signal,
  });
  notifyAssetLibraryChanged("asset.deleted");
  return {
    deleted: raw.deleted ?? 0,
    requested: raw.requested ?? ids.length,
    restoreUntil: raw.restore_until ?? "",
    forbidden: raw.forbidden ?? 0,
  };
}

/** What a restore answers. */
export interface RestoreAssetResult {
  asset: Asset;
  /**
   * True when the folder the asset remembered is gone, so it came back at the
   * root. The UI has to say so — otherwise the user goes looking for it in a
   * folder that no longer exists (§3.10 E-M9).
   */
  folderMissing: boolean;
}

/** POST /api/v1/assets/:id/restore — bring one asset back out of the bin. */
/**
 * POST /api/v1/assets/bulk-restore — the recycle bin's multi-select restore,
 * ≤200 ids, one transaction server-side.
 *
 * One call rather than looping the single-id endpoint: restoring a selection is
 * one intent, and N sequential requests can stop halfway on a dropped connection,
 * leaving the user with half a restore and no way to see which half.
 *
 * `folderMissing` counts rows that came back at the root because the folder they
 * remembered is gone (§3.10 E-M9) — the UI has to say so rather than leave the
 * user hunting in a folder that no longer exists.
 */
export async function restoreAssets(
  ids: string[],
  signal?: AbortSignal,
): Promise<{
  restored: number;
  requested: number;
  folderMissing: number;
  /** Left in the bin: the same content is already back in the library. */
  duplicateSkipped: number;
}> {
  const raw = await cdpFetch<{
    restored?: number;
    requested?: number;
    folder_missing?: number;
    duplicate_skipped?: number;
  }>("/api/v1/assets/bulk-restore", {
    method: "POST",
    auth: { kind: "auto" },
    body: { ids },
    signal,
  });
  notifyAssetLibraryChanged("asset.restored");
  return {
    restored: raw?.restored ?? 0,
    requested: raw?.requested ?? ids.length,
    folderMissing: raw?.folder_missing ?? 0,
    duplicateSkipped: raw?.duplicate_skipped ?? 0,
  };
}

export async function restoreAsset(
  id: string,
  signal?: AbortSignal,
): Promise<RestoreAssetResult> {
  const raw = await cdpFetch<{ asset: RawAsset; folder_missing?: boolean }>(
    `/api/v1/assets/${encodeURIComponent(id)}/restore`,
    { method: "POST", auth: { kind: "auto" }, signal },
  );
  notifyAssetLibraryChanged("asset.restored");
  return { asset: toAsset(raw.asset), folderMissing: raw.folder_missing ?? false };
}

/** What a bulk move answers. */
export interface MoveAssetsResult {
  moved: number;
  /** Already in the target — nothing to act on (§3.4). */
  skipped: number;
  /**
   * Refused: someone else's asset, in a folder shared read-only. Separate from
   * `skipped` because it is the one number a user has to be told about — a
   * selection that "did nothing" otherwise looks like a broken button.
   */
  forbidden: number;
  requested: number;
  /**
   * How many ids did not move for a reason that is not "already there" —
   * forbidden, missing, or a write that failed. Reported even when it is zero:
   * a summary that lists only successes cannot be checked against the
   * selection, which is what a bulk action needs to be trusted (LIB-050).
   */
  failed: number;
  /** One row per id that did not move, so the failures can be retried. */
  failures: MoveAssetFailure[];
}

/** One id that did not move, and whether trying again could help. */
export interface MoveAssetFailure {
  assetId: string;
  /** "forbidden" | "missing" | "write_failed" — the server's own word. */
  reason: string;
  retryable: boolean;
}

/**
 * POST /api/v1/assets/move — the bulk "Chuyển đến", ≤200 ids.
 *
 * A partial move is not rolled back: the response reports moved and skipped so
 * the summary adds up to the selection.
 */
export async function moveAssets(
  ids: string[],
  folder: "root" | { id: string },
  signal?: AbortSignal,
): Promise<MoveAssetsResult> {
  const raw = await cdpFetch<{
    moved?: number;
    skipped?: number;
    forbidden?: number;
    requested?: number;
    failed?: number;
    failures?: { asset_id?: string; reason?: string; retryable?: boolean }[];
  }>(
    "/api/v1/assets/move",
    {
      method: "POST",
      auth: { kind: "auto" },
      body: { ids, folder_id: folder === "root" ? "" : folder.id },
      signal,
    },
  );
  notifyAssetLibraryChanged("asset.moved");
  return {
    moved: raw.moved ?? 0,
    skipped: raw.skipped ?? 0,
    forbidden: raw.forbidden ?? 0,
    requested: raw.requested ?? ids.length,
    failed: raw.failed ?? 0,
    failures: (raw.failures ?? []).map((f) => ({
      assetId: f.asset_id ?? "",
      reason: f.reason ?? "",
      retryable: f.retryable ?? false,
    })),
  };
}

// --------------------------------------------------------------------- folders

/**
 * A Material Center folder: one level deep, cross-category, duplicate names
 * allowed (PRD v1.6 §3.4).
 *
 * Backed by the same `kb_folder` rows the Script Library uses, which is what
 * "reuse the knowledge-base mechanism 100%" means in practice — one folder holds
 * a script and a video at once, and sharing is the KB's grant table rather than a
 * second permission model.
 */
export interface AssetFolder {
  id: string;
  name: string;
  scope: AssetScope;
  /** Live count, so it cannot drift from the assets it describes. */
  assetCount: number;
  /**
   * Script Library rows in the same folder. `kb_folder` is one folder space for
   * both modules (§3.4), so a folder opened from Resources can be holding scripts
   * this view never lists — and deleting it sends them back to their own root. The
   * delete dialog says so before it happens.
   */
  scriptCount: number;
  /** Somebody else's folder that was shared with this user. */
  sharedWithMe: boolean;
  /**
   * Whether this user may rename it or file into it. False for a read-only share:
   * the control is hidden rather than offered and then refused.
   */
  canEdit: boolean;
  ownerUserId: string;
  /** The root folder this one sits in; null for a root. Nesting stops at one level. */
  parentId: string | null;
  /** Subfolders, which a delete of this folder takes with it. */
  childCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListAssetFoldersResult {
  items: AssetFolder[];
  /** Folders per user (100). The create button stays visible at the cap (§3.4). */
  limit: number;
  /**
   * How much of `limit` this user has used: the folders they OWN — the count the
   * server enforces on create. Not `items.length`: the list also holds
   * colleagues' company folders and shares, which cost this user nothing, so
   * counting those made two people in one company read two different totals
   * (LIB-054 / BUG-743).
   */
  used: number;
}

interface RawAssetFolder {
  id: string;
  name: string;
  scope?: AssetScope;
  asset_count?: number;
  script_count?: number;
  shared_with_me?: boolean;
  can_edit?: boolean;
  owner_user_id?: string;
  parent_id?: string | null;
  child_count?: number;
  created_at: string;
  updated_at: string;
}

function toAssetFolder(raw: RawAssetFolder): AssetFolder {
  return {
    id: raw.id,
    name: raw.name,
    scope: raw.scope ?? "personal",
    assetCount: raw.asset_count ?? 0,
    scriptCount: raw.script_count ?? 0,
    sharedWithMe: raw.shared_with_me ?? false,
    canEdit: raw.can_edit ?? false,
    ownerUserId: raw.owner_user_id ?? "",
    parentId: raw.parent_id ?? null,
    childCount: raw.child_count ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/** GET /api/v1/asset-folders — the folder strip above the All view. */
export async function listAssetFolders(
  // `q` narrows by name, the same parameter and the same matching the asset list
  // uses. Searching used to drop the folder strip entirely, so three folders
  // called "QA…" were unreachable from the search box (LIB-034).
  // No `parentId` lists roots only; with one, that folder's children. A keyword alone matches all.
  params: { scope?: AssetScope; q?: string; parentId?: string } = {},
  signal?: AbortSignal,
): Promise<ListAssetFoldersResult> {
  const data = await cdpFetch<{ items?: RawAssetFolder[] | null; limit?: number; used?: number }>(
    "/api/v1/asset-folders",
    {
      auth: { kind: "auto" },
      signal,
      searchParams: {
        scope: params.scope,
        q: params.q?.trim() || undefined,
        parent_id: params.parentId || undefined,
      },
    },
  );
  const items = (data.items ?? []).map(toAssetFolder);
  return {
    items,
    limit: data.limit ?? 0,
    // A backend that predates `used` answered the old way; keep its number
    // rather than showing none.
    used: typeof data.used === "number" ? data.used : items.length,
  };
}

/** GET /api/v1/asset-folders/:id — resolves the breadcrumb for a shared link. */
export async function getAssetFolder(id: string, signal?: AbortSignal): Promise<AssetFolder> {
  const raw = await cdpFetch<RawAssetFolder>(
    `/api/v1/asset-folders/${encodeURIComponent(id)}`,
    { auth: { kind: "auto" }, signal },
  );
  return toAssetFolder(raw);
}

/** POST /api/v1/asset-folders — 1–50 characters, duplicates allowed; `parentId` must be a root. */
export async function createAssetFolder(
  input: { name: string; scope?: AssetScope; requestId?: string; parentId?: string },
  signal?: AbortSignal,
): Promise<AssetFolder> {
  const raw = await cdpFetch<RawAssetFolder>("/api/v1/asset-folders", {
    method: "POST",
    auth: { kind: "auto" },
    // request_id identifies one act of creating a folder, so a submit that
    // reaches the server twice yields one folder. Duplicate folder names are
    // legal (§3.4), so nothing else can tell a repeat from a new folder.
    body: {
      name: input.name,
      scope: input.scope,
      request_id: input.requestId,
      parent_id: input.parentId,
    },
    signal,
  });
  notifyAssetLibraryChanged("folder.created");
  return toAssetFolder(raw);
}

/**
 * PATCH /api/v1/asset-folders/:id — rename, or move between personal and company
 * ownership (which needs `confirm`, and is audited server-side).
 */
export async function patchAssetFolder(
  id: string,
  input: { name?: string; scope?: AssetScope; confirm?: boolean },
  signal?: AbortSignal,
): Promise<AssetFolder> {
  const raw = await cdpFetch<RawAssetFolder>(
    `/api/v1/asset-folders/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      auth: { kind: "auto" },
      body: { name: input.name, scope: input.scope, confirm: input.confirm },
      signal,
    },
  );
  notifyAssetLibraryChanged("folder.patched");
  return toAssetFolder(raw);
}

/** What deleting a folder did to its contents. */
export interface DeleteAssetFolderResult {
  /** Sent back to the root — the default. */
  assetsDetached: number;
  /** Followed the folder into the recycle bin (`withAssets`). */
  assetsDeleted: number;
  /**
   * Scripts sent back to their own root. Always detached, never deleted — see
   * AssetFolder.scriptCount. Reported so the notice can mention rows the user
   * deleted the folder without ever seeing.
   */
  scriptsDetached: number;
}

/**
 * DELETE /api/v1/asset-folders/:id.
 *
 * By default the folder's assets return to the root; `withAssets` sends them to
 * the recycle bin with it — the confirm dialog's "đồng thời xóa N tài nguyên bên
 * trong" checkbox (§3.4). Subfolders go with their parent, under the same option.
 */
export async function deleteAssetFolder(
  id: string,
  options: { withAssets?: boolean } = {},
  signal?: AbortSignal,
): Promise<DeleteAssetFolderResult> {
  const raw = await cdpFetch<{
    assets_detached?: number;
    assets_deleted?: number;
    scripts_detached?: number;
  }>(`/api/v1/asset-folders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: { kind: "auto" },
    searchParams: { with_assets: options.withAssets ? "true" : undefined },
    signal,
  });
  notifyAssetLibraryChanged("folder.deleted");
  return {
    assetsDetached: raw.assets_detached ?? 0,
    assetsDeleted: raw.assets_deleted ?? 0,
    scriptsDetached: raw.scripts_detached ?? 0,
  };
}

/** One grant in the share dialog. */
export interface AssetFolderShare {
  userId: string;
  canEdit: boolean;
  grantedBy: string;
  createdAt: string;
}

/** GET /api/v1/asset-folders/:id/shares — who can already see this folder. */
export async function listAssetFolderShares(
  folderId: string,
  signal?: AbortSignal,
): Promise<AssetFolderShare[]> {
  const data = await cdpFetch<{
    items?: { user_id: string; can_edit?: boolean; granted_by?: string; created_at: string }[] | null;
  }>(`/api/v1/asset-folders/${encodeURIComponent(folderId)}/shares`, {
    auth: { kind: "auto" },
    signal,
  });
  return (data.items ?? []).map((raw) => ({
    userId: raw.user_id,
    canEdit: raw.can_edit ?? false,
    grantedBy: raw.granted_by ?? "",
    createdAt: raw.created_at,
  }));
}

/**
 * POST /api/v1/asset-folders/:id/shares — share the folder with one colleague.
 *
 * Sharing stops at the folder: everything inside inherits it, and there is no
 * per-asset override to undo it (§3.4). Re-sharing the same person updates their
 * permission instead of failing.
 */
export async function shareAssetFolder(
  folderId: string,
  input: { userId: string; canEdit?: boolean },
  signal?: AbortSignal,
): Promise<void> {
  await cdpFetch<void>(`/api/v1/asset-folders/${encodeURIComponent(folderId)}/shares`, {
    method: "POST",
    auth: { kind: "auto" },
    body: { user_id: input.userId, can_edit: input.canEdit ?? false },
    signal,
  });
  notifyAssetLibraryChanged("folder.shared");
}

/** DELETE /api/v1/asset-folders/:id/shares?user_id= — revoke one grant. */
export async function unshareAssetFolder(
  folderId: string,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  await cdpFetch<void>(`/api/v1/asset-folders/${encodeURIComponent(folderId)}/shares`, {
    method: "DELETE",
    auth: { kind: "auto" },
    searchParams: { user_id: userId },
    signal,
  });
  notifyAssetLibraryChanged("folder.unshared");
}

/**
 * POST /api/v1/assets/:id/retry — the "retry" on a failed card (§3.5).
 *
 * One call for both failures the card can show: content that never got filed is
 * re-read from its origin, a failed thumbnail is queued again. The backend
 * writes into the same row either way, so pressing this twice — or pressing it
 * on an asset that is already being retried — cannot produce a second card
 * (AC-M5). The asset it answers with is the new truth for that row.
 */
export async function retryAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  const raw = await cdpFetch<RawAsset>(`/api/v1/assets/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    auth: { kind: "auto" },
    signal,
  });
  notifyAssetLibraryChanged("asset.retried");
  return toAsset(raw);
}

/** One downstream use of an asset, as `GET /api/v1/assets/:id/usages` returns it. */
export type AssetUsage = {
  id: string;
  /**
   * "generation" — re-entered into a job; "reupload" — an upload deduplicated onto
   * it; "ad" — an ad it ran in, counted once per ad (LIB2-100).
   */
  kind: string;
  /**
   * What the row reads as. Resolved by the server while the downstream job still
   * existed, so it is shown verbatim rather than rebuilt here from kind + id.
   */
  label: string;
  referenceId: string;
  /** "" when the consumer has no page worth opening. */
  url: string;
  createdAt: string;
};

export type AssetUsageList = {
  items: AssetUsage[];
  /**
   * The counter the Reuses column shows. It can exceed `items.length`: the log
   * starts the day it shipped, so uses from before it have no rows. The drawer
   * says so instead of looking empty.
   */
  usedCount: number;
};

type RawAssetUsage = {
  id?: string;
  kind?: string;
  label?: string;
  reference_id?: string;
  url?: string;
  created_at?: string;
};

/**
 * GET /api/v1/assets/:id/usages — the list behind the Reuses column (§3.3, LIB-030).
 *
 * The column was a stored number with nothing behind it: "13" told a user their
 * file mattered and gave them no way to find out where. This is the answer to
 * the click.
 */
export async function listAssetUsages(
  id: string,
  signal?: AbortSignal,
): Promise<AssetUsageList> {
  const data = await cdpFetch<{ items?: RawAssetUsage[]; used_count?: number }>(
    `/api/v1/assets/${encodeURIComponent(id)}/usages`,
    { auth: { kind: "auto" }, signal },
  );
  return {
    items: (data.items ?? []).map((raw) => ({
      id: raw.id ?? "",
      kind: raw.kind ?? "",
      label: raw.label ?? "",
      referenceId: raw.reference_id ?? "",
      url: raw.url ?? "",
      createdAt: raw.created_at ?? "",
    })),
    usedCount: data.used_count ?? 0,
  };
}

/**
 * POST /api/v1/assets/download — a selection as one zip (§3.3, LIB-157).
 *
 * The archive is streamed by the server and handed to the browser through a blob
 * URL rather than a plain link, because the endpoint is a POST: a hundred ids do
 * not belong in a query string, and `<a href>` cannot carry a body.
 *
 * The object URL is revoked on the next tick. Chrome and Firefox have both begun
 * the download by the time the click handler returns, and holding the blob for
 * the life of the page would keep an archive of the user's library in memory.
 */
export async function downloadAssetsArchive(
  ids: string[],
  signal?: AbortSignal,
): Promise<void> {
  // Not through cdpFetch: that one parses every response as JSON, and this one
  // is a zip. The same pattern the creative-report export uses.
  const token = getCdpAccessToken();
  const res = await fetch(`${cdpApiConfig.baseUrl}/api/v1/assets/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ids }),
    signal,
  });
  if (!res.ok) {
    throw new CdpApiError({
      status: res.status,
      code: res.status === 401 ? "unauthorized" : "download_failed",
      message: `bulk download failed (${res.status})`,
    });
  }
  const blob = await res.blob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cluega-library-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** One member of an asset's edit chain (§3.8, LIB-063). */
export type AssetVersion = {
  id: string;
  version: number;
  name: string;
  size: number;
  /**
   * The links to load from: the expiring ones (LIB-166) when the backend signs
   * them, the stable ones otherwise. A version list is only ever displayed.
   */
  fileUrl: string;
  thumbUrl: string;
  /** When the signed links above expire (epoch ms); absent when unsigned. */
  linksExpireAt?: number;
  /** The version the caller asked from, so the list can show where they stand. */
  current: boolean;
  /**
   * In the recycle bin. Still listed: a history that skipped a binned version
   * would jump from v1 to v3 and read as data loss.
   */
  deleted: boolean;
  createdAt: string;
};

/**
 * GET /api/v1/assets/:id/versions — the edit chain (§3.8, §5.4, LIB-063).
 *
 * Answers from whichever member of the chain is asked about, so the caller does
 * not have to find the root first — which it could not do anyway, since the row
 * on screen is normally the latest.
 */
export async function listAssetVersions(
  id: string,
  signal?: AbortSignal,
): Promise<AssetVersion[]> {
  const data = await cdpFetch<{
    items?: {
      id?: string;
      version?: number;
      name?: string;
      size?: number;
      file_url?: string;
      thumb_url?: string;
      access?: RawSignedAccess;
      current?: boolean;
      deleted?: boolean;
      created_at?: string;
    }[];
  }>(`/api/v1/assets/${encodeURIComponent(id)}/versions`, {
    auth: { kind: "auto" },
    signal,
  });
  return (data.items ?? []).map((raw) => {
    const access = toSignedAccess(raw.access);
    return {
      id: raw.id ?? "",
      version: raw.version ?? 1,
      name: raw.name ?? "",
      size: raw.size ?? 0,
      fileUrl: access?.fileUrl || (raw.file_url ?? ""),
      thumbUrl: access?.thumbUrl || (raw.thumb_url ?? ""),
      linksExpireAt: access?.expiresAt,
      current: raw.current === true,
      deleted: raw.deleted === true,
      createdAt: raw.created_at ?? "",
    };
  });
}

/**
 * POST /api/v1/assets/:id/versions — file `assetId` as the next version of `id`.
 *
 * What "replace" on a name clash does (LIB-162 + LIB-063). The version number is
 * the server's to decide and is deliberately not a parameter here.
 */
export async function linkAssetVersion(
  previousId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<Asset> {
  const raw = await cdpFetch<RawAsset>(
    `/api/v1/assets/${encodeURIComponent(previousId)}/versions`,
    { method: "POST", auth: { kind: "auto" }, body: { asset_id: assetId }, signal },
  );
  notifyAssetLibraryChanged("asset.versioned");
  return toAsset(raw);
}

/**
 * POST /api/v1/assets/:id/access — the asset was opened, previewed or
 * downloaded (LIB2-017). Restarts its 180-day clock and, for an archived one,
 * counts it toward storage again (LIB2-019).
 *
 * Never rejects: a failure costs an item that may archive early, and opening it
 * brings it straight back, so it must never interrupt the open itself. Resolves
 * true once the server recorded it.
 */
export function recordAssetAccess(id: string): Promise<boolean> {
  if (!id) return Promise.resolve(false);
  return cdpFetch<unknown>(`/api/v1/assets/${encodeURIComponent(id)}/access`, {
    method: "POST",
    auth: { kind: "auto" },
  }).then(
    () => true,
    () => false,
  );
}

/** One line of "What's using storage": bytes and how many items hold them. */
export interface StorageUsage {
  bytes: number;
  count: number;
}

export interface StorageLargestItem {
  id: string;
  name: string;
  category: string;
  bytes: number;
  /** Empty when the item has not been opened since access was recorded. */
  lastAccessedAt: string;
  planDocument: boolean;
}

/**
 * GET /api/v1/asset-library/storage/breakdown (LIB2-123).
 *
 * Every counted line adds up to `quota.usedBytes` exactly — the server closes
 * the total with `other` — and `archived` is shown beside the total, not in it.
 */
export interface StorageBreakdown {
  quota: AssetQuota;
  categories: Array<{ category: string } & StorageUsage>;
  planDocuments: StorageUsage;
  pages: StorageUsage;
  knowledgeBase: StorageUsage;
  recycleBin: StorageUsage;
  other: StorageUsage;
  archived: StorageUsage;
  largest: StorageLargestItem[];
}

interface RawStorageUsage {
  bytes?: number;
  count?: number;
}

interface RawStorageBreakdown {
  quota?: RawAssetQuota;
  categories?: Array<{ category?: string } & RawStorageUsage>;
  plan_documents?: RawStorageUsage;
  pages?: RawStorageUsage;
  knowledge_base?: RawStorageUsage;
  recycle_bin?: RawStorageUsage;
  other?: RawStorageUsage;
  archived?: RawStorageUsage;
  largest?: Array<{
    id?: string;
    name?: string;
    category?: string;
    bytes?: number;
    last_accessed_at?: string | null;
    plan_document?: boolean;
  }>;
}

function toStorageUsage(raw: RawStorageUsage | undefined): StorageUsage {
  return { bytes: raw?.bytes ?? 0, count: raw?.count ?? 0 };
}

export async function getStorageBreakdown(signal?: AbortSignal): Promise<StorageBreakdown> {
  const raw = await cdpFetch<RawStorageBreakdown>("/api/v1/asset-library/storage/breakdown", {
    auth: { kind: "auto" },
    signal,
  });
  return {
    quota: toAssetQuota(raw?.quota),
    categories: (raw?.categories ?? []).map((c) => ({ category: c.category ?? "", ...toStorageUsage(c) })),
    planDocuments: toStorageUsage(raw?.plan_documents),
    pages: toStorageUsage(raw?.pages),
    knowledgeBase: toStorageUsage(raw?.knowledge_base),
    recycleBin: toStorageUsage(raw?.recycle_bin),
    other: toStorageUsage(raw?.other),
    archived: toStorageUsage(raw?.archived),
    largest: (raw?.largest ?? []).map((item) => ({
      id: item.id ?? "",
      name: item.name ?? "",
      category: item.category ?? "",
      bytes: item.bytes ?? 0,
      lastAccessedAt: item.last_accessed_at ?? "",
      planDocument: item.plan_document === true,
    })),
  };
}

/**
 * GET /api/v1/assets/:id/plan-documents — the AI plan documents written for
 * this asset (LIB2-015). They are not listed in Files; the asset's detail is
 * where they open. Matched by owner and job, so often empty.
 */
export async function listPlanDocuments(id: string, signal?: AbortSignal): Promise<Asset[]> {
  const raw = await cdpFetch<{ items?: RawAsset[] }>(
    `/api/v1/assets/${encodeURIComponent(id)}/plan-documents`,
    { auth: { kind: "auto" }, signal },
  );
  return (raw?.items ?? []).map(toAsset);
}
