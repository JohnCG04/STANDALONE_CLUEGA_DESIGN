import type { WorkflowIO } from "@dogclaw-ad/workflow";

import { getCdpBackendUrl } from "@/config/cdp-api";
import { getCdpEmail } from "@/lib/cdp/session";
import { isUuidSegment } from "@/lib/flow/flowToolRoute";

import {
  FlowApiError,
  requestFlowApi,
  type FlowEdge,
  type FlowEnvelope,
  type FlowGroup,
  type FlowNode,
  type FlowPagination,
  type FlowProject,
  type FlowViewport,
} from "./flow-builder.service";

// Frontend client for the flow preset catalog behind the Templates tab. The
// catalog is tenant-agnostic and the reads need only the access token, which
// `requestFlowApi` attaches; publishing is INTERNAL (see the authoring section).
export const PRESET_PREFIX = "/api/v1/flow-presets";

/** Which element to mount for the cover. Only these two values are returned. */
export type PresetPrimaryType = "image" | "video";

/** Home-page card layout: `primary` is the hero card, `secondary` the compact one. */
export type FlowPresetCardType = "primary" | "secondary";

/** Transition a multi-image card cycles with — the dialog's wire values, 1:1. */
export type FlowPresetMediaEffect =
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "curtain";

/** One card-media entry, in the display order the author picked. */
export interface FlowPresetMediaItem {
  url: string;
  type: PresetPrimaryType;
  /** Hosted asset id, when the producing node recorded one. */
  asset_id?: string;
  /** Poster/thumbnail for a video entry, when known. */
  poster?: string;
}

/** A gallery entry as the WRITE routes bind it: `url` absolute http(s), no
 *  `poster` (posters stay client-side), max 20 per preset. */
export interface FlowPresetMediaItemInput {
  url: string;
  type: PresetPrimaryType;
  asset_id?: string;
}

/** The write routes cap the gallery at 20 entries (400 beyond that). */
export const PRESET_MEDIA_ITEMS_MAX = 20;

/** Authored copy in every language, carried whole both ways and resolved at
 *  render time by `presetText`. Pre-multilingual rows read back as
 *  `{ en: "<the old string>", vi: "", zh: "" }`. */
export interface PresetLocalizedText {
  en: string;
  vi: string;
  zh: string;
}

/** Who can reach a published tool. Wire values, never localized. */
export type PresetToolVisibility = "public" | "team" | "private";

/** One end of a tool: a GRAPH REFERENCE, not a url — running it writes the
 *  user's value into the node (or handle) named here. */
export interface FlowPresetIOInput {
  node_id: string;
  node_type: string;
  kind: ToolIOWireKind;
  label?: string;
  /** `node` addresses the whole node; `port` one unwired handle, named by `handle`. */
  source: "node" | "port";
  handle?: string;
  /** The saved graph already holds a value the user may keep. */
  prefilled: boolean;
  /** The workflow cannot run without it. */
  required: boolean;
  /** Values the author offers to start from — a media url, or the text. */
  samples?: string[];
}

/** One result a tool shows. `count` is `null` when the author never ran it. */
export interface FlowPresetIOOutput {
  node_id: string;
  node_type: string;
  kind: ToolIOWireKind;
  label?: string;
  count: number | null;
}

/** What an end CARRIES, which is what decides the widget an app renders. */
export type ToolIOWireKind = "text" | "image" | "video";

