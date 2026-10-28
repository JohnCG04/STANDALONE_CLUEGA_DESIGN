// CDP dashboard API client (T03/T16). Calls the tenant-scoped
// /api/v1/dashboards routes; auth token is attached by cdpFetch's default
// "auto" mode. The persisted `schema_json` is the Dashboard Definition v1
// (definition only — no runtime data/state); see BACKEND_CLUEGA_CDP
// internal/domain/dashboard_definition.go.
import { CdpApiError } from "@/lib/cdp/errors";
import { cdpFetch, cdpFetchPaginated } from "@/lib/cdp/fetch";
import type { CdpPageMeta } from "@/lib/cdp/types";
import type { WidgetSlot } from "@/components/dashboard/widgets/types";
import { isIsoDayShape } from "@/components/dashboard/widgets/widgetPeriod";
import { forgetChatDashboard, noteChatDashboardName } from "@/lib/dashboard/chatDashboardNames";
import { OWNER_PRIVATE_SLOT_CONFIG_KEYS } from "@/lib/dashboard/ownerPrivateConfig";
import { toWireAccounts, type AccountsMode, type BoardAccountRef, type WireBoardAccount } from "@/lib/dashboard/boardAccounts";

// A persisted definition slot — the durable subset of WidgetSlot. Runtime
// fields (state / synced_at / data) are NOT persisted; the CDP validator
// rejects unknown slot keys, so they must be stripped before save.
export interface PersistedSlot {
  slot_id: string;
  widget: WidgetSlot["widget"];
  layout: WidgetSlot["layout"];
  binding?: WidgetSlot["binding"];
  config?: unknown;
}

export interface DashboardDefinition {
  definition_version: number;
  slots: PersistedSlot[];
  // Board-level ad account the widgets read from: ONE account when a tenant
  // has many. The definition is where the board keeps it, so a write that drops
  // it loses the board's account. Set from the creating plan; omitted for
  // platforms with no account picker.
  advertiser_id?: string;
  /**
   * That account's own NAME, as the producer resolved it on the turn the board
   * was built — what the header chip says, and the only part of the account a
   * reader recognises.
   *
   * Stored beside the id because the id CANNOT be shown: `AccountChip`
   * guarantees no raw id reaches the screen, so a board that knows only its id
   * has nothing to state and falls back to the word "Ad account". The chat had
   * the name all along (it rides on the `dashboard_widgets` event) and the save
   * dropped it, which is why every board opened from /app/dashboards was
   * anonymous.
   *
   * Omitted when the producer resolved none — a platform with no account-list
   * tool, a failed call, or an id outside the tenant's list.
   */
  advertiser_label?: string;
  /**
   * HOW that account was decided: "only" | "named" | "picked" | "tenant".
   *
   * Travels with the label because it is what makes the disclosure honest:
   * everything but "picked" means the reader never saw a picker, and the chip
   * says so in words. Persisting one without the other would restore the name
   * while silently downgrading the reason to nothing.
   */
  advertiser_match_type?: string;
  /** Every account a multi-account board reads (1..6, exactly one `primary`,
   *  whose id `advertiser_id` repeats). Absent on a single-account board and on
   *  every board saved before the field. */
  accounts?: WireBoardAccount[];
  /** How those accounts are shown; absent reads as "single". */
  accounts_mode?: AccountsMode;
  /** The board's own copies of the datasets its cells read, as the dashboard
   *  MCP stored them. The engine's alone: nothing here builds or edits them, and
   *  a write keeps them as stored (`updateDashboard`). */
  datasets?: unknown;
}

/**
 * Who a board's numbers belong to — the id the data fetch resolves against, the
 * name a reader recognises, and how that account was decided.
 *
 * One argument rather than three loose strings: the name describes the id, and
 * a path that carried one without the others is exactly how the header came to
 * state an account it could not name.
 */
export interface DashboardAccount {
  id?: string;
  label?: string;
  matchType?: string;
  /** A multi-account board's accounts and mode. They travel with the id for the
   *  reason the name does: `PUT /dashboards/:id` replaces the definition
   *  wholesale, so a writer that left them out would turn the board back into
   *  a single-account one. */
  accounts?: readonly BoardAccountRef[];
  accountsMode?: AccountsMode;
}

/**
 * The definition document a write sends. The ONE place it is assembled.
 *
 * It was assembled in three: the chat auto-save built it with `advertiser_id`,
 * and the panel's two writers (the debounced flush and the unmount flush) each
 * built it without. Since `PUT /dashboards/:id` REPLACES `schema_json`
 * wholesale, either panel write erased the account — and the detail page
 * auto-loads on open, so merely OPENING a board dropped it. The next open then
 * had no account to resolve and every widget fetch answered 409
 * account_required: a board that could no longer refill itself.
 *
 * Each key is omitted rather than sent empty when there is nothing to say —
 * platforms with no account picker have no id, and the producer names an
 * account only best-effort. The CDP decoder rejects neither, but "absent" is
 * what it has always meant.
 */
export function buildDashboardDefinition(
  slots: WidgetSlot[],
  account?: DashboardAccount,
): DashboardDefinition {
  return {
    definition_version: 1,
    slots: toPersistedSlots(slots),
    ...(account?.id ? { advertiser_id: account.id } : {}),
    // A label that IS the id is not a name — the producer already strips this
    // case and the chip checks it again, so storing it would only put digits
    // back into a field whose whole purpose is to avoid them.
    ...(account?.label && account.label !== account.id
      ? { advertiser_label: account.label }
      : {}),
    ...(account?.matchType ? { advertiser_match_type: account.matchType } : {}),
    ...boardAccountsFields(account),
  };
}

