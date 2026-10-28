import type { LanguageCode } from "@/i18n/config";

import type { DateRange, TimestampRangeMs } from "./date-range-picker.types";

/** Monday: the calendar board heads its columns Mo … Su (2026-09-29). It was
 *  Sunday; "This week" and "Last week" follow, as Mon–Sun. */
export const WEEK_STARTS_ON = 1 as const;

export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  next.setDate(Math.min(day, daysInMonth(next)));
  return next;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(start.getDate() - ((start.getDay() - WEEK_STARTS_ON + 7) % 7));
  return start;
}

export function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6));
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function isSameDay(left: Date, right: Date): boolean {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

export function formatPickerMonthCaption(
  month: Date,
  appLocale: LanguageCode,
): string {
  if (appLocale === "zh") {
    return `${month.getFullYear()}年 ${month.getMonth() + 1}月`;
  }
  return month.toLocaleDateString(intlLocale(appLocale), {
    month: "long",
    year: "numeric",
  });
}

/**
 * The seven column headers of the month grid, in the app's language.
 *
 * These used to be a hardcoded `["日","一",…]`, which read as Chinese inside an
 * English or Vietnamese calendar — the one part of this picker that never
 * followed the language switch.
 *
 * `narrow` is the right width for a 36px column and is what Chinese and
 * Vietnamese want (`日 一 二 …`, `CN T2 T3 …`). English is the exception: its
 * narrow form is `S M T W T F S`, where Sunday and Saturday are both "S" and
 * Tuesday and Thursday are both "T" — three ambiguous columns out of seven — so
 * English takes `short` instead.
 *
 * The week starts on Monday to match `startOfWeek`, which builds the grid.
 * English is cut to two letters (Mo Tu We …), the board's column labels.
 */
export function pickerWeekdayLabels(appLocale: LanguageCode): string[] {
  const locale = intlLocale(appLocale);
  const format = new Intl.DateTimeFormat(locale, {
    weekday: appLocale === "en" ? "short" : "narrow",
    timeZone: "UTC",
  });
  // 2026-08-03 is a Monday; seven consecutive days from it name every weekday
  // exactly once, in the order the grid lays them out.
  return Array.from({ length: 7 }, (_, index) => {
    const label = format.format(new Date(Date.UTC(2026, 7, 3 + index)));
    return appLocale === "en" ? label.slice(0, 2) : label;
  });
}

/** The app's language code as a BCP-47 tag `Intl` understands. */
function intlLocale(appLocale: LanguageCode): string {
  switch (appLocale) {
    case "zh":
      return "zh-Hant";
    case "vn":
      return "vi-VN";
    case "th":
      // Gregorian: th-TH alone counts years in the Buddhist era (2026 → 2569).
      return "th-TH-u-ca-gregory";
    default:
      return "en-US";
  }
}

export function defaultTriggerFormat(appLocale: LanguageCode): string {
  switch (appLocale) {
    case "zh":
      return "yy/M/d";
    case "vn":
    case "th":
      return "dd/MM/yy";
    default:
      return "M/d/yy";
  }
}

export function cloneRange(range: DateRange | undefined): DateRange | undefined {
  if (!range?.from) return undefined;
  return {
    from: new Date(range.from),
    to: range.to ? new Date(range.to) : undefined,
  };
}

export function clampRangeToBounds(
  range: DateRange,
  minDate?: Date,
  maxDate?: Date,
): DateRange {
  let from = startOfDay(range.from!);
  let to = startOfDay(range.to ?? range.from!);
  if (to < from) to = from;

  if (minDate) {
    const min = startOfDay(minDate);
    if (from < min) from = min;
    if (to < from) to = from;
  }
  if (maxDate) {
    const max = endOfDay(maxDate);
    if (to > max) to = max;
    if (from > to) from = startOfDay(to);
  }
  return { from, to };
}

export function normalizeCommitRange(
  range: DateRange | undefined,
  opts?: { preserveTime?: boolean },
): DateRange | undefined {
  if (!range?.from) return undefined;
  if (opts?.preserveTime) {
    const from = new Date(range.from);
    const to = new Date(range.to ?? range.from);
    return { from, to: to < from ? from : to };
  }
  const from = startOfDay(range.from);
  const to = startOfDay(range.to ?? range.from);
  return { from, to: to < from ? from : to };
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function parseHmParts(hm: string): { h: number; m: number } {
  const parts = hm.trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? "0", 10) || 0));
  return { h, m };
}

export function timeHmFromDate(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "00:00";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function mergeDayAndHm(
  day: Date | undefined,
  hm: string,
): Date | undefined {
  if (!day) return undefined;
  const { h, m } = parseHmParts(hm);
  const next = startOfDay(day);
  next.setHours(h, m, 0, 0);
  return next;
}

export function dateRangeToTimestampRangeMs(
  range: DateRange | undefined,
  preserveTime?: boolean,
): TimestampRangeMs | undefined {
  const norm = normalizeCommitRange(range, { preserveTime: !!preserveTime });
  if (!norm?.from) return undefined;
  const to = norm.to ?? norm.from;
  return { from: norm.from.getTime(), to: to.getTime() };
}

export function timestampRangeMsToDateRange(
  range: TimestampRangeMs | undefined,
): DateRange | undefined {
  if (range == null) return undefined;
  const from = new Date(range.from);
  const to = new Date(range.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    return undefined;
  return normalizeCommitRange({ from, to });
}

export function formatRangeLabel(
  range: DateRange | undefined,
  pattern: string,
  placeholder: string,
  options?: { showTime?: boolean; singleDate?: boolean; compactYear?: boolean },
): string {
  if (!range?.from) return placeholder;
  const fromLabel = formatDate(range.from, pattern, options?.showTime);
  if (options?.singleDate) return fromLabel;
  if (!range.to) return `${fromLabel} – …`;
  if (options?.compactYear && range.from.getFullYear() === range.to.getFullYear()) {
    // "9/8 - 9/14/26": the year once, on the end that closes the range.
    const yearless = pattern.replace(/\/?y+\/?/, (m) => (m.startsWith("/") && m.endsWith("/") ? "/" : ""));
    return `${formatDate(range.from, yearless, options.showTime)} - ${formatDate(range.to, pattern, options.showTime)}`;
  }
  return `${fromLabel} – ${formatDate(range.to, pattern, options?.showTime)}`;
}

function formatDate(date: Date, pattern: string, showTime?: boolean): string {
  const yy = pad2(date.getFullYear() % 100);
  const replacements: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy,
    MM: pad2(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    d: String(date.getDate()),
    HH: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
  };
  const pat = showTime && !pattern.includes("H") ? `${pattern} HH:mm` : pattern;
  return pat.replace(/yyyy|yy|MM|M|dd|d|HH|mm/g, (token) => replacements[token]);
}