export interface FlowPreset {
  id: string;
  name: PresetLocalizedText;
  /** Lowercase slug a TOOL is addressed by (`/flow/tool/<slug>`); a regular
   *  template travels by `id` whatever this holds (`presetRouteSlug`). */
  slug?: string;
  /** Published as a **tool** — opened directly instead of the
   *  start-a-workflow-from-template flow. */
  is_tool?: boolean;
  /** Who may reach the row; legacy rows read back as `public`. */
  visibility?: PresetToolVisibility;
  /** The ends the AUTHOR marked. Three states: absent = never declared (the page
   *  describes the graph itself), `[]` = declared none, a list = the picks. */
  tool_inputs?: FlowPresetIOInput[];
  tool_outputs?: FlowPresetIOOutput[];
  /** The editor's derived description of the graph. Detail responses only. */
  io?: WorkflowIO;
  description?: PresetLocalizedText;
  /** Lowercase slug; absent when the preset has no category. */
  category?: string;
  categories?: string[];
  /** Industry slugs this preset serves — the catalog's second taxonomy axis, and
   *  a LIST where `category` is a single value. `[]` means "serves no particular
   *  vertical"; absent means the backend predates the field. */
  industries?: string[];
  tags?: string[];
  /** The public list endpoint only returns `published`; the admin list
   *  (`?status=…`, see flow-admin.service.ts) also surfaces `draft` rows. */
  status: "published" | "draft";
  /** Backend alias for the card layout; prefer `card_type` (see `getPresetCardType`). */
  type?: FlowPresetCardType;
  /** Which home card layout to render. Defaults to `secondary` for legacy rows. */
  card_type: FlowPresetCardType;
  /** The Save Template dialog's "feature on home page" toggle. */
  is_featured?: boolean;
  /** Explicit home-visibility switch; absent on rows that were never configured. */
  show_on_home?: boolean;
  primary_type: PresetPrimaryType;
  /** Absolute https URL of the cover. Always present. */
  primary_src: string;
  /** Still frame for a video cover — `poster`, or the static reduced-motion cover. */
  thumbnail_url?: string;
  /** The card's media cycle, in display order; absent on legacy single-cover rows. */
  media_items?: FlowPresetMediaItem[];
  /** Only meaningful for an image card with ≥2 `media_items`. */
  media_effect?: FlowPresetMediaEffect | null;
  sort_order: number;
  /** How many times the preset has been used. */
  used_of: number;
  asset_count: number;
  node_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return rows.length > 0 ? rows : undefined;
}

export function getPresetCardType(
  preset: Partial<Pick<FlowPreset, "card_type" | "type">> & {
    /** The backend's wire name for the card layout (`display_type` on every
     *  flow-preset row); `card_type`/`type` are older client spellings. */
    display_type?: string;
  },
): FlowPresetCardType {
  const value = (preset.display_type ?? preset.card_type ?? preset.type ?? "secondary")
    .toString()
    .trim()
    .toLowerCase();
  return value === "primary" ? "primary" : "secondary";
}

/** Whether the preset appears on Flow Home. Only an EXPLICIT `show_on_home` or
 *  `is_featured` counts; legacy rows stay off Home but stay browsable. */
export function isPresetVisibleOnHome(
  preset?: Partial<FlowPreset> | null,
): boolean {
  return preset?.show_on_home === true || preset?.is_featured === true;
}

/** Rows the backfill has not reached still send a plain STRING — read it as the
 *  English entry so every card keeps rendering.
 *
 *  Exported because the industry taxonomy carries the same authored-per-locale
 *  copy and must read it by the SAME rule — including the `vn`/`vi` fold, which
 *  a second copy would eventually get wrong. */
export function localizedText(raw: unknown): PresetLocalizedText {
  const empty: PresetLocalizedText = { en: "", vi: "", zh: "" };
  if (typeof raw === "string") return { ...empty, en: raw };
  if (!raw || typeof raw !== "object") return empty;
  const byLocale = raw as Record<string, unknown>;
  const at = (locale: string): string =>
    typeof byLocale[locale] === "string" ? (byLocale[locale] as string).trim() : "";
  // `vn` and `vi` are both live spellings in this codebase; either may be stored.
  return { en: at("en"), vi: at("vi") || at("vn"), zh: at("zh") };
}

function presetVisibility(raw: unknown): PresetToolVisibility | undefined {
  return raw === "public" || raw === "team" || raw === "private" ? raw : undefined;
}

const toolIOKind = (raw: unknown): ToolIOWireKind =>
  raw === "text" || raw === "video" ? raw : "image";