/**
 * A board's `accounts` and `accounts_mode` as they are written: by the
 * definition, and by the stored render the public share draws from (a share
 * reader gets no definition, so the snapshot has to say whose numbers each
 * band, series and row is).
 *
 * Only a board over two or more accounts states them: one account IS the
 * legacy single board, and writing it twice would only add a field to keep in
 * step.
 */
function boardAccountsFields(account?: DashboardAccount): Pick<DashboardDefinition, "accounts" | "accounts_mode"> {
  return account?.accounts && account.accounts.length >= 2
    ? { accounts: toWireAccounts(account.accounts), accounts_mode: "compare" }
    : {};
}

// toPersistedSlots drops runtime fields and omits binding for structural widgets
// (section_header / live_status_bar / note) — the validator forbids a binding there.
const STRUCTURAL_WIDGETS = new Set(["section_header", "live_status_bar", "note"]);
export function toPersistedSlots(slots: WidgetSlot[]): PersistedSlot[] {
  return slots.map((s) => {
    const persisted: PersistedSlot = {
      slot_id: s.slot_id,
      widget: s.widget,
      layout: s.layout,
    };
    if (!STRUCTURAL_WIDGETS.has(s.widget) && s.binding) persisted.binding = s.binding;
    if (s.config !== undefined) persisted.config = s.config;
    return persisted;
  });
}

// The point-in-time rendered result (widget slots WITH data/state), stored
// separately from the declarative definition (PRD v1.2 §6.5). A multi-account
// board's render also carries its accounts and mode, the same fields the
// definition stores (`boardAccountsFields`): a public share reads this render
// alone, and without them its per-account cards drew as one account.
export interface DashboardSnapshot {
  slots: WidgetSlot[];
  accounts?: WireBoardAccount[];
  accounts_mode?: AccountsMode;
}

// A snapshot state that says something about the LAST REQUEST rather than about
// the board. `loading` is a frame of an animation; the other four are what
// `widgetStateForError` returns when a fetch never produced a slot.
//
// None of them may be stored. The detail page auto-loads every `empty` slot on
// open (`needsDataFetch`), so a refused request wrote `error` over the widget
// AND OVER ITS ELIGIBILITY: `error` is not re-asked, so the board kept
// "Temporarily unable to load data" for good — one bad minute froze a board
// permanently (BUG-28-RD-T-06). Written back as `empty`, the next open asks
// again, which is what a transport failure deserves.
//
// `ok_stale` is NOT here: it carries the last good numbers and is a statement
// about the data, which is exactly what a snapshot is for.
const UNSTORABLE_SNAPSHOT_STATES = new Set([
  "loading",
  "error",
  "timeout",
  "quota_exceeded",
  "unauthorized",
]);

/**
 * The slots a snapshot may store — the render, without the verdict of the one
 * request that failed.
 *
 * Exported for its own test; `saveDashboardSnapshot` is the only caller, on
 * purpose. Five call sites persist snapshots and each would otherwise need to
 * remember this rule.
 */
export function toSnapshotSlots(slots: WidgetSlot[]): WidgetSlot[] {
  return slots.map((slot) => {
    const config = withoutSnapshotOnlyConfig(slot.config);
    const state = UNSTORABLE_SNAPSHOT_STATES.has(slot.state ?? "")
      ? ("empty" as const)
      : slot.state;
    // Same object when nothing had to change, so a snapshot write of an
    // untouched board produces byte-identical slots.
    if (state === slot.state && config === slot.config) return slot;
    return { ...slot, state, config };
  });
}

/**
 * Config a SNAPSHOT must not carry.
 *
 * `alert_rule` is the owner's private setting on their own board. A snapshot is
 * not private: the owner's refresh stores it, and the backend mirrors that same
 * stored render onto an active public share — so a rule left in here would
 * publish the owner's metric, operator and threshold to anyone holding the
 * link, and (before the display capability existed) paint a red alert on a
 * stranger's screen about a number they cannot act on.
 *
 * The rule is definition-owned anyway (`applyDefinitionOwnedConfig`), so
 * dropping it here costs the owner nothing: reopening reads it back from the
 * definition, which is where it lives.
 *
 * The keys come from `OWNER_PRIVATE_SLOT_CONFIG_KEYS`, the list the reopen
 * merge reads too — and the backend's share mirror strips the same ones.
 *
 * Everything else in config is left exactly as it was — the label, the value,
 * the series, the reader's `conditions` — because a snapshot is the render and
 * those are the render.
 */
function withoutSnapshotOnlyConfig(config: unknown): unknown {
  if (!config || typeof config !== "object") return config;
  const record = config as Record<string, unknown>;
  if (!OWNER_PRIVATE_SLOT_CONFIG_KEYS.some((key) => key in record)) return config;
  const next = { ...record };
  for (const key of OWNER_PRIVATE_SLOT_CONFIG_KEYS) delete next[key];
  return next;
}

/**
 * The advertising objective a board reports on — the canonical vocabulary,
 * shared with the backend's `domain.ReportPurposes` and the CDP storage CHECK
 * constraint.
 *
 * NOT a layout archetype. `archetype` ("performance", "comparison") describes
 * how a board is ARRANGED and travels on the same chat event; the two are
 * different vocabularies and must never be assigned across. Nothing in this app
 * derives a purpose from a dashboard's name, slug, label or metrics — the value
 * comes from a Market-insights card's own declared category, or it is absent.
 */
