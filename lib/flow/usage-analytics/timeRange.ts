/**
 * The Usage Analytics time range — the ONE control every block on the page
 * obeys (the picker above the dashboard), and the bucket size it implies.
 *
 * Two facts live here, and the second is derived from the first on purpose:
 *
 *   1. WHICH DAYS. A preset ("Today", "Last month", …) or a custom from–to.
 *      Rolling windows rather than calendar months: the mockup's "Last month"
 *      chart runs from ~4 weeks ago up to today, and a rolling window is also
 *      the only definition that keeps "the last N days" true on every day of
 *      the month.
 *
 *   2. HOW COARSE. A window of a few days plotted per DAY is five bars; a
 *      quarter plotted per day is ninety. So the span picks the bucket — hour,
 *      day or month — and the bucket travels to the API as `type`, which is
 *      what the backend groups by. The client never re-buckets an answer: a
 *      chart that sums days into months in the browser has to download the days
 *      first, and would disagree with the KPI cards the moment a day is
 *      partially synced.
 *
 * Because the bucket is PART of the window, it reaches every request and every
 * SWR key for free (the keys embed the window object), so two granularities can
 * never share a cache entry.
 *
 * Dates are formatted with the LOCAL date parts — the PRD's timezone edge case:
 * a design made "yesterday" in the user's timezone must not land on today's bar
 * because the string was built in UTC.
 */

export type UsageTimeRangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_month"
  | "last_3_months"
  | "all_time"
  | "custom";

/** The grouping the API is asked for — `type=hour|day|month`. */
export type UsageBucket = "hour" | "day" | "month";

export const DEFAULT_TIME_RANGE: UsageTimeRangeKey = "last_month";

/** Display order of the picker's preset actions. `custom` is not here: it is
 *  the action that opens the calendar, listed on its own below the presets. */
export const USAGE_TIME_RANGES: readonly UsageTimeRangeKey[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "last_month",
  "last_3_months",
  "all_time",
];

export interface UsageDateWindow {
  /** Inclusive `YYYY-MM-DD` lower bound, or null for an open start (all time). */
  start_date: string | null;
  /** Inclusive `YYYY-MM-DD` upper bound. */
  end_date: string;
  /** The grouping this span is read at — derived, never picked by hand. */
  bucket: UsageBucket;
}

/**
 * What the picker holds: a preset, or `custom` plus the two dates it was given.
 * The window is DERIVED from this on read rather than stored beside it, so the
 * selection and the days it means can never drift apart.
 */
export interface UsageRangeSelection {
  key: UsageTimeRangeKey;
  /** Inclusive `YYYY-MM-DD` bounds — only meaningful when key is "custom". */
  start?: string;
  end?: string;
}

/**
 * The two thresholds behind `resolveBucket`.
 *
 * Under a week the reader is looking at a day or two and wants to see WHEN in
 * the day the credits went (hours). Past about two months a per-day axis is a
 * hundred-odd bars nobody reads individually, so it rolls up to months.
 */
/** Strictly fewer days than this reads hourly — so "Today" and "Yesterday" do. */
export const HOURLY_UNDER_DAYS = 7;
/** More days than this rolls up to months (~2 months of daily bars is the most
 *  a day axis carries legibly). */
export const DAILY_MAX_DAYS = 62;

/** Local-date `YYYY-MM-DD` — deliberately NOT `toISOString().slice(0, 10)`,
 *  which is the UTC date and shifts a late-evening user's data one day over. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgo(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

/** Monday of the week `date` falls in (weeks start Monday). */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  // getDay(): 0 = Sunday … 6 = Saturday. Sunday belongs to the week that
  // started six days earlier, not to the week that starts tomorrow.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

/**
 * How many days a `YYYY-MM-DD` span covers, INCLUSIVE of both ends.
 *
 * Counted in UTC milliseconds from the calendar parts, not from local Dates: a
 * span crossing a DST boundary is 23 or 25 hours long locally, and dividing
 * that by 86 400 000 loses or gains a day.
 */
export function inclusiveDays(start: string, end: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
  };
  return Math.floor((at(end) - at(start)) / 86_400_000) + 1;
}

/**
 * The bucket a span is read at — the normalize rule the whole page turns on.
 *
 * An open start (all time) is months: the book can reach back years, and there
 * is no span to measure before the answer arrives.
 */
