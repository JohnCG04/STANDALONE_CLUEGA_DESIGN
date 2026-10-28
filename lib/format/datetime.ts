/**
 * Locale-aware date/time formatting for UI surfaces that receive ISO-8601
 * timestamps from the CDP API.
 *
 * Lives in lib/ rather than beside its first caller because the existing locale
 * mapping (localeToIntlLocale) sits in
 * resources/.../AccountList/lib/useAdvertisingAccountSelectionStore.ts, a module
 * that builds a zustand store at import time — pulling that whole graph into the
 * settings bundle to reach a three-line mapping costs more than restating it.
 *
 * NOTE: that AccountList module also has a private formatAdvertiserTimestamp
 * with the same body as formatDateTime below. It should move onto this helper
 * the next time that file is touched; it was left alone here because it feeds
 * mapAdvertiserToBoundRow, which several indexed execution flows run through.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * One `Intl.DateTimeFormat` per locale and option set, reused. Building one is
 * the expensive part of formatting, and the chat list and transcript format a
 * timestamp per row on every render.
 */
function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** UI language code (see hooks/useTranslate) mapped to a BCP-47 locale. */
export function intlLocaleFor(lang: string): string {
  if (lang === "vn" || lang === "vi") return "vi-VN";
  if (lang === "zh") return "zh-TW";
  // Gregorian: th-TH alone counts years in the Buddhist era (2026 → 2569).
  if (lang === "th") return "th-TH-u-ca-gregory";
  return "en-US";
}

/**
 * Formats an ISO-8601 timestamp as a localized date + short time, e.g.
 * "4 Aug 2026, 11:29" (en-US) or "4 thg 8, 2026 11:29" (vi-VN).
 *
 * Returns `fallback` for a missing value and the raw input for an unparseable
 * one, so a malformed timestamp still shows what the server sent instead of
 * "Invalid Date". Intl is wrapped because a bad locale tag throws a RangeError.
 */
export function formatDateTime(
  value: string | null | undefined,
  lang: string,
  fallback = "—",
): string {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  try {
    return dateTimeFormat(intlLocaleFor(lang), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  } catch {
    return value;
  }
}

/**
 * Formats an ISO-8601 timestamp for a media asset tile, e.g.
 * "Aug 4, 2026, 11:29 AM". Two-digit hour/minute rather than formatDateTime's
 * `timeStyle: "short"`, which is what the asset grids have always rendered.
 *
 * Returns the raw input for an unparseable value so a malformed timestamp still
 * shows what the server sent instead of "Invalid Date".
 */
export function formatCreativeDate(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(intlLocaleFor(lang), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Same fallback contract as formatDateTime, shared by the formatters below. */
function withParsed(
  value: string | null | undefined,
  fallback: string,
  format: (parsed: Date) => string,
): string {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  try {
    return format(parsed);
  } catch {
    return value;
  }
}

/**
 * Same as formatDateTime plus seconds, e.g. "Sep 8, 2026, 2:30:24 PM".
 *
 * For logs whose entries land seconds apart — the attribution sync log is why
 * this exists: two retries inside one minute render as the same timestamp
 * without seconds, and the order of the rows stops being readable.
 */
export function formatDateTimeWithSeconds(
  value: string | null | undefined,
  lang: string,
  fallback = "—",
): string {
  return withParsed(value, fallback, (parsed) =>
    dateTimeFormat(intlLocaleFor(lang), {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(parsed),
  );
}

/**
 * Formats an ISO-8601 timestamp as day + month, e.g. "Aug 5" (en-US) or
 * "5 thg 8" (vi-VN).
 *
 * No year: this is for headers where the timestamp is recent by construction
 * ("Updated Aug 5"), so the year is noise. Use formatDateTime when the value can
 * be arbitrarily old.
 */
export function formatShortDate(
  value: string | null | undefined,
  lang: string,
  fallback = "—",
): string {
  return withParsed(value, fallback, (parsed) => shortDate(parsed, lang));
}

function shortDate(parsed: Date, lang: string): string {
  return dateTimeFormat(intlLocaleFor(lang), {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function fullDate(parsed: Date, lang: string): string {
  return dateTimeFormat(intlLocaleFor(lang), {
    dateStyle: "medium",
  }).format(parsed);
}

function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats an ISO-8601 timestamp for a list of recent items: the time alone when
 * it lands today ("10:55 AM"), "<yesterdayLabel>, 4:01 PM" for the day before,
 * and day + month for anything older.
 *
 * `yesterdayLabel` is a parameter because this module has no dictionary access —
 * the caller passes t("..."). `now` is injectable so the day boundaries can be
 * tested without touching the clock.
 */
export function formatTaskTimestamp(
  value: string | null | undefined,
  lang: string,
  yesterdayLabel: string,
  fallback = "—",
  now: Date = new Date(),
): string {
  return withParsed(value, fallback, (parsed) => {
    const time = dateTimeFormat(intlLocaleFor(lang), {
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);

    if (isSameDay(parsed, now)) return time;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(parsed, yesterday)) return `${yesterdayLabel}, ${time}`;

    return shortDate(parsed, lang);
  });
}

/**
 * Formats the timestamp shown at the top of a message's context menu.
 * Unlike a compact list timestamp, today's value keeps the explicit day label
 * so the menu remains self-explanatory when it is opened away from the bubble.
 */
export function formatMessageMenuTimestamp(
  value: string | null | undefined,
  lang: string,
  todayLabel: string,
  yesterdayLabel: string,
  fallback = "—",
  now: Date = new Date(),
): string {
  return withParsed(value, fallback, (parsed) => {
    const time = dateTimeFormat(intlLocaleFor(lang), {
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);

    if (isSameDay(parsed, now)) return `${todayLabel}, ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(parsed, yesterday)) return `${yesterdayLabel}, ${time}`;

    return dateTimeFormat(intlLocaleFor(lang), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  });
}

/** Compact timestamp for a conversation row: time today, label yesterday, date otherwise. */
export function formatConversationTimestamp(
  value: string | null | undefined,
  lang: string,
  yesterdayLabel: string,
  fallback = "—",
  now: Date = new Date(),
): string {
  return withParsed(value, fallback, (parsed) => {
    if (isSameDay(parsed, now)) {
      return dateTimeFormat(intlLocaleFor(lang), {
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed);
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(parsed, yesterday)
      ? yesterdayLabel
      : fullDate(parsed, lang);
  });
}

/**
 * Absolute timestamp in the viewer's timezone, exactly "YYYY-MM-DD HH:mm".
 *
 * FR-153 pins this format for the hover reveal behind a relative message
 * timestamp, so it is deliberately not locale-styled.
 */
export function formatTimestampYmdHm(
  value: string | null | undefined,
  fallback = "—",
): string {
  return withParsed(value, fallback, (parsed) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${localDateKey(parsed)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  });
}

/** Viewer-local calendar identity and localized label for transcript dividers. */
export function formatConversationDay(
  value: string | null | undefined,
  lang: string,
  todayLabel: string,
  yesterdayLabel: string,
  now: Date = new Date(),
): { dateTime: string; label: string } | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    dateTime: localDateKey(parsed),
    label: isSameDay(parsed, now)
      ? todayLabel
      : isSameDay(parsed, yesterday)
        ? yesterdayLabel
        : fullDate(parsed, lang),
  };
}