export const DASHBOARD_REPORT_PURPOSES = [
  "reach",
  "traffic",
  "video",
  "leads",
  "community",
  "app",
  "sales",
  "other",
] as const;

export type DashboardReportPurpose = (typeof DASHBOARD_REPORT_PURPOSES)[number];

/** Whether a value off the wire is a purpose this build knows. */
export function isDashboardReportPurpose(value: unknown): value is DashboardReportPurpose {
  return (
    typeof value === "string" &&
    (DASHBOARD_REPORT_PURPOSES as readonly string[]).includes(value)
  );
}

export interface Dashboard {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  schema_json: DashboardDefinition;
  data_snapshot?: DashboardSnapshot | null;
  current_version: number;
  /**
   * Whether the CALLING user starred this board — a personal flag, not a
   * property of the dashboard (a shared board is starred by one reader and not
   * another). The server always sends it; optional here so a response from a
   * backend that predates the field is missing, not `false`, and so adding it
   * could not break a caller that never asked.
   *
   * Read it through `isDashboardFavorite`, which resolves that difference once.
   */
  is_favorite?: boolean;
  /**
   * The chat session that generated this board, for a later "View
   * conversation" action.
   *
   * Three states, deliberately distinct: a uuid, `null` (the server says this
   * board has no recorded conversation), and absent (a server that predates
   * this contract said nothing). Optional AND nullable so both of the last two
   * are representable — during rollout a client will see responses of either
   * shape, and neither may be read as the other.
   *
   * Never reconstructed from the `chat-{uuid}` slug. The slug is an idempotency
   * key that also has a message-id form for boards saved before a session
   * existed; parsing it back would invent an origin for exactly the boards that
   * have none. The explicit field is the contract.
   */
  source_session_id?: string | null;
  /**
   * What this board reports on. Same three states as `source_session_id`.
   *
   * `null` and `"other"` are different: null means no purpose was ever
   * recorded (every board written before this contract), `"other"` means a run
   * classified the board and found no specific objective.
   */
  report_purpose?: DashboardReportPurpose | null;
  created_at: string;
  updated_at: string;
}

/** The star as a boolean, with "the server did not say" meaning "not starred". */
export const isDashboardFavorite = (dashboard: Dashboard): boolean =>
  dashboard.is_favorite ?? false;

const BASE = "/api/v1/dashboards";

/**
 * How the personal dashboard lists may be ordered.
 *
 * ONE token per offered ordering rather than a field/direction pair, because
 * that is what the URL carries and what a menu item maps to. The server's
 * contract is the pair, and `DASHBOARD_SORT_WIRE` below is the only place the
 * two vocabularies meet — so a token the server does not offer cannot be built.
 */
export type DashboardListSort = "recent" | "oldest" | "name_asc" | "name_desc";

/** The offered orderings, in the order a menu should list them. */
export const DASHBOARD_LIST_SORTS: readonly DashboardListSort[] = [
  "recent",
  "oldest",
  "name_asc",
  "name_desc",
] as const;

/**
 * The default, and the one value that is NEVER put on the wire.
 *
 * `recent` is what the list has always answered, so a request that omits the
 * pair entirely is byte-identical to one from before this parameter existed.
 */
export const DASHBOARD_LIST_SORT_DEFAULT: DashboardListSort = "recent";

/** Each token's `sort_by` / `sort_order` pair, as the route spells them. */
export const DASHBOARD_SORT_WIRE: Readonly<
  Record<DashboardListSort, { sort_by: "updated_at" | "name"; sort_order: "asc" | "desc" }>
> = Object.freeze({
  recent: { sort_by: "updated_at", sort_order: "desc" },
  oldest: { sort_by: "updated_at", sort_order: "asc" },
  name_asc: { sort_by: "name", sort_order: "asc" },
  name_desc: { sort_by: "name", sort_order: "desc" },
});

export function isDashboardListSort(value: unknown): value is DashboardListSort {
  return typeof value === "string" && (DASHBOARD_LIST_SORTS as readonly string[]).includes(value);
}

export interface ListDashboardsParams {
  /** 1-based. */
  page: number;
  /** Rows per page; the API rejects < 1 or > 100. */
  pageSize: number;
  /** Server-side search over name, slug and platform slug. Blank = no filter. */
  query?: string;
  /**
   * How to order the WHOLE filtered set, before the page window.
   *
   * Omitted, or the default, sends nothing: the route then answers in its
   * historical order, so this stays additive for every existing caller. There is
   * deliberately no client-side fallback — sorting the page the server sent
   * would order a slice rather than the set, and the pager would describe one
   * ordering while the rows showed another.
   */
  sort?: DashboardListSort;
  /**
   * `true` asks for only the boards this user starred — the Saved tab.
   *
   * Omitted means no favourite filter, which is what every existing caller
   * sends and what keeps their behaviour identical. `false` is deliberately NOT
   * sent as a filter: the server reads absent and `favorite=false` the same way,
   * so putting it on the wire would only imply a distinction that is not there.
   */
  favorite?: boolean;
  /**
   * Narrows to boards binding this app in at least one slot — the identifier as
   * persisted in `schema_json.slots[].binding.app`, e.g. "tiktok_ads".
   *
   * Server-side, so the count and the pager keep describing the filtered set.
   * Blank or omitted is no filter, which is what every caller that predates
   * this sends. The server matches exactly and case-insensitively and rejects a
   * malformed identifier with a 400, so there is nothing to normalise here.
   */
  platform?: string;
  /**
   * Narrows to boards recorded as reporting on this advertising objective.
   *
   * Server-side, like `platform` and for the same reason: the filter runs in
   * SQL inside the scope the COUNT is built from, so the total and the pager
   * keep describing the filtered set. Filtering a returned page here would
   * leave both describing a different set from the rows on screen.
   *
   * Typed as `DashboardReportPurpose` — the vocabulary this module already
   * declares and the server validates against — so a value the API would
   * reject with a 400 cannot be built. Omitted means no purpose filter, which
   * is what "All" sends and what every caller that predates this sends.
   *
   * A board with NO recorded purpose is matched by no value, `"other"`
   * included: never-recorded and recorded-as-unspecific are different states
   * and the server keeps them apart.
   */
  purpose?: DashboardReportPurpose;
  signal?: AbortSignal;
}

