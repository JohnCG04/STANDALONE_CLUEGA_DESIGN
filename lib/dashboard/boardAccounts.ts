/**
 * A board over SEVERAL ad accounts (contract 2026-10-10): which accounts it
 * reads, how it shows them, and the pure rules every surface draws them by.
 *
 * Stored on the definition beside the legacy single account:
 * `accounts: [{source, id, name, currency, timezone, primary}]` (1..6, unique
 * ids, exactly one primary) and `accounts_mode: "single" | "compare"`.
 * A board saved before the fields carries neither and reads as `single` — the
 * board it always was. A board over several accounts is always COMPARE (the
 * retired "switch" mode reads as compare).
 *
 * Nothing here knows a platform: names, currencies and time zones come from the
 * account list the board was built from.
 */

import { datasetIdOf } from "@/lib/dashboard/alertRule";

export type AccountsMode = "single" | "compare";

/** At most this many accounts on one board (the scope card's `limits.max_accounts`). */
export const MAX_BOARD_ACCOUNTS = 6;

export interface BoardAccountRef {
  /** The source the account belongs to (a binding app, e.g. the vocabulary slug). */
  source: string;
  id: string;
  /** The account's own name; "" when the account list carried none. */
  name: string;
  /**
   * The ad platform (binding app, `tiktok_ads`) the account's figures come
   * from when `source` does not say it: a Dashboard MCP dataset (`dataset:…`)
   * reading an ad account. Absent for every other source (the source is the app).
   */
  platform?: string;
  currency?: string;
  timezone?: string;
  /** The account a reopened or shared board shows first. Exactly one per board. */
  primary: boolean;
  /**
   * The connection to this account is gone. Runtime only, never written back:
   * the account stays in the definition and the board greys it with Reconnect.
   */
  revoked?: boolean;
}

/** The account as the definition stores it (`revoked` is never written). */
export interface WireBoardAccount {
  source: string;
  id: string;
  name?: string;
  platform?: string;
  currency?: string;
  timezone?: string;
  primary?: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The board's accounts, read defensively: unique non-blank ids, at most six,
 * exactly one primary (the first flagged one, else the first). [] for a board
 * that stored none, which is every board saved before the field.
 */
export function parseBoardAccounts(raw: unknown): BoardAccountRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BoardAccountRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = text(rec.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const currency = text(rec.currency);
    const timezone = text(rec.timezone);
    const platform = text(rec.platform);
    out.push({
      source: text(rec.source),
      id,
      name: text(rec.name) === id ? "" : text(rec.name),
      ...(platform ? { platform } : {}),
      ...(currency ? { currency } : {}),
      ...(timezone ? { timezone } : {}),
      primary: rec.primary === true,
      ...(rec.revoked === true || rec.connected === false ? { revoked: true } : {}),
    });
    if (out.length === MAX_BOARD_ACCOUNTS) break;
  }
  if (out.length === 0) return out;
  const first = out.findIndex((a) => a.primary);
  const primaryAt = first >= 0 ? first : 0;
  return out.map((a, i) => ({ ...a, primary: i === primaryAt }));
}

/**
 * How the board shows its accounts. `single` whenever it has fewer than two —
 * an old board, or a board over one account — and `compare` for every board
 * over several, whatever the stored mode says (a saved "switch" included).
 */
export function parseAccountsMode(raw: unknown, accounts: readonly BoardAccountRef[]): AccountsMode {
  if (accounts.length < 2) return "single";
  // The server derives the mode from the widgets' own scopes: "single" can sit
  // beside 2+ accounts (each widget reads one). Anything else (an old board, a
  // retired "switch") over several accounts reads as compare.
  return raw === "single" ? "single" : "compare";
}

export function primaryAccount(accounts: readonly BoardAccountRef[]): BoardAccountRef | undefined {
  return accounts.find((a) => a.primary) ?? accounts[0];
}

/** The definition's `accounts`, in the board's order. */
export function toWireAccounts(accounts: readonly BoardAccountRef[]): WireBoardAccount[] {
  return accounts.map((a) => ({
    source: a.source,
    id: a.id,
    ...(a.name ? { name: a.name } : {}),
    ...(a.platform ? { platform: a.platform } : {}),
    ...(a.currency ? { currency: a.currency } : {}),
    ...(a.timezone ? { timezone: a.timezone } : {}),
    ...(a.primary ? { primary: true } : {}),
  }));
}