const trimmedOrUndefined = (raw: unknown): string | undefined => {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : undefined;
};

/** `undefined` in stays `undefined` out: "never declared" must stay
 *  distinguishable from "declared none" — only the first falls back to the graph. */
function toolIOInputs(raw: unknown): FlowPresetIOInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((entry: Record<string, unknown> | null) => {
    const nodeID = trimmedOrUndefined(entry?.node_id);
    if (!nodeID) return [];
    const source = entry?.source === "port" ? "port" : "node";
    return [
      {
        node_id: nodeID,
        node_type: String(entry?.node_type ?? ""),
        kind: toolIOKind(entry?.kind),
        label: trimmedOrUndefined(entry?.label),
        source,
        handle: source === "port" ? trimmedOrUndefined(entry?.handle) : undefined,
        prefilled: entry?.prefilled === true,
        // A row written before the flag counts as required.
        required: entry?.required !== false,
        samples: Array.isArray(entry?.samples)
          ? entry.samples.flatMap((sample: unknown) => trimmedOrUndefined(sample) ?? [])
          : undefined,
      },
    ];
  });
}

function toolIOOutputs(raw: unknown): FlowPresetIOOutput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((entry: Record<string, unknown> | null) => {
    const nodeID = trimmedOrUndefined(entry?.node_id);
    if (!nodeID) return [];
    return [
      {
        node_id: nodeID,
        node_type: String(entry?.node_type ?? ""),
        kind: toolIOKind(entry?.kind),
        label: trimmedOrUndefined(entry?.label),
        count: typeof entry?.count === "number" ? entry.count : null,
      },
    ];
  });
}

/** A preset row as a backend may actually send it: every field optional, plus
 *  the older home-flag spellings. `card_type` never comes off this wire. */
interface FlowPresetWire extends Omit<Partial<FlowPreset>, "name" | "description"> {
  /** A row the backfill has not reached still sends copy as a plain string. */
  name?: string | PresetLocalizedText;
  description?: string | PresetLocalizedText;
  display_type?: string;
  display_on_home?: boolean;
  home_visible?: boolean;
}