export interface ListDashboardsResult {
  items: Dashboard[];
  pagination: CdpPageMeta;
}

/**
 * One page of the caller's dashboards, searched server-side.
 *
 * `page_no`/`limit` are the house pagination vocabulary (response.PageMeta),
 * not page/page_size — same spelling every other paginated CDP route uses, so
 * this reads like listProducts.
 *
 * Sending either parameter is what switches the API to the paginated envelope;
 * the by-slug lookup below deliberately sends neither.
 */
export async function listDashboards({
  page,
  pageSize,
  query,
  favorite,
  platform,
  purpose,
  sort,
  signal,
}: ListDashboardsParams): Promise<ListDashboardsResult> {
  // The default is absent on the wire, not spelled out: "no preference" and
  // "newest first" are the same request, and keeping them identical is what
  // makes this parameter additive.
  const wire = sort && sort !== DASHBOARD_LIST_SORT_DEFAULT ? DASHBOARD_SORT_WIRE[sort] : undefined;
  const { data, pagination } = await cdpFetchPaginated<Dashboard[], CdpPageMeta>(BASE, {
    method: "GET",
    signal,
    searchParams: {
      page_no: page,
      limit: pageSize,
      // Blank is omitted rather than sent empty: "no search" and "search for
      // nothing" must not look different on the wire.
      q: query?.trim() || undefined,
      // Only ever "true". See `favorite` above: absent IS the unfiltered case.
      favorite: favorite ? "true" : undefined,
      // Blank is omitted rather than sent empty, exactly as `q` is: "every
      // platform" and "the platform named nothing" must not look different.
      platform: platform?.trim() || undefined,
      // Same omit-when-absent rule as `q` and `platform`. The server reads a
      // blank purpose as "no filter", so sending one would be a longer way of
      // saying nothing — and "All" must be indistinguishable from a caller
      // that never knew about this parameter.
      purpose: purpose || undefined,
      // Always both or neither: the route rejects half a pair, which is what
      // stops a direction being applied to a field nobody named.
      sort_by: wire?.sort_by,
      sort_order: wire?.sort_order,
    },
  });
  return { items: data ?? [], pagination };
}

/**
 * The stored length of a slug under the backend's OLD rule, which silently cut
 * every slug to 40 characters. `chat-` plus a 36-character session id is 41, so
 * every chat board filed before that rule was replaced sits under its first 40
 * characters. The backend now refuses a slug over 64 instead of cutting it, so
 * no NEW row is stored this way — but the old rows are still there.
 */
const LEGACY_SLUG_CUT = 40;

/**
 * The one board a slug names, or null.
 *
 * The server canonicalises the slug before matching (it lowercases and folds
 * it), so the answer is about the board as FILED, not as we spelled it. That is
 * the point of asking rather than matching locally: a board filed under the old
 * 40-character cut is stored under a slug the browser never built, and a local
 * match found nothing while the board sat in the menu.
 *
 * Replaces an unpaginated read of EVERY dashboard — each carrying its full
 * definition and data snapshot — performed on every panel open.
 */
export async function findDashboardBySlug(
  slug: string,
  signal?: AbortSignal,
): Promise<Dashboard | null> {
  const rows = await cdpFetch<Dashboard[]>(BASE, {
    method: "GET",
    signal,
    searchParams: { slug },
  });
  const row = rows?.[0];
  if (!row) return null;
  // A server that does not know `slug` ignores it and answers with the whole
  // list, whose first row is an unrelated board. Adopting that would point this
  // chat at someone else's dashboard and start overwriting it, so the answer
  // has to be checked rather than trusted.
  //
  // Every caller spells slugs in the folded alphabet (`chat-` plus a uuid), so
  // folding is the identity and the row is either this slug exactly, or — for
  // a board filed before the 64-character rule — its 40-character legacy cut.
  // Any other prefix (a row whose slug merely starts the same way) is not the
  // board we named.
  const wanted = slug.toLowerCase();
  if (row.slug === wanted) return row;
  if (row.slug.length === LEGACY_SLUG_CUT && wanted.startsWith(row.slug)) return row;
  return null;
}

export function getDashboard(id: string, signal?: AbortSignal): Promise<Dashboard> {
  return cdpFetch<Dashboard>(`${BASE}/${encodeURIComponent(id)}`, { method: "GET", signal });
}

/**
 * Manual creation from the dashboards menu.
 *
 * Deliberately carries NO origin metadata, and takes none: a board made from
 * the menu was not produced by a conversation and reports on no objective
 * anyone declared. Both fields come back null, which is the honest answer —
 * inventing a purpose here (from the name the user typed, say) is exactly the
 * inference the contract forbids.
 */
export function createDashboard(input: {
  name: string;
  schema_json?: DashboardDefinition;
}): Promise<Dashboard> {
  return cdpFetch<Dashboard>(BASE, {
    method: "POST",
    body: {
      name: input.name,
      schema_json: input.schema_json ?? { definition_version: 1, slots: [] },
    },
  });
}

