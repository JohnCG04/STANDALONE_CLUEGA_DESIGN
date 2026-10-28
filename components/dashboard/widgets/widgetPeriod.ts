// The window a card's numbers came from (RD-T-07 / FR-032). The producer stamps
// `config.period` — the resolved dates the fetch used — on every data cell, and
// `config.compare_period` when its arrows compare against the preceding window.

import { isDigits } from "@/lib/dashboard/digits";

export interface WidgetPeriod {
  start: string;
  end: string;
  compare?: { start: string; end: string };
}

/**
 * The SHAPE of a date-only ISO value, "YYYY-MM-DD" in ASCII digits — not whether
 * the day exists (`isIsoDay` asks both). One check for every reader of a stored
 * day: the period, the time-range record and the binding validator.
 */
export function isIsoDayShape(value: string): boolean {
  return (
    value.length === 10 &&
    value[4] === "-" &&
    value[7] === "-" &&
    isDigits(value.slice(0, 4)) &&
    isDigits(value.slice(5, 7)) &&
    isDigits(value.slice(8, 10))
  );
}

function span(raw: unknown): { start: string; end: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { start, end } = raw as Record<string, unknown>;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!isIsoDayShape(start) || !isIsoDayShape(end) || start > end) return null;
  return { start, end };
}

/** The period off a slot's config, or undefined for a board saved before it
 *  was stamped. */
export function readPeriod(config: unknown): WidgetPeriod | undefined {
  if (!config || typeof config !== "object") return undefined;
  const c = config as Record<string, unknown>;
  const period = span(c.period);
  if (!period) return undefined;
  const compare = span(c.compare_period);
  return compare ? { ...period, compare } : period;
}

/**
 * How a board prints a DAY, in the interface's language (BUG-102-RD-X-04).
 * One convention for every date on a board — the period line, an axis, a
 * tooltip, a table, a heatmap — and the SAME one the producer writes into its
 * own sentences (AI CDP `llm/dashboard/date_words.py`), zero-padded so a day
 * and a month cannot be read for each other:
 *
 *   lang   full         short
 *   vn/vi  13/09/2026   13/09
 *   en     09/13/2026   09/13
 *   zh     2026/09/13   09/13
 *
 * Built from the ISO digits, never through `Date`, so a calendar day cannot
 * slide across a time zone, and never through `Intl`, whose numeric output
 * differs between ICU builds (padding, separators) — the board must read the
 * same in every browser and match the producer's words exactly.
 */
type DayOrder = "dmy" | "mdy" | "ymd";

function orderOf(lang: string): DayOrder {
  if (lang === "zh") return "ymd";
  if (lang === "en") return "mdy";
  return "dmy";
}

function parts(iso: string): { y: string; m: string; d: string } {
  const [y, m, d] = iso.split("-");
  return { y, m, d };
}

function fullOf(iso: string, order: DayOrder): string {
  const { y, m, d } = parts(iso);
  if (order === "ymd") return `${y}/${m}/${d}`;
  return order === "mdy" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

function shortOf(iso: string, order: DayOrder): string {
  const { m, d } = parts(iso);
  return order === "dmy" ? `${d}/${m}` : `${m}/${d}`;
}

/** A real calendar day ("2026-02-30" is not one), not only its shape. */
function isCalendarDay(iso: string): boolean {
  const { y, m, d } = parts(iso);
  const at = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return at.getUTCFullYear() === Number(y) && at.getUTCMonth() === Number(m) - 1 && at.getUTCDate() === Number(d);
}

/** `raw` as a span of two real days in order, or undefined: never a repaired or guessed one. */
export function calendarSpan(raw: unknown): { start: string; end: string } | undefined {
  const s = span(raw);
  return s && isCalendarDay(s.start) && isCalendarDay(s.end) ? s : undefined;
}

/** A date-only ISO value ("2026-09-18") — the one shape these helpers reformat. */
export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && isIsoDayShape(value) && isCalendarDay(value);
}

/** Short day for an axis tick or a column header; anything else unchanged. */
export function formatDayShort(iso: string, lang: string): string {
  return isIsoDay(iso) ? shortOf(iso, orderOf(lang)) : String(iso);
}