/**
 * One colour per account INDEX in the board's `accounts` order, shared by every
 * widget, the legend and the selector. Concrete values rather than CSS
 * variables because canvases draw them too (a canvas cannot read a variable). Mid-tone, muted, no
 * red or green (they read as down / up), legible on white and on dark.
 */
export const ACCOUNT_COLORS: readonly string[] = [
  "#6189b1", // the widget accent: the first account is the board's "up" blue
  "#b08a3e", // muted gold
  "#4f8f8b", // muted teal
  "#8570a8", // muted violet
  "#8c8c8c", // mid grey
  "#8a6f5a", // muted clay
];

/** The colour that stands for "all accounts" (a Total series / band / row). */
export const ACCOUNT_TOTAL_COLOR = "#404040";

export function accountColorAt(index: number): string {
  return ACCOUNT_COLORS[((index % ACCOUNT_COLORS.length) + ACCOUNT_COLORS.length) % ACCOUNT_COLORS.length];
}

export function accountIndexOf(accounts: readonly BoardAccountRef[], id: unknown): number {
  return typeof id === "string" ? accounts.findIndex((a) => a.id === id) : -1;
}

/**
 * A long name cut in the MIDDLE, keeping the end: company names share their
 * first words, so the tail is what tells two accounts apart. Counted in
 * characters (code points), no measuring.
 */
export function middleEllipsis(name: string, max: number): string {
  const chars = Array.from(name);
  if (chars.length <= max || max < 3) return name;
  const tail = Math.ceil((max - 1) / 2);
  const head = max - 1 - tail;
  return `${chars.slice(0, head).join("").trimEnd()}…${chars.slice(chars.length - tail).join("").trimStart()}`;
}

/** A name this short is always shown whole, on every card and in every width. */
export const SHORT_NAME_MAX = 14;

/** Characters an account face shows of a long name before its middle is cut. */
export const CHIP_NAME_MAX = 28;

/** Pixels per character at text-[10px], and the dot, gap and px-2 around a face. */
const FACE_CHAR_PX = 6;
const FACE_CHROME_PX = 28;
/** The fewest characters a cut name keeps, however tight the room. */
const FACE_MIN_CHARS = 8;

/**
 * The ONE face an account wears on a board: its NAME, never an id. A short name
 * is whole; a long one is cut in the middle, and when the narrowest place the
 * board shows it (`roomPx`, decided once per board) is tighter than that cut,
 * it is cut harder (fewer characters), not swapped for the id.
 */
export function accountFace(name: string, max = CHIP_NAME_MAX, roomPx?: number): string {
  if (Array.from(name).length <= SHORT_NAME_MAX) return name;
  const fit = roomPx === undefined ? max : Math.floor((roomPx - FACE_CHROME_PX) / FACE_CHAR_PX);
  return middleEllipsis(name, Math.max(FACE_MIN_CHARS, Math.min(max, fit)));
}

/**
 * The room (px) a chip has on the narrowest card of a board: the card's width
 * from its span, less its padding and the "…" menu's reserved corner.
 */
export function narrowestChipRoomPx(spans: readonly number[], gridWidth: number, cols: number, gap = 12): number | undefined {
  if (spans.length === 0 || gridWidth <= 0) return undefined;
  const col = (gridWidth - gap * (cols - 1)) / cols;
  const span = Math.min(...spans);
  return Math.floor(col * span + gap * (span - 1) - CARD_CHIP_RESERVE_PX);
}

/** Card padding (2 x 16) plus the reserved menu corner (20). */
export const CARD_CHIP_RESERVE_PX = 52;

/** The account's colour, or undefined for an id the board does not hold. */
export function accountColorOf(accounts: readonly BoardAccountRef[], id: unknown): string | undefined {
  const index = accountIndexOf(accounts, id);
  return index >= 0 ? accountColorAt(index) : undefined;
}

/** What an account is called on screen: its name, else the label the slot carried, else its id. */
export function accountNameOf(
  accounts: readonly BoardAccountRef[],
  id: unknown,
  carried?: unknown,
): string {
  const held = typeof id === "string" ? accounts.find((a) => a.id === id) : undefined;
  return held?.name || text(carried) || (typeof id === "string" ? id : "");
}