// Session-scoped auto-save (KB3, v1.2 §2.3): idempotent by slug. First call for a
// slug creates; later calls update in place (new version), keeping the name. The
// FE derives the slug from the chat session so one conversation owns one board.
//
// `expected_version` is the same COMPARE-AND-SWAP `updateDashboard` states: the
// `current_version` this save was made against. When the slug already names a
// board that has moved past it, the server answers 409 instead of writing this
// definition over an edit the chat never saw (the reader's panel, another tab).
// Omitted — the first save of a session, which has no version to state — the
// write is unconditional, exactly as it always was.
export async function upsertDashboard(input: {
  name: string;
  slug: string;
  schema_json?: DashboardDefinition;
  /** The chat session that produced this board. */
  source_session_id?: string | null;
  /** What the board reports on, from the event that produced it. */
  report_purpose?: DashboardReportPurpose | null;
  /** The version this save was made against; see above. */
  expected_version?: number;
}): Promise<Dashboard> {
  const saved = await cdpFetch<Dashboard>(`${BASE}/upsert`, {
    method: "POST",
    body: {
      name: input.name,
      slug: input.slug,
      schema_json: input.schema_json ?? { definition_version: 1, slots: [] },
      // OMITTED, never sent as null, when there is nothing to say. The server
      // reads an absent key as "the caller did not mention this" and leaves the
      // stored value alone; sending null would be indistinguishable from that
      // today but is a different statement, and a manual create must not appear
      // to assert one. This is also what keeps a board's origin from being
      // cleared by a later save that simply does not know it.
      ...(input.source_session_id ? { source_session_id: input.source_session_id } : {}),
      ...(input.report_purpose ? { report_purpose: input.report_purpose } : {}),
      // A number or nothing: a missing key is the unconditional first save.
      ...(typeof input.expected_version === "number"
        ? { expected_version: input.expected_version }
        : {}),
    },
  });
  // The server keeps the stored name on update, so this is the board's real
  // name — including a rename made since — and the chat titles itself by it.
  noteChatDashboardName(saved);
  return saved;
}

/**
 * The binding fields the dashboard MCP owns: the dataset a cell reads, at its
 * version (`dataset:<id>@<n>` in `app` or `source`), and the accounts it reads
 * there (`account_ids`, or several datasets' `members`). Only the MCP changes
 * them (`propose_changes`, a refresh moving to a dataset's next version), so a
 * definition this app writes states them as the board stores them now.
 */
const ENGINE_BINDING_KEYS = ["app", "source", "account_ids", "members"] as const;

/** A stored binding the MCP wrote: it reads a dataset, on its own or as a member. */
function isEngineBinding(binding: Record<string, unknown>): boolean {
  const dataset = (source: unknown) => typeof source === "string" && source.startsWith("dataset:");
  return dataset(binding.app) || dataset(binding.source)
    || (Array.isArray(binding.members) && binding.members.some((m) => dataset((m as { source?: unknown } | null)?.source)));
}

/**
 * `next` over the board's STORED definition: everything as `next` states it —
 * the order, places and sizes, the reader's configs (alert rules, labels),
 * structural cells, a cell's own window — except what the MCP owns, kept as
 * stored: the board's `datasets` and the engine binding fields
 * (`ENGINE_BINDING_KEYS`) of each stored cell that reads a dataset. Without it
 * a write from a copy held since the board was opened dropped the datasets and
 * put a refreshed board back on its first dataset versions, and the MCP could
 * no longer read the board it published.
 */
export function keepEngineParts(next: DashboardDefinition, stored: unknown): DashboardDefinition {
  if (typeof stored !== "object" || stored === null) return next;
  const { datasets, slots } = stored as { datasets?: unknown; slots?: unknown };
  const bindings = new Map<string, Record<string, unknown>>();
  for (const slot of Array.isArray(slots) ? slots : []) {
    const { slot_id: id, binding } = (slot ?? {}) as { slot_id?: unknown; binding?: unknown };
    if (typeof id === "string" && typeof binding === "object" && binding !== null
      && isEngineBinding(binding as Record<string, unknown>)) {
      bindings.set(id, binding as Record<string, unknown>);
    }
  }
  const kept: DashboardDefinition = {
    ...next,
    slots: next.slots.map((slot) => {
      const was = bindings.get(slot.slot_id);
      if (!was || !slot.binding) return slot;
      const binding: Record<string, unknown> = { ...(slot.binding as object) };
      for (const key of ENGINE_BINDING_KEYS) {
        if (key in was) binding[key] = was[key];
        else delete binding[key];
      }
      return { ...slot, binding: binding as unknown as PersistedSlot["binding"] };
    }),
  };
  if (datasets !== undefined) kept.datasets = datasets;
  return kept;
}

/**
 * Replace a board's definition.
 *
 * `expectedVersion` is COMPARE-AND-SWAP: the `current_version` this edit was
 * made against. The server refuses with 409 when the board has moved, instead
 * of layering this definition over an edit the caller never saw — which is
 * what two tabs, or a tab and a chat turn, did to each other before the field
 * existed. Omitted, the write is unconditional and unprotected; every caller
 * that can hold a stale copy should send it.
 *
 * A board the dashboard MCP wrote (a cell reading a dataset) is written
 * read-modify-write: the stored definition is read first and what the MCP
 * owns is written as stored (`keepEngineParts`). The version stated is still
 * the caller's — the read never decides what this write may overwrite — so a
 * board that moved since is refused as before. Any other board is written as
 * built: nothing in it is the MCP's.
 */