export function resolveBucket(start: string | null, end: string): UsageBucket {
  if (!start) return "month";
  const days = inclusiveDays(start, end);
  if (days < HOURLY_UNDER_DAYS) return "hour";
  if (days <= DAILY_MAX_DAYS) return "day";
  return "month";
}

/** The window a start/end pair means, with its bucket attached. */
export function toDateWindow(start: string | null, end: string): UsageDateWindow {
  return { start_date: start, end_date: end, bucket: resolveBucket(start, end) };
}

/** A custom pair, put the right way round and clamped to today. */
export function normalizeCustomRange(
  start: string,
  end: string,
  now: Date = new Date(),
): { start: string; end: string } {
  const today = toIsoDate(now);
  const [from, to] = start <= end ? [start, end] : [end, start];
  // A range whose end is in the future asks for buckets that cannot exist; the
  // API would answer with empty tail buckets that read as measured zeros.
  return { start: from, end: to > today ? today : to };
}

/**
 * The date window a selection means, relative to `now` (injectable so the tests
 * and the deterministic mock never read the wall clock).
 *
 * Takes a bare preset key too, which is what every caller but the picker has.
 */
export function resolveTimeRange(
  selection: UsageTimeRangeKey | UsageRangeSelection,
  now: Date = new Date(),
): UsageDateWindow {
  const sel: UsageRangeSelection =
    typeof selection === "string" ? { key: selection } : selection;

  switch (sel.key) {
    case "today":
      return toDateWindow(toIsoDate(now), toIsoDate(now));
    case "yesterday": {
      const day = toIsoDate(daysAgo(now, 1));
      return toDateWindow(day, day);
    }
    case "this_week":
      return toDateWindow(toIsoDate(mondayOf(now)), toIsoDate(now));
    case "last_week": {
      const monday = mondayOf(now);
      return toDateWindow(toIsoDate(daysAgo(monday, 7)), toIsoDate(daysAgo(monday, 1)));
    }
    case "last_month":
      // 30 days INCLUSIVE of today — 29 back, not 30, or the window holds 31.
      return toDateWindow(toIsoDate(daysAgo(now, 29)), toIsoDate(now));
    case "last_3_months":
      return toDateWindow(toIsoDate(daysAgo(now, 89)), toIsoDate(now));
    case "all_time":
      return toDateWindow(null, toIsoDate(now));
    case "custom": {
      // A half-filled custom selection is not a window. Rather than invent one
      // bound, it falls back to the default preset — the same thing the reader
      // was looking at before they opened the calendar.
      if (!sel.start || !sel.end) return resolveTimeRange(DEFAULT_TIME_RANGE, now);
      const { start, end } = normalizeCustomRange(sel.start, sel.end, now);
      return toDateWindow(start, end);
    }
  }
}

/**
 * A bucket key as the API returns it, back to a Date — for the labels.
 *
 * The three shapes a bucketed answer carries:
 *   month → `2026-09`
 *   day   → `2026-09-13`
 *   hour  → `2026-09-13T14:00:00Z` (or any RFC3339), or a zone-less
 *           `2026-09-13T14` / `2026-09-13 14:00:00`, which is read as LOCAL —
 *           the request names the tenant's zone, so a zone-less answer is
 *           already in it, and parsing it as UTC would move every bar.
 */
export function parseBucketKey(key: string): Date | null {
  const trimmed = key.trim();
  if (trimmed === "") return null;

  const monthOnly = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (monthOnly) return new Date(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1);

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})(?::(\d{2}))?(?::\d{2})?(?:\.\d+)?$/.exec(
    trimmed,
  );
  if (local) {
    return new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5] ?? 0),
    );
  }

  // Zoned: let the platform apply the offset, which is the one thing hand
  // parsing gets wrong.
  const zoned =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(
      trimmed,
    );
  if (!zoned) {
    // NOT `new Date(anything)`. Its parser is lenient in a way that invents
    // data: `new Date("week-37")` is January 2037, so a key shape this client
    // does not know would be plotted as a confident — and wrong — month rather
    // than shown for what it is.
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The key a date falls in, in the shape the API speaks for that bucket. Used
 *  for the axis an EMPTY window is drawn against — never to re-bucket data. */
export function toBucketKey(iso: string, bucket: UsageBucket): string {
  if (bucket === "month") return iso.slice(0, 7);
  if (bucket === "day") return iso;
  return `${iso}T00:00:00`;
}
