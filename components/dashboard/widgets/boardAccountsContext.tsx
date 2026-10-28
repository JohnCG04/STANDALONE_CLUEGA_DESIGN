"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AccountsMode, BoardAccountRef } from "@/lib/dashboard/boardAccounts";

/**
 * The accounts of the BOARD a widget is drawn on, how the board shows them, and
 * which of them the board's legend has hidden.
 *
 * A COMPARE widget's slot names each series / row / band by `account_id`; the
 * colour of that account is its INDEX in the board's `accounts` order, so every
 * widget on the board agrees, and only the board knows that order. Absent — an
 * old board, a single-account board, a surface that never provides it — the
 * value is the empty default and every widget draws exactly what it drew before.
 */
export interface BoardAccountsView {
  accounts: readonly BoardAccountRef[];
  mode: AccountsMode;
  /** Account ids the board legend has hidden: compare items drop them, and a one-account cell of one draws none of its figures. */
  hidden: ReadonlySet<string>;
  /** Room (px) a chip has on the board's narrowest card: one decision for every face. */
  chipRoomPx?: number;
  /** COMPARE: the account the board is focused on; every other account's figures dim. */
  focused?: string | null;
  /** Press an account chip: focus it, or clear the focus when it already is. */
  toggleFocus?: (id: string) => void;
}

const EMPTY: BoardAccountsView = { accounts: [], mode: "single", hidden: new Set() };

const BoardAccounts = createContext<BoardAccountsView>(EMPTY);

export function BoardAccountsProvider({ value, children }: { value: BoardAccountsView; children: ReactNode }) {
  return <BoardAccounts.Provider value={value}>{children}</BoardAccounts.Provider>;
}

/** True when a COMPARE board is focused on an account other than `accountId`. */
export function dimmedFor(view: BoardAccountsView, accountId?: string | null): boolean {
  return view.mode === "compare" && !!view.focused && !!accountId && accountId !== view.focused;
}

/**
 * The view one cell draws under. A cell that names its own accounts
 * (`binding.account_ids`) is hidden / dimmed only for the accounts of its own
 * scope, and is a compare read only when that scope holds 2+; a cell without
 * the stamp reads the board's view whole.
 */
export function viewForCell(view: BoardAccountsView, cellAccounts: readonly string[] | undefined): BoardAccountsView {
  if (!cellAccounts) return view;
  const inScope = (id: string) => cellAccounts.includes(id);
  return {
    ...view,
    mode: cellAccounts.length >= 2 ? "compare" : "single",
    hidden: new Set([...view.hidden].filter(inScope)),
    focused: view.focused && inScope(view.focused) ? view.focused : null,
  };
}

export function useBoardAccounts(): BoardAccountsView {
  return useContext(BoardAccounts);
}
