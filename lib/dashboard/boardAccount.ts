/**
 * WHOSE numbers a board — and each of its widgets — shows (RD-A-08).
 *
 * The account a board reads is chosen once (the picker, the prompt, the only
 * authorized account) and saved on the definition: `advertiser_id`,
 * `advertiser_label`, `advertiser_match_type` (`buildDashboardDefinition`). The
 * header states it; this module is what lets the same identity be stated
 * wherever else the board is shown — a widget's source line, a card or a row
 * in My dashboards — without anyone re-asking an ad platform for the name, and
 * without ever inventing one.
 *
 * Pure: plain values in, plain values out, so every rule here is a test.
 */
import type { DashboardDefinition } from "./api";
import { bindingSource, type WidgetSlot } from "@/components/dashboard/widgets/types";
import { accountNameOf, cellAccountIds, type BoardAccountRef } from "./boardAccounts";

export interface BoardAccount {
  /** The advertiser id the board's reads are scoped to. */
  id: string;
  /** The account's own name, when the account list carried one. */
  label?: string;
  /** How it was decided ("only" | "named" | "picked" | "tenant" | "run"). */
  matchType?: string;
}

/**
 * `advertiser_match_type` of a board LOCKED to the account its ad run bought on.
 *
 * Stored on the definition, so a refresh, a range change, a save and a reopen
 * all keep reading that account and only that account. It is the value of the
 * stored field the CDP defines, which a preset's `account_policy` names too
 * (`run_match_type`); a saved board carries it with or without the vocabulary,
 * which is why the panel reads it from here and not from a preset.
 */
export const RUN_ACCOUNT_MATCH_TYPE = "run";

/** The value a workspace-level connection stands in an id's place with. */
const WORKSPACE_SENTINEL = "active";

/**
 * The account a saved board stored, read off its definition and nothing else.
 *
 * Null when the board stored no id — a board saved before the field, or one
 * whose platform has no account. Never a guess: not another board's account,
 * not the tenant's first one, and never the dashboard's own name.
 */
export function savedBoardAccount(schema: DashboardDefinition | null | undefined): BoardAccount | null {
  const id = typeof schema?.advertiser_id === "string" ? schema.advertiser_id.trim() : "";
  if (!id) return null;
  const label = typeof schema?.advertiser_label === "string" ? schema.advertiser_label.trim() : "";
  const matchType = typeof schema?.advertiser_match_type === "string" ? schema.advertiser_match_type : "";
  return {
    id,
    ...(label && label !== id ? { label } : {}),
    ...(matchType ? { matchType } : {}),
  };
}

/** The board's account as the panel received it, in the same shape. */
export function boardAccountOf(
  id: string | undefined, label: string | undefined, matchType: string | undefined,
): BoardAccount | null {
  return savedBoardAccount({
    definition_version: 1, slots: [],
    ...(id ? { advertiser_id: id } : {}),
    ...(label ? { advertiser_label: label } : {}),
    ...(matchType ? { advertiser_match_type: matchType } : {}),
  });
}

/**
 * The account ONE widget's numbers come from, or null.
 *
 * A board stores one account and no platform for it, and every widget is
 * fetched with that one id. On a board that reads a single app, every widget
 * bound to that app reads that account — so the account is stated on it. On a
 * board that reads SEVERAL apps nothing says which of them the stored id
 * belongs to (a TikTok advertiser id means nothing to Meta), so no widget is
 * labelled with it: an account stated on the wrong source is worse than none,
 * and the header still says what the board was scoped to.
 *
 * Also null for a widget with no binding (a header, a note), and for a
 * workspace-level connection, which has no account of its own to name.
 *
 * A cell that names its own accounts (`cellAccountIds`: a shape split per
 * account) states its one account, named from the board's `accounts`; one
 * naming several states none. Only a cell that names none reads the board's.
 */
export function widgetSourceAccount(
  slot: Pick<WidgetSlot, "binding">,
  account: BoardAccount | null,
  boardApps: Iterable<string>,
  accounts: readonly BoardAccountRef[] = [],
): BoardAccount | null {
  if (!account || account.id === WORKSPACE_SENTINEL || account.matchType === "tenant") return null;
  const app = bindingSource(slot.binding);
  if (!app) return null;
  const apps = new Set(boardApps);
  if (!(apps.size === 1 && apps.has(app))) return null;
  const own = cellAccountIds(slot.binding);
  if (!own) return account;
  if (own.length !== 1) return null;
  if (own[0] === account.id) return account;
  const carried = (slot.binding as { account_label?: unknown } | null | undefined)?.account_label;
  const label = accountNameOf(accounts, own[0], carried);
  return { id: own[0], ...(label && label !== own[0] ? { label } : {}) };
}