export function normalizePreset(raw: FlowPresetWire): FlowPreset {
  const categories = coerceStringArray(raw.categories) ??
    (typeof raw.category === "string" && raw.category.trim()
      ? [raw.category.trim().toLowerCase()]
      : undefined);

  // Slugs are stored lowercase; a hand-written row could still carry casing.
  // `undefined` (field absent) stays undefined — it means a backend without the
  // taxonomy, which is not the same as a preset that serves no vertical.
  const industries = coerceStringArray(raw.industries)?.map((slug) =>
    slug.trim().toLowerCase(),
  );

  const primaryType =
    raw.primary_type === "video" || raw.primary_type === "image"
      ? raw.primary_type
      : "image";

  const mediaItems = Array.isArray(raw.media_items)
    ? raw.media_items.map((item) => ({
      url: String(item?.url ?? ""),
      type:
        item?.type === "video" || item?.type === "image"
          ? item.type
          : primaryType,
      asset_id: item?.asset_id ? String(item.asset_id) : undefined,
      poster: typeof item?.poster === "string" ? item.poster : undefined,
    }))
    : undefined;

  // A TOOL row has neither gallery nor cover, so its publish-step thumbnail is
  // the last fallback here.
  const primarySrc =
    typeof raw.primary_src === "string" && raw.primary_src.trim()
      ? raw.primary_src.trim()
      : mediaItems?.[0]?.url ||
      (typeof raw.thumbnail_url === "string" ? raw.thumbnail_url.trim() : "");

  const cardType = getPresetCardType({
    display_type: raw.display_type,
    card_type: raw.card_type,
    type: raw.type,
  });

  return {
    id: String(raw.id ?? ""),
    name: localizedText(raw.name),
    slug:
      typeof raw.slug === "string" && raw.slug.trim()
        ? raw.slug.trim().toLowerCase()
        : undefined,
    is_tool: raw.is_tool === true,
    visibility: presetVisibility(raw.visibility),
    // Absent stays absent: "never declared" ≠ "declared and none".
    tool_inputs: toolIOInputs(raw.tool_inputs),
    tool_outputs: toolIOOutputs(raw.tool_outputs),
    io: (raw.io as WorkflowIO | undefined) ?? undefined,
    description: localizedText(raw.description),
    category:
      typeof raw.category === "string" && raw.category.trim()
        ? raw.category.trim().toLowerCase()
        : categories?.[0],
    categories,
    industries,
    tags: coerceStringArray(raw.tags) ?? [],
    status: raw.status === "draft" ? "draft" : "published",
    type: raw.type === "primary" || raw.type === "secondary" ? raw.type : cardType,
    card_type: cardType,
    is_featured: raw.is_featured === true,
    // Absent stays absent: only an explicit true puts a card on Home.
    show_on_home: raw.show_on_home ?? raw.display_on_home ?? raw.home_visible,
    primary_type: primaryType,
    primary_src: primarySrc,
    thumbnail_url:
      typeof raw.thumbnail_url === "string" && raw.thumbnail_url.trim()
        ? raw.thumbnail_url.trim()
        : mediaItems?.[0]?.poster,
    media_items: mediaItems,
    media_effect:
      raw.media_effect === "slide-left" ||
        raw.media_effect === "slide-right" ||
        raw.media_effect === "slide-up" ||
        raw.media_effect === "slide-down" ||
        raw.media_effect === "curtain"
        ? raw.media_effect
        : null,
    sort_order: Number(raw.sort_order ?? 0),
    used_of: Number(raw.used_of ?? 0),
    asset_count: Number(raw.asset_count ?? 0),
    node_count: Number(raw.node_count ?? 0),
    version: Number(raw.version ?? 0),
    created_at: String(raw.created_at ?? new Date(0).toISOString()),
    updated_at: String(raw.updated_at ?? raw.created_at ?? new Date(0).toISOString()),
  };
}

/** The graph a preset carries — same shape as a builder document's graph. */
export interface FlowPresetGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
  viewport: FlowViewport;
  global_config?: Record<string, unknown>;
}

/** `GET /flow-presets/:id` — card fields plus the graph; the list endpoint
 *  carries none, so this is the only place to read it from. */
export interface FlowPresetDetail extends FlowPreset, Partial<FlowPresetGraph> {
  /** Tolerated alternative placement for the graph — see `presetGraph`. */
  document?: Partial<FlowPresetGraph>;
  /**
   * The workflow this row was published FROM — the project the admin table's
   * Edit action opens. DETAIL ONLY: the list projection does not carry it, so a
   * card in hand never knows its workflow without this read. Absent on a row
   * published before the link existed, or seeded without a workflow.
   */
  workflow_project_id?: string;
}

/** The graph a detail carries, top-level or nested under `document`. Missing
 *  halves come back empty. */
export function presetGraph(
  detail: Pick<FlowPresetDetail, "nodes" | "edges" | "document">,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: detail.nodes ?? detail.document?.nodes ?? [],
    edges: detail.edges ?? detail.document?.edges ?? [],
  };
}

export interface FlowPresetCategory {
  /** Table row id — what the admin PUT/DELETE routes address. Absent on a legacy backend. */
  id?: string;
  /** Lowercase slug — pass it back as `?category=`. Also the i18n key for the
   *  SEEDED vocabulary; see `topicLabelFor` for how it and `name` combine. */
  category: string;
  /** Operator-authored label in every language it was written in, carried whole
   *  and resolved at render time. A row the backfill adopted carries the slug
   *  itself under `en` — a placeholder, not a label, which is why
   *  `topicLabelFor` still consults the i18n bundle. */
  name: PresetLocalizedText;
  description: PresetLocalizedText;
  /** Curated rank the endpoint sorted by; absent on a legacy (derived) backend. */
  sort_order?: number;
  /** Published presets referencing this category. */
  count: number;
}