export async function updateDashboard(
  id: string,
  schema: DashboardDefinition,
  expectedVersion?: number,
  // Ends this client's wait for the write (`definitionWrites.ts` aborts it past
  // its time limit). The server may still apply a body it has received.
  options?: { signal?: AbortSignal },
): Promise<Dashboard> {
  const path = `${BASE}/${encodeURIComponent(id)}`;
  const signal = options?.signal ? { signal: options.signal } : {};
  const engineBoard = schema.slots.some((slot) =>
    typeof slot.binding === "object" && slot.binding !== null && isEngineBinding(slot.binding as unknown as Record<string, unknown>));
  const stored = engineBoard ? (await cdpFetch<Dashboard>(path, { method: "GET", ...signal }))?.schema_json : undefined;
  return cdpFetch<Dashboard>(path, {
    method: "PUT",
    ...signal,
    body: {
      schema_json: keepEngineParts(schema, stored),
      ...(typeof expectedVersion === "number" ? { expected_version: expectedVersion } : {}),
    },
  });
}

export async function renameDashboard(id: string, name: string): Promise<Dashboard> {
  const renamed = await cdpFetch<Dashboard>(`${BASE}/${encodeURIComponent(id)}/name`, {
    method: "PATCH",
    body: { name },
  });
  // Every rename surface goes through here, so the conversation that produced
  // the board picks the new name up without being reloaded (BUG-45-RD-N-10).
  noteChatDashboardName(renamed);
  return renamed;
}