/** Full day, with the year, for a tooltip or a title; anything else unchanged. */
export function formatDayFull(iso: string, lang: string): string {
  return isIsoDay(iso) ? fullOf(iso, orderOf(lang)) : String(iso);
}

/** The month a day falls in, never a day: vn/en "09/2026", zh "2026/09". */
export function formatMonthYear(iso: string, lang: string): string {
  if (!isIsoDay(iso)) return String(iso);
  const { y, m } = parts(iso);
  return orderOf(lang) === "ymd" ? `${y}/${m}` : `${m}/${y}`;
}

/**
 * A category label as an axis prints it: a date-only ISO value becomes the
 * short day; anything else — a campaign name, a label the producer wrote, a
 * timestamp — is returned unchanged. Only a WHOLE-value date is reformatted,
 * never a date inside a sentence.
 */
export function axisDayLabel(value: string | number, lang: string): string {
  return isIsoDay(value) ? formatDayShort(value, lang) : String(value);
}

/** The same label as a tooltip or a title prints it: the full day, else unchanged. */
export function fullDayLabel(value: string | number, lang: string): string {
  return isIsoDay(value) ? formatDayFull(value, lang) : String(value);
}

/**
 * "18/09 – 24/09/2026": the year once when both ends share it, on the end
 * that carries it in the language (zh "2026/09/18 – 09/24"), and on both ends
 * across a new year. The producer's `date_words.date_span` is the same rule.
 */
export function formatPeriod(start: string, end: string, lang: string): string {
  const order = orderOf(lang);
  if (start === end) return fullOf(end, order);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${fullOf(start, order)} – ${fullOf(end, order)}`;
  return order === "ymd"
    ? `${fullOf(start, order)} – ${shortOf(end, order)}`
    : `${shortOf(start, order)} – ${fullOf(end, order)}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Longest period scanned for day labels; past a year a short day ("10/20") names two days. */
const MAX_LABEL_PERIOD_DAYS = 366;

/** Every way a board has printed a day: ISO, each language's short and full, the old d/m. */
const DAY_WRITINGS: ReadonlyArray<(iso: string) => string> = [
  (iso) => iso,
  (iso) => shortOf(iso, "dmy"),
  (iso) => shortOf(iso, "mdy"),
  (iso) => fullOf(iso, "dmy"),
  (iso) => fullOf(iso, "mdy"),
  (iso) => fullOf(iso, "ymd"),
  (iso) => `${Number(parts(iso).d)}/${Number(parts(iso).m)}`,
];

/**
 * The ISO day each category label names, or null. A label is a day only when it is exactly how
 * one writing above prints a distinct day of the cell's own `period`; ambiguity gives null.
 */
export function labelDays(labels: ReadonlyArray<string | number>, period: unknown): string[] | null {
  if (labels.length === 0) return null;
  if (labels.every(isIsoDay)) return labels as string[];
  const window = calendarSpan(period);
  if (!window) return null;
  const first = dayNumber(window.start);
  const count = dayNumber(window.end) - first + 1;
  if (count < 1 || count > MAX_LABEL_PERIOD_DAYS) return null;
  const days = Array.from({ length: count }, (_, i) => new Date((first + i) * 86_400_000).toISOString().slice(0, 10));
  const found = new Set<string>();
  for (const write of DAY_WRITINGS) {
    const byText = new Map<string, string>();
    for (const day of days) {
      const text = write(day);
      byText.set(text, byText.has(text) ? "" : day);
    }
    const read = labels.map((label) => byText.get(String(label)) ?? "");
    if (read.every(Boolean) && new Set(read).size === read.length) found.add(read.join(","));
  }
  return found.size === 1 ? [...found][0]!.split(",") : null;
}

/** N when the compare window is the N whole days right before the board's
 *  window (it ends the day before `period` starts); otherwise undefined. */
export function previousDaysCount(
  period: { start: string; end: string },
  compare: { start: string; end: string },
): number | undefined {
  if (!isIsoDay(period.start) || !isIsoDay(compare.start) || !isIsoDay(compare.end)) return undefined;
  if (dayNumber(compare.end) + 1 !== dayNumber(period.start)) return undefined;
  return dayNumber(compare.end) - dayNumber(compare.start) + 1;
}