/** Every account shares one currency (accounts that state none are not counted against it). */
export function sharesOneCurrency(accounts: readonly BoardAccountRef[]): boolean {
  return new Set(accounts.map((a) => a.currency).filter(Boolean)).size <= 1;
}

/**
 * The app an account is grouped and labelled by: the ad platform it states
 * (a dataset reading an ad account), else its source.
 */
export function accountPlatform(account: Pick<BoardAccountRef, "source" | "platform">): string {
  return account.platform || account.source;
}

/** The app a source's accounts are labelled by (`accountPlatform` of its first account), else the source itself. */
export function sourcePlatform(accounts: readonly BoardAccountRef[], source: string): string {
  const held = accounts.find((a) => a.source === source);
  return held ? accountPlatform(held) : source;
}

/**
 * The ad platform a `dataset:<id>@<n>` source reads, from the board definition's
 * own copy of that dataset (`datasets[].recipe.account.source`, any version),
 * else the source itself: a board over ONE account states no `accounts`, so this
 * is where its dataset says which platform it reads.
 */
export function recipePlatform(datasets: unknown, source: string): string {
  const id = datasetIdOf(source);
  if (!id || !Array.isArray(datasets)) return source;
  for (const copy of datasets) {
    if (!copy || typeof copy !== "object" || !("dataset_id" in copy) || copy.dataset_id !== id) continue;
    const recipe = "recipe" in copy ? copy.recipe : undefined;
    const account = recipe && typeof recipe === "object" && "account" in recipe ? recipe.account : undefined;
    const app = account && typeof account === "object" && "source" in account ? text(account.source) : "";
    if (app) return app;
  }
  return source;
}

/**
 * Which source a binding reads, for "does the board read ONE source": a dataset
 * (`dataset:<id>@<n>`) is one source whichever version a cell holds — a cell's
 * Refresh moves it to the next version while the cells beside it keep theirs —
 * so its id; any other source is itself; "" for none.
 */
export function sourceIdentity(source: string | undefined): string {
  return datasetIdOf(source) ?? (source || "");
}

/** Accounts per source, in the board's order — what the scope chip names. */
export function accountsBySource(accounts: readonly BoardAccountRef[]): Array<{ source: string; count: number }> {
  const out: Array<{ source: string; count: number }> = [];
  for (const a of accounts) {
    const row = out.find((r) => r.source === a.source);
    if (row) row.count += 1;
    else out.push({ source: a.source, count: 1 });
  }
  return out;
}

/**
 * The account-scoped fields a widget-data request carries on a board over
 * several accounts, omitted entirely on every other board so its body is the
 * one it always sent.
 *
 * COMPARE: `accounts_mode` and every account id in the board's order, so each
 * series / row / band comes back per account.
 */
export interface AccountsReadScope {
  accounts_mode?: AccountsMode;
  account_ids?: string[];
}

export function accountsReadScope(
  accounts: readonly BoardAccountRef[],
  mode: AccountsMode,
): AccountsReadScope | undefined {
  // A board cut to one account says so: the producer reads exactly that account.
  if (accounts.length === 1 && mode === "single") return { accounts_mode: "single", account_ids: [accounts[0].id] };
  if (accounts.length < 2 || mode === "single") return undefined;
  const ids = accounts.map((a) => a.id);
  return { accounts_mode: "compare", account_ids: ids };
}

type CellMember = { source: string; account_ids: string[] };

function isCellMember(value: unknown): value is CellMember {
  return typeof value === "object" && value !== null && "source" in value && typeof value.source === "string"
    && "account_ids" in value && Array.isArray(value.account_ids);
}

/** A combined cell's `binding.members` (several sources, each its accounts), or undefined. */
function cellMembers(binding: unknown): CellMember[] | undefined {
  if (typeof binding !== "object" || binding === null || !("members" in binding)) return undefined;
  const { members } = binding;
  return Array.isArray(members) && members.length > 0 && members.every(isCellMember) ? members : undefined;
}

/**
 * The accounts a cell names for itself (`binding.members` of a combined cell, else
 * `binding.account_ids`), or undefined for a cell that reads the board's own scope. Any
 * binding shape: the fields ride on the legacy `{app, ...}` binding and on the source one alike.
 */