export function duplicateDashboard(id: string): Promise<Dashboard> {
  return cdpFetch<Dashboard>(`${BASE}/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });
}

// Stores the point-in-time rendered result (full runtime slots) so reopening
// the dashboard shows the last-known numbers without re-querying (PRD §6.5).
export function saveDashboardSnapshot(
  id: string,
  slots: WidgetSlot[],
  // The DEFINITION this render came from. A snapshot carries no version of its
  // own, so one written after an edit is stored as the current picture of a
  // board whose bindings it no longer matches, and nothing downstream can tell.
  expectedVersion?: number,
  // The board's accounts, for the render a public share draws (see
  // `DashboardSnapshot`). Absent or one account: the snapshot is slots only.
  account?: DashboardAccount,
): Promise<Dashboard> {
  return cdpFetch<Dashboard>(`${BASE}/${encodeURIComponent(id)}/snapshot`, {
    method: "PUT",
    body: {
      // `toSnapshotSlots`, never the board as it stands: a failed fetch is a
      // fact about one request, and storing its verdict is what froze boards
      // in "Temporarily unable to load data".
      snapshot: { slots: toSnapshotSlots(slots), ...boardAccountsFields(account) },
      ...(typeof expectedVersion === "number" ? { expected_version: expectedVersion } : {}),
    },
  });
}

/**
 * Star or unstar one dashboard for the calling user.
 *
 * The reply is the dashboard with the AUTHORITATIVE `is_favorite`, which is what
 * callers should write back — an optimistic flip is a guess until the server
 * agrees. Idempotent: sending the state a board is already in succeeds.
 */
export function setDashboardFavorite(id: string, favorite: boolean): Promise<Dashboard> {
  return cdpFetch<Dashboard>(`${BASE}/${id}/favorite`, {
    method: "PATCH",
    body: { is_favorite: favorite },
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  await cdpFetch<void>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  forgetChatDashboard(id);
}

// ---- Public share link (T23/T24/T25) --------------------------------------

// The owner-facing view of a dashboard's 1:1 share link. tenant_id + token
// build the public URL; the password itself is never returned, only whether one
// guards the link.
export interface DashboardShareState {
  token: string;
  tenant_id: string;
  has_password: boolean;
  disabled: boolean;
  /**
   * When the link stops working, or null for one that stays open until it is
   * revoked. An RFC 3339 instant in UTC.
   *
   * OPTIONAL ON THE WIRE, deliberately. A response served during a rollout —
   * an older backend, a cached page — simply has no such field, and `undefined`
   * has to be readable as "this build does not know" rather than as "never
   * expires". `expired` below is what the UI keys off, and it defaults false.
   */
  expires_at?: string | null;
  /**
   * Whether the link has already passed that instant — decided by the DATABASE,
   * against the same NOW() the public route is filtered on.
   *
   * NOT DERIVED HERE, and not merely shown either: the modal blanks the share
   * URL and disables Copy from this flag, so it has to agree with whether the
   * public route will actually serve the link. Comparing `expires_at` to
   * `new Date()` in the browser would be a third clock behind the two that
   * already have to match — the owner's machine is not evidence about a link a
   * stranger will open. Read this; never recompute it.
   */
  expired?: boolean;
  /**
   * WHICH LIFETIME THE OWNER CHOSE, in the same shape `shareDashboard` takes,
   * so re-opening the modal restores that choice instead of its default.
   *
   * NOT DERIVABLE FROM `expires_at`. A 90-day link opened a week later has 83
   * days to run, which is no preset at all — reading the radio back off the
   * remaining interval is the guess that used to turn Regenerate into a silent
   * downgrade to 30 days.
   *
   * Optional on the wire for the same reason `expires_at` is: an older backend
   * simply has no such field, and `undefined` must read as "this build does not
   * know" rather than as any particular choice. A link minted before the policy
   * column existed comes back as `never` or `date` — never as a preset, because
   * the originating preset is exactly what cannot be recovered.
   */
  policy?: DashboardShareExpiration | null;
}

/**
 * How long a new link should live — the five choices the modal offers.
 *
 * Sent as an explicit object rather than as a bare number of days so "never"
 * is a thing the owner SAYS. An omitted expiration means an older client, and
 * the backend answers that with the 30-day default rather than an immortal
 * link; only `{ mode: "never" }` turns expiry off.
 */
export type DashboardShareExpiration =
  | { mode: "days"; days: 7 | 30 | 90 }
  /** `expires_at` is absolute UTC, computed by the caller from a local date. */
  | { mode: "date"; expires_at: string }
  | { mode: "never" };

/** The preset the modal starts on, and what the server applies if none is sent. */
export const DASHBOARD_SHARE_DEFAULT_DAYS = 30 as const;

/** The ceiling on a custom date, enforced again server-side. */
export const DASHBOARD_SHARE_MAX_DAYS = 365 as const;

/**
 * Turn a calendar date the owner picked into the instant to send.
 *
 * END OF THAT DAY, IN THEIR OWN TIMEZONE. "31 December" means the whole of the
 * 31st where the owner is standing — not 00:00 UTC, which for anyone east of
 * London would kill the link a day early. `new Date(y, m, d, 23, 59, 59)` is
 * local by construction, and `toISOString()` converts it to the absolute UTC
 * instant the server stores. The stored timestamp is the same moment however it
 * is later displayed.
 *
 * Returns null for a date that is not a date, which is what keeps a
 * half-typed input from being submitted.
 */
export function dashboardShareExpiryFromLocalDate(value: string): string | null {
  const day = value.trim();
  if (!isIsoDayShape(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const local = new Date(year, month - 1, date, 23, 59, 59, 999);
  if (Number.isNaN(local.getTime())) return null;
  // A rolled-over date (31 February) is not the day that was typed.
  if (local.getMonth() !== month - 1 || local.getDate() !== date) return null;
  return local.toISOString();
}

/**
 * The local calendar date `at` falls on, as the `YYYY-MM-DD` an `<input
 * type="date">` speaks.
 *
 * Built from the local field getters rather than from `toISOString()` (which is
 * UTC) or from `Intl` (which is a reader's formatting, not a value). For an
 * owner in Asia/Bangkok at 07:00 those two disagree by a day, and the input
 * label has to be the day the owner thinks it is.
 *
 * Exported for the share modal, which reads a stored custom date back into the
 * same input — one spelling for the bounds and for the value.
 */
export function localDateLabel(at: Date): string {
  const y = String(at.getFullYear()).padStart(4, "0");
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** End of the local day `at` falls on — the instant that date would be sent as. */
function endOfLocalDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59, 999);
}

/**
 * The ceiling a custom date is measured against: `now` + 365 days.
 *
 * Plain millisecond arithmetic, matching the server's `now.AddDate(0, 0, 365)`
 * on a UTC time exactly — UTC has no DST, so there calendar days and 24-hour
 * days are the same thing. The LOCAL side of this feature is only ever the
 * calendar date the owner points at; the ceiling itself is an absolute instant
 * and must not be computed in local calendar terms, or a client in a zone that
 * shifts its clocks would offer a date the server then refuses.
 */
function customDateCeiling(now: Date): number {
  return now.getTime() + DASHBOARD_SHARE_MAX_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The range to put on the date input, as local calendar dates.
 *
 * DERIVED FROM THE SAME RULE THE VALIDATOR APPLIES, not hand-picked, because a
 * `max` the validator or the server would then reject is worse than no `max` at
 * all: the picker would present a date as selectable and the modal would refuse
 * it. Both ends are therefore computed by asking which calendar date's
 * END-OF-DAY instant still satisfies the rule.
 *
 *   - `min`  today, unless the day is so nearly over that its end-of-day is no
 *            longer in the future, in which case tomorrow.
 *   - `max`  the day the ceiling falls on, stepped back one when that day's
 *            end-of-day would overshoot the ceiling — which is the normal case,
 *            since the ceiling lands at the current time of day and 23:59:59.999
 *            is later than that.
 *
 * Stepping is done through the Date constructor's field normalisation
 * (`day + 1`), never by adding 86,400,000 ms, so a DST change cannot slide the
 * answer onto the wrong calendar day.
 */
export function dashboardShareCustomDateBounds(now: Date): { min: string; max: string } {
  let min = endOfLocalDay(now);
  if (min.getTime() <= now.getTime()) {
    min = new Date(min.getFullYear(), min.getMonth(), min.getDate() + 1, 23, 59, 59, 999);
  }

  const ceiling = customDateCeiling(now);
  let max = endOfLocalDay(new Date(ceiling));
  if (max.getTime() > ceiling) {
    max = new Date(max.getFullYear(), max.getMonth(), max.getDate() - 1, 23, 59, 59, 999);
  }

  return { min: localDateLabel(min), max: localDateLabel(max) };
}

/**
 * The instant to send for a custom date, or null when that date may not be sent.
 *
 * THIS IS THE LAYER THE MODAL ASKS. `dashboardShareExpiryFromLocalDate` answers
 * only "is this a day that exists, and when does it end" — it will happily
 * convert 1999 or a date ten years out. The POLICY lives here: strictly future,
 * and no later than 365 days away, which is the same pair of comparisons
 * `domain.ShareExpiration.Resolve` makes against the same converted instant.
 *
 * `now` is a parameter, not `new Date()`, so the boundary cases can be pinned
 * by a test instead of depending on when it runs.
 *
 * NOT SECURITY. A browser that skips this, or lies about its clock, gets a 400
 * from the server, and the public page is filtered in SQL against the
 * database's NOW() regardless. This exists so the owner is told the rule by the
 * form instead of by a failed request.
 */
export function dashboardShareCustomDateExpiry(value: string, now: Date): string | null {
  const iso = dashboardShareExpiryFromLocalDate(value);
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  // Strictly after: a deadline equal to "now" is already past.
  if (at <= now.getTime()) return null;
  if (at > customDateCeiling(now)) return null;
  return iso;
}

// Returns the live link, or null when the dashboard has never been shared / was
// revoked (a 404 is the normal "not shared" answer, not a failure).
export async function getDashboardShare(id: string): Promise<DashboardShareState | null> {
  try {
    return await cdpFetch<DashboardShareState>(`${BASE}/${encodeURIComponent(id)}/share`, {
      method: "GET",
    });
  } catch (err) {
    if (err instanceof CdpApiError && err.status === 404) return null;
    throw err;
  }
}

// Creates or replaces the link, freezing the dashboard's current render snapshot
// onto it. A non-empty password gates the public page; re-sharing rotates the
// token AND replaces the expiration.
//
// `expiration` is required: the owner always chose one in the modal, and a
// re-share replaces the stored expiry wholesale, so leaving it to the server's
// 30-day default would silently rewrite a 90-day or never-expiring link. (The
// server still applies that default to an older client that omits it.)
export function shareDashboard(
  id: string,
  password: string | undefined,
  expiration: DashboardShareExpiration,
): Promise<DashboardShareState> {
  return cdpFetch<DashboardShareState>(`${BASE}/${encodeURIComponent(id)}/share`, {
    method: "POST",
    body: { password: password ?? "", expiration },
  });
}

// Revokes the link; the public page then 404s.
export async function disableDashboardShare(id: string): Promise<void> {
  await cdpFetch<void>(`${BASE}/${encodeURIComponent(id)}/share`, { method: "DELETE" });
}

// The URL a reader opens: the (share) route group renders it read-only from the
// stored share snapshot. Empty on the server (no window/origin).
export function dashboardShareUrl(state: Pick<DashboardShareState, "tenant_id" | "token">): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/share/dashboard/${encodeURIComponent(state.tenant_id)}/${encodeURIComponent(state.token)}`;
}

// ---- Version history (BUG-44-RD-N-09) -------------------------------------

/**
 * One entry of a board's append-only definition history.
 *
 * `snapshot_json` is the DEFINITION as it stood at that version — the same
 * document `schema_json` holds — not a render. The backend stores
 * `dashboard_versions` from `schema_json`, so nothing in here carries numbers,
 * `state` or `synced_at`.
 *
 * `actor_user_id` is a raw uuid and is deliberately NOT surfaced as a name:
 * there is no actor-directory contract to resolve it against, and printing a
 * uuid where a reader expects a person is worse than printing nothing. Kept on
 * the type because the server sends it and the field will be worth rendering
 * once such a contract exists.
 *
 * Optional rather than nullable, matching the Go DTO's `omitempty`: the key is
 * absent when the version has no recorded actor.
 */
export interface DashboardVersion {
  version: number;
  actor_user_id?: string;
  snapshot_json: DashboardDefinition;
  created_at: string;
}

/**
 * Every recorded version of one board's definition, newest first.
 *
 * The server already orders it — the ordering is not re-derived here, and no
 * version number is invented: what comes back IS the history. An empty body
 * (a 204 from a backend with nothing to say) becomes `[]` rather than
 * undefined, so callers may always iterate.
 */
export async function listDashboardVersions(
  dashboardId: string,
  signal?: AbortSignal,
): Promise<DashboardVersion[]> {
  const rows = await cdpFetch<DashboardVersion[]>(
    `${BASE}/${encodeURIComponent(dashboardId)}/versions`,
    { method: "GET", signal },
  );
  return rows ?? [];
}

/**
 * Re-applies a prior version's definition as a NEW version.
 *
 * Append-only: the history is never rewritten or truncated, so rolling back to
 * version 3 of a board at version 5 leaves 3, 4 and 5 in place and files the
 * restored definition as 6. Rolling forward again is therefore just another
 * rollback.
 *
 * The reply is the AUTHORITATIVE dashboard — its `current_version`,
 * `schema_json` and `updated_at` are what the board now is. Callers must adopt
 * it rather than patching their own copy: the new version number is the
 * server's to assign, and guessing it is what would make the next
 * compare-and-swap write fail.
 *
 * Deliberately carries no `expected_version`: this endpoint takes only the
 * target version, and the definition it writes is one the board already had.
 */
export function rollbackDashboard(dashboardId: string, version: number): Promise<Dashboard> {
  return cdpFetch<Dashboard>(`${BASE}/${encodeURIComponent(dashboardId)}/rollback`, {
    method: "POST",
    body: { version },
  });
}

/** The board's "sources and accounts" card, built from its own definition (POST /dashboard/scope). */
export interface DashboardScopeRequest {
  board_id: string;
  sources: string[];
  accounts: Array<{ source: string; id: string }>;
  accounts_mode: "single" | "switch" | "compare" | null;
  locale: string;
}

export interface DashboardScopeResponse {
  board_id: string;
  accounts_mode: "single" | "switch" | "compare" | null;
  /** The same `dashboard_scope` field the chat card gets; parse it with `parseDashboardScope`. */
  field: { label?: string; scope?: unknown };
  lost_accounts: Array<{ source: string; id: string }>;
}

export function fetchDashboardScope(input: DashboardScopeRequest, signal?: AbortSignal): Promise<DashboardScopeResponse> {
  return cdpFetch<DashboardScopeResponse>("/api/v1/dashboard/scope", { method: "POST", body: input, signal });
}