/** Wire shape: the table rows carry the slug as `slug`; the legacy derived
 *  endpoint carried it as `category`. Tolerate both. */
interface FlowPresetCategoryWire
  extends Partial<Omit<FlowPresetCategory, "count" | "name" | "description">> {
  slug?: string;
  count?: number;
  /** Unknown rather than the locale object: a deployment that predates the
   *  multilingual taxonomy still sends a bare string, and `localizedText` is
   *  what reconciles the two. */
  name?: unknown;
  description?: unknown;
}

export type PresetSortField =
  | "sort_order"
  | "used_of"
  | "updated_at"
  | "created_at"
  | "name";

export interface ListPresetsParams {
  /** 1-based. */
  page_no?: number;
  /** Server clamps anything above 100. */
  limit?: number;
  /** A slug from the categories endpoint. Omit for the "All" chip. */
  category?: string;
  /** Slugs from the industries endpoint; a preset matches when it carries ANY of
   *  them. Passing a PARENT slug also matches presets tagged only with one of its
   *  children — the server expands it, so the client sends exactly what the user
   *  ticked. Omit or pass `[]` for no industry filter. */
  industries?: string[];
  /** Case-insensitive substring on the name; raw user input is safe (escaped server-side). */
  name?: string;
  /** Defaults to the curated `sort_order` server-side. */
  sort?: PresetSortField;
  order?: "asc" | "desc";
  /** Filter by the backend's card placement classification. */
  display_type?: FlowPresetCardType;
  /**
   * Ask the server for templates whose OUTPUT carries this kind
   * (`?output_kind=video`). The trend galleries (`../trends`) are the only
   * callers. A backend without the filter simply ignores the param, which is
   * exactly why `presetProducesKind` re-applies the same rule client-side —
   * same server-param-plus-client-net arrangement as `show_on_home`.
   */
  output_kind?: ToolIOWireKind;
  /** Home-visible presets only. A legacy backend ignores it — the client-side
   *  `isPresetVisibleOnHome` filter is the safety net. */
  show_on_home?: boolean;
  signal?: AbortSignal;
}

export interface ListPresetsResult {
  items: FlowPreset[];
  pagination: FlowPagination;
}

export function buildListPresetsQuery(
  params: ListPresetsParams = {},
): URLSearchParams {
  const query = new URLSearchParams();
  query.set("page_no", String(params.page_no ?? 1));
  query.set("limit", String(params.limit ?? 20));
  // Filters must be OMITTED when unset — an empty value is not the same thing.
  if (params.category) query.set("category", params.category);
  // Repeated rather than comma-joined: the server accepts both, and repetition
  // survives a slug that itself contains a comma. Blank entries are dropped so an
  // empty selection omits the filter entirely, per the rule above.
  for (const industry of params.industries ?? []) {
    const slug = industry.trim();
    if (slug) query.append("industry", slug);
  }
  const name = params.name?.trim();
  if (name) query.set("name", name);
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  if (params.display_type) query.set("display_type", params.display_type);
  if (params.output_kind) query.set("output_kind", params.output_kind);
  if (params.show_on_home) query.set("show_on_home", "true");
  return query;
}

