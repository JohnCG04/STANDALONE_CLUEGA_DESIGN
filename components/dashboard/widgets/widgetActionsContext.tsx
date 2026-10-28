"use client";

// Per-slot actions the board hands to whichever widget it draws. A context
// rather than three more props on sixteen widget components: every widget
// already renders `WidgetShell`, and the shell is the only reader.
import { createContext, useContext } from "react";
import type { BoardAccount } from "@/lib/dashboard/boardAccount";
import type { EmptyEditField } from "@/lib/dashboard/emptyCauseAction";
import type { TimeRangeRecord } from "@/lib/dashboard/timeRange";
import type { CellMotion } from "./motion";
import type { StateTiming } from "./stateTiming";
import type { WidgetPeriod } from "./widgetPeriod";

export interface WidgetActions {
  /** Whether this cell arrived live (motion allowed) and the board is dense. Absent = no motion. */
  motion?: CellMotion;
  onRetry?: () => void;
  onReauthorize?: () => void;
  /** This card alone is being re-read; its last numbers stay on screen. */
  refreshing?: boolean;
  /** When this card's read was tried and when it may be tried again. */
  timing?: StateTiming;
  /** The dates this card's numbers came from (RD-T-07). */
  period?: WidgetPeriod;
  /** The window this card's binding asked for, when the numbers come from a
   *  wider one because it held no data (RD-T-03). Absent otherwise. */
  timeRange?: TimeRangeRecord;
  /** True when the board's banner already states this card's requested and
   *  actual windows — a uniform widened board inside the panel
   *  (`TimeRangeBanner`). The card then keeps the window it shows and drops
   *  its "Requested: … · widened" line, which would only repeat the banner.
   *  Absent on a mixed board, and wherever a card is drawn without that
   *  banner over it: there the line is the only place the reader learns it. */
  timeRangeStatedByBoard?: boolean;
  /** The binding app ("tiktok_ads") the panel header already names, when the
   *  whole board reads from that one source. Absent when the header shows no
   *  platform (embedded pages) or the board mixes sources. */
  sourceStatedByBoard?: string;
  /** True when the board's meta line under the title already states source,
   *  account, freshness and compare window — the card then leaves its own
   *  source / account / "Updated…" row out. Absent wherever a card is drawn
   *  without that line (one source only, never a compare board). */
  metaStatedByBoard?: boolean;
  /** True when that line also states THIS card's period, because it equals the
   *  board's single one. A card over a different window leaves it absent and
   *  keeps its own period line. */
  periodStatedByBoard?: boolean;
  /** An EMPTY card whose every widening rung read nothing (`time_range` state
   *  "exhausted") states how far it looked — "Checked: …", and "Originally
   *  requested: …" when that differs — not a data period (BUG-141-RD-T-07).
   *  Set only where each card states its own period (My dashboards). */
  statesCheckedWindow?: boolean;
  /** The ad account THIS card's numbers were read from (RD-A-08), stated in its
   *  source line. Absent when the board cannot say which source its account
   *  belongs to (`widgetSourceAccount`) — never filled in with a guess. */
  sourceAccount?: BoardAccount;
  /** "Expand the time range" on an EMPTY card whose window held no row
   *  (BUG-119.1-RD-R-08). Decided by the panel — the producer's cause code, the
   *  host's grant, the card's own dates — never by the shell, which only draws
   *  it beside the empty sentence: `expand` is the next step's length and what
   *  pressing does; `limit` is the ceiling reached, said instead of offered.
   *  Absent everywhere else. */
  expandRange?: { kind: "expand"; days: number; onExpand: () => void } | { kind: "limit"; days: number };
  /** "Change the period" / "Change the metric" on an EMPTY card whose cause code
   *  that field may answer (`emptyEditField`, BUG-119.1-RD-R-08). Decided by the
   *  panel — the code, the edit right, the binding — and pressing opens the
   *  card's own edit form on that field; `opener` gets focus back when it
   *  closes. Absent where the card may not be edited. */
  editEmpty?: { field: EmptyEditField; onEdit: (opener: HTMLElement) => void };
}

export const WidgetActionsContext = createContext<WidgetActions>({});

export function useWidgetActions(): WidgetActions {
  return useContext(WidgetActionsContext);
}
