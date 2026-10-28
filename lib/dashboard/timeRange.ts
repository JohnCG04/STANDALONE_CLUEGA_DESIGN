/**
 * The window a board ASKED for and the one it SHOWS, when they differ (RD-T-03).
 *
 * When the asked window holds no data the producer reads wider windows —
 * 30 → 60 → 90 → 180 days, each ending where the asked one ends — and stops at
 * the first that does (PRD FR-031). It stamps what it did on every data cell
 * as `config.time_range` (FR-032), so the record travels with the cells into
 * the saved snapshot and the share link, and a reopened board still says it.
 *
 * Absent on a board that used its own window, which keeps that board's screen
 * exactly as it was. Pure: plain values in, plain values out.
 */
import type { WidgetSlot } from "@/components/dashboard/widgets/types";
import { isIsoDayShape } from "@/components/dashboard/widgets/widgetPeriod";

/**
 * `expanded` — a wider window held data, and the numbers come from it;
 * `exhausted` — every rung was confirmed empty; `interrupted` — a rung's read
 * failed or could not count its rows. `unsynced` / `unconfirmed` are LEGACY:
 * no longer produced (the widening is DB-only since 2026-10-07), still read so a
 * board saved before then opens without a crash and is not re-filled on open.
 */
export type TimeRangeState = "expanded" | "exhausted" | "interrupted" | "unsynced" | "unconfirmed";

export interface DaySpan {
  start: string;
  end: string;
}

/** A filter the board's reads were narrowed by; names are per-locale (`vi`/`en`/`zh`). */
export interface TimeRangeFilter {
  key: string;
  value: string;
  of: Record<string, string>;
  label: Record<string, string>;
}

export interface TimeRangeRecord {
  state: TimeRangeState;
  /** The window the board's bindings ask for. */
  requested: DaySpan;
  /** The window the numbers come from; only when a wider one held data. */
  actual?: DaySpan;
  /** The widest window read, so an exhausted board can say how far it looked. */
  checked?: DaySpan;
  checkedDays: number;
  /** "no_data" once every rung was empty; the fetch state a failed rung ended on. */
  missingDataState: string;
  /** Filters the reads were narrowed by; only when there were any. */
  filters?: TimeRangeFilter[];
}

const STATES: ReadonlySet<string> = new Set(["expanded", "exhausted", "interrupted", "unsynced", "unconfirmed"]);

function span(raw: unknown): DaySpan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { start, end } = raw as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string") return undefined;
  if (!isIsoDayShape(start) || !isIsoDayShape(end) || start > end) return undefined;
  return { start, end };
}

function names(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [lang, text] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof text === "string" && text.trim()) out[lang] = text.trim();
  }
  return out;
}

function readFilters(raw: unknown): TimeRangeFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: TimeRangeFilter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.key !== "string" || typeof f.value !== "string") continue;
    out.push({ key: f.key, value: f.value, of: names(f.of), label: names(f.label) });
  }
  return out;
}

/** The record off one slot's config, or undefined — never a guessed one. */
export function readTimeRange(config: unknown): TimeRangeRecord | undefined {
  if (!config || typeof config !== "object") return undefined;
  const raw = (config as Record<string, unknown>).time_range;
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const state = typeof r.state === "string" && STATES.has(r.state) ? (r.state as TimeRangeState) : undefined;
  const requested = span(r.time_range_requested);
  if (!state || !requested) return undefined;
  const actual = span(r.time_range_actual);
  // An "expanded" record that names no window shown is not one this screen can state.
  if (state === "expanded" && !actual) return undefined;
  const checked = span(r.checked);
  const days = typeof r.checked_days === "number" && Number.isFinite(r.checked_days) ? r.checked_days : 0;
  const filters = readFilters(r.filters);
  return {
    state,
    requested,
    ...(filters.length ? { filters } : {}),
    ...(actual ? { actual } : {}),
    ...(checked ? { checked } : {}),
    checkedDays: days,
    missingDataState: typeof r.missing_data_state === "string" ? r.missing_data_state : "",
  };
}

/**
 * Every field the banner's words depend on — the windows AND what was found
 * (`missingDataState`: the evidence or cause) and how far it looked
 * (`checkedDays`). Two cells agree only when all of them do; otherwise one
 * cell's evidence would be stated for a board whose other cells lack it.
 */
function keyOf(record: TimeRangeRecord): string {
  const s = (d?: DaySpan) => (d ? `${d.start}:${d.end}` : "");
  return JSON.stringify([
    record.state, s(record.requested), s(record.actual), s(record.checked), record.checkedDays, record.missingDataState,
    record.filters ?? [],
  ]);
}

/**
 * What the BOARD can say about its window, read off EVERY data cell.
 *
 * `uniform` — every data cell carries the same record (`keyOf`: windows,
 * checked days and missing-data state alike): one banner speaks for the board. `mixed` — the cells do not agree (some widened and some not,
 * widened to different windows, stopped for a different reason or on different
 * evidence, or a cell with no record at all — loading,
 * failed, saved before the field): no one record describes the board, and the
 * banner says so instead of letting one cell, or the most common one, stand for
 * the rest. Undefined when no cell carries a record: the board used its own
 * window and stays as it was.
 */
export type BoardTimeRange =
  | { kind: "uniform"; record: TimeRangeRecord }
  | { kind: "mixed"; withRecord: number; total: number };

export function boardTimeRange(
  slots: readonly Pick<WidgetSlot, "binding" | "config">[],
): BoardTimeRange | undefined {
  const data = slots.filter((slot) => Boolean(slot.binding));
  const records = data.map((slot) => readTimeRange(slot.config));
  const withRecord = records.filter((record) => record !== undefined).length;
  if (withRecord === 0) return undefined;
  const first = records[0];
  if (first && withRecord === data.length && records.every((record) => record && keyOf(record) === keyOf(first))) {
    return { kind: "uniform", record: first };
  }
  return { kind: "mixed", withRecord, total: data.length };
}

/**
 * ``config`` without the record — for a cell whose binding just moved to
 * another window. The record described the OLD window's widening; kept, it
 * would put that banner over the new window while it loads, and into the
 * snapshot written mid-switch. The fill that follows stamps a new one if the
 * new window widens too.
 */
export function withoutTimeRange<C>(config: C): C {
  if (!config || typeof config !== "object" || !("time_range" in (config as object))) return config;
  const rest: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  delete rest.time_range;
  return rest as C;
}