export async function listPresets(
  params: ListPresetsParams = {},
): Promise<ListPresetsResult> {
  const pageNo = params.page_no ?? 1;
  const limit = params.limit ?? 20;
  const query = buildListPresetsQuery(params);

  const envelope = await requestFlowApi<FlowPreset[]>(
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

export async function listPresetCategories(
  signal?: AbortSignal,
): Promise<FlowPresetCategory[]> {
  const envelope = await requestFlowApi<FlowPresetCategoryWire[]>(
    `${PRESET_PREFIX}/categories`,
    { signal },
  );
  return (envelope.data ?? []).flatMap((row) => {
    const slug = (row.slug ?? row.category)?.trim().toLowerCase();
    if (!slug) return [];
    return [
      {
        id: row.id,
        category: slug,
        name: localizedText(row.name),
        description: localizedText(row.description),
        sort_order: row.sort_order,
        count: row.count ?? 0,
      },
    ];
  });
}

export function resolvePresetCoverSrc(src?: string): string | undefined {
  const value = src?.trim();
  if (!value) return undefined;
  if (/^(?:https?:|blob:|data:)/i.test(value)) return value;
  return `${getCdpBackendUrl()}${value.startsWith("/") ? "" : "/"}${value}`;
}

export function presetStillCoverUrl(preset: FlowPreset): string | undefined {
  return preset.primary_type === "video"
    ? resolvePresetCoverSrc(preset.thumbnail_url)
    : resolvePresetCoverSrc(preset.primary_src) ??
    resolvePresetCoverSrc(preset.thumbnail_url);
}

export async function getPreset(
  id: string,
  signal?: AbortSignal,
): Promise<FlowPresetDetail> {
  const envelope = await requestFlowApi<FlowPresetDetail>(
    `${PRESET_PREFIX}/${encodeURIComponent(id)}`,
    { signal },
  );
  return { ...envelope.data, ...normalizePreset(envelope.data) };
}

export async function getPresetBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<FlowPresetDetail> {
  const envelope = await requestFlowApi<FlowPresetDetail>(
    `${PRESET_PREFIX}/by-slug/${encodeURIComponent(slug)}`,
    { signal },
  );
  return { ...envelope.data, ...normalizePreset(envelope.data) };
}

export function getPresetByRouteSegment(
  segment: string,
  signal?: AbortSignal,
): Promise<FlowPresetDetail> {
  return isUuidSegment(segment)
    ? getPreset(segment, signal)
    : getPresetBySlug(segment, signal);
}

export async function createProjectFromPreset(
  presetId: string,
): Promise<FlowProject> {
  const envelope = await requestFlowApi<FlowProject>(
    `${PRESET_PREFIX}/${encodeURIComponent(presetId)}/use`,
    { method: "POST" },
  );

  if (!envelope.data?.id) {
    throw new FlowApiError(200, "preset_use_no_project", "use returned no project");
  }
  return envelope.data;
}

const FLOW_ADMIN_EMAILS = ["nguyendunggl2308@gmail.com"];

const PRODUCTION_HOSTNAMES = new Set([
  "cluega.ai",
  "www.cluega.ai",
  "cluega.com",
  "www.cluega.com",
]);

// The live hostname, not NODE_ENV (staging is a production build) and not
// NEXT_PUBLIC_SITE_URL (a blank one falls back to a dev host): an unknown host
// counts as production, so a misconfiguration closes the gate, never opens it.
function isProductionHost(): boolean {
  if (typeof window === "undefined") return true;
  return PRODUCTION_HOSTNAMES.has(window.location.hostname.toLowerCase());
}

export function isFlowAdmin(email?: string | null): boolean {
  const value = (email ?? getCdpEmail() ?? "").trim().toLowerCase();
  if (value === "") return false;
  if (!isProductionHost()) return true;
  return FLOW_ADMIN_EMAILS.includes(value);
}

/** The editor's Save Template / Save Tool gate — every operator may author. */
export function canAuthorPresets(email?: string | null): boolean {
  return isFlowAdmin(email);
}

/** Every catalog write goes through here. The email gate only HIDES the
 *  affordance; the CDP backend decides, by the signed-in user's id
 *  (FLOW_PRESETS_ADMIN_USER_IDS). */
export async function requestPresetAdminApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<FlowEnvelope<T>> {
  if (!isFlowAdmin()) {
    throw new FlowApiError(
      403,
      "preset_authoring_forbidden",
      "this account may not manage workflow templates",
    );
  }
  return requestFlowApi<T>(path, init);
}

/** `POST /flow-presets` body — EXACTLY the backend's `CreateFlowPresetRequest`
 *  (`dto/flow_preset.go`), which binds these fields and nothing else. Client
 *  vocabulary maps onto the wire here: card layout is `display_type` (never
 *  `card_type`), Home visibility `show_on_home` (there is no `is_featured`). */
export interface CreatePresetInput extends FlowPresetGraph {
  name: PresetLocalizedText;
  description?: PresetLocalizedText;
  /** A lowercase slug; omit (or `""`) for an uncategorized preset. */
  category?: string;
  /** Industry slugs, each of which MUST already exist in the industry table —
   *  the server rejects the whole write with a 400 otherwise. OMIT the field
   *  entirely (rather than sending `[]`) when the deployment has no industry
   *  taxonomy, so a backend that predates it cannot refuse the save. */
  industries?: string[];
  tags?: string[];
  /** Only `published` presets are listed; `draft` hides one while it is built. */
  status?: "published" | "draft";
  /** Optional only when `media_items[0]` can supply the cover. */
  primary_type?: PresetPrimaryType;
  /** Optional only when `media_items[0]` can supply the cover; absolute URL,
   *  since a relative `/media/...` path is a 400. */
  primary_src?: string;
  /** Optional still; when sent it must also be an absolute URL. */
  thumbnail_url?: string;
  /** Ordered card gallery. The backend accepts at most 20 entries. */
  media_items?: FlowPresetMediaItemInput[];
  /** Client-owned transition hint between gallery images. */
  media_effect?: FlowPresetMediaEffect;
  /** Curated position in the gallery; lower sorts first. */
  sort_order?: number;
  /** Surfaces the card on Flow Home. */
  show_on_home?: boolean;
  /** Home card layout: `primary` (hero) | `secondary` (default when omitted). */
  display_type?: FlowPresetCardType;
  /** The editor's derived description of the graph, stored verbatim. */
  io?: WorkflowIO;
  /** The workflow this is published FROM. One linked template + one linked tool
   *  per workflow — re-saving overwrites rather than duplicates (server-side). */
  workflow_project_id?: string;
}

/** What **Save Tool** publishes — a different record from a template though both
 *  land in the same table: no category, gallery, card layout or sort order.
 *  `status` is explicit because a tool that landed as a draft would 404. */
export interface CreateToolPresetInput extends FlowPresetGraph {
  name: PresetLocalizedText;
  description?: PresetLocalizedText;
  /** Lowercase letters, digits and single dashes; uniqueness is the server's. */
  slug: string;
  /** The card image, when the author picked one. Absolute http(s) URL. */
  thumbnail_url?: string;
  visibility: PresetToolVisibility;
  is_tool: true;
  status: "published";
  /** The ends the author marked on the canvas, in pick order. */
  tool_inputs: FlowPresetIOInput[];
  tool_outputs: FlowPresetIOOutput[];
  io?: WorkflowIO;
  /** Same 1:1 workflow link as CreatePresetInput.workflow_project_id, for the
   *  tool slot (a workflow may hold one linked template AND one linked tool). */
  workflow_project_id?: string;
}

/** Publish a preset — template or tool. One endpoint and one operator gate for
 *  both: they are one table, and `is_tool` discriminates. */
export async function createPreset(
  input: CreatePresetInput | CreateToolPresetInput,
): Promise<FlowPreset> {
  const envelope = await requestPresetAdminApi<FlowPreset>(PRESET_PREFIX, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return envelope.data;
}

/** {@link createPreset}'s bodies minus what an edit must not reset: `status`
 *  and `sort_order` are left out so the stored ones stay. */
export type RepublishPresetInput = (
  | Omit<CreatePresetInput, "status" | "sort_order">
  | Omit<CreateToolPresetInput, "status">
) & {
  /** Optimistic-concurrency check; the server answers `409 flow_version_conflict`. */
  expected_version?: number;
};

/** Republish an existing preset in place — the editor's edit mode. The server
 *  replaces every field sent (the graph included) and keeps the rest. */
export async function republishPreset(
  id: string,
  input: RepublishPresetInput,
): Promise<FlowPreset> {
  const envelope = await requestPresetAdminApi<FlowPreset>(
    `${PRESET_PREFIX}/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
  return normalizePreset(envelope.data ?? {});
}