export function cellAccountIds(binding: unknown): string[] | undefined {
  const members = cellMembers(binding);
  const ids: unknown = members
    ? members.flatMap((m) => m.account_ids)
    : typeof binding === "object" && binding !== null && "account_ids" in binding ? binding.account_ids : undefined;
  if (!Array.isArray(ids)) return undefined;
  const own = ids.filter((id): id is string => typeof id === "string" && id !== "");
  return own.length > 0 ? own : undefined;
}

/** ``accounts`` as combined-cell members: one per source, in first-appearance order. */
function membersOf(accounts: readonly BoardAccountRef[]): CellMember[] {
  const out = new Map<string, string[]>();
  for (const a of accounts) out.set(a.source, [...(out.get(a.source) ?? []), a.id]);
  return [...out].map(([source, account_ids]) => ({ source, account_ids }));
}

/**
 * The slots after the board's accounts moved from `before` to `after`: the
 * `binding.account_ids` of each data cell follow its own source's accounts, and a
 * combined cell's `binding.members` become every account of `after`.
 *
 * A source whose accounts changed rewrites its cells (stamped, or unstamped
 * back to the board's scope when one source is left); once the board holds
 * several sources every cell is stamped, since the board-level accounts are the
 * union and no longer a cell's own. Cells of a source that did not change keep
 * the stamp they have. A source left with no account is not touched.
 */
export function rescopeCells<S extends { binding?: object | null }>(
  slots: readonly S[],
  sourceOf: (binding: NonNullable<S["binding"]>) => string | undefined,
  before: readonly BoardAccountRef[],
  after: readonly BoardAccountRef[],
): S[] {
  const idsOf = (list: readonly BoardAccountRef[], source: string) => list.filter((a) => a.source === source).map((a) => a.id);
  const multiSource = new Set(after.map((a) => a.source)).size > 1;
  return slots.map((slot) => {
    const binding = slot.binding;
    if (binding && cellMembers(binding) && after.length > 0) {
      const rest: Record<string, unknown> = { ...binding };
      delete rest.account_ids;
      return { ...slot, binding: { ...rest, members: membersOf(after) } };
    }
    const source = binding ? sourceOf(binding as NonNullable<S["binding"]>) : undefined;
    const ids = source ? idsOf(after, source) : [];
    if (!binding || ids.length === 0) return slot;
    const was = idsOf(before, source as string);
    const changed = was.length !== ids.length || ids.some((id) => !was.includes(id));
    const stamped = cellAccountIds(binding) !== undefined;
    if (multiSource ? !changed && stamped : !(changed && stamped)) return slot;
    const { account_ids: _drop, ...rest } = binding as { account_ids?: unknown };
    return { ...slot, binding: multiSource ? { ...rest, account_ids: ids } : rest };
  });
}

/** The items a COMPARE widget draws once the legend hid some accounts; items with no account always stay. */
export function visibleForAccounts<T>(
  items: readonly T[],
  hidden: ReadonlySet<string>,
  accountOf: (item: T) => unknown,
): T[] {
  if (hidden.size === 0) return [...items];
  return items.filter((item) => {
    const id = accountOf(item);
    return typeof id !== "string" || !hidden.has(id);
  });
}

/**
 * The accounts the reader hid on a board's strip, kept in this browser per
 * board (alongside the locally cached layout) so a reload keeps them hidden.
 * A view preference, not board content: it is not written to the definition.
 */
export function hiddenAccountsKey(dashboardId: string): string {
  return `cluega.dashboard-hidden-accounts.${dashboardId}`;
}

/**
 * The saved hidden set as stored. Not narrowed to the board's accounts: the
 * panel reads it before those accounts load (reload), and narrowing then would
 * drop every id. The caller intersects with the accounts on the board when it
 * renders. Unreadable storage reads as none hidden.
 */
export function readHiddenAccounts(dashboardId: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(hiddenAccountsKey(dashboardId)) ?? "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

/** Save the hidden set; an empty set removes the entry. Best-effort when storage is unavailable. */
export function writeHiddenAccounts(dashboardId: string, hidden: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (hidden.size === 0) localStorage.removeItem(hiddenAccountsKey(dashboardId));
    else localStorage.setItem(hiddenAccountsKey(dashboardId), JSON.stringify([...hidden]));
  } catch {
    // The strip still hides for this visit.
  }
}
