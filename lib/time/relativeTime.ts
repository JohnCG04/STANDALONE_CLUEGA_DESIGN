// Relative and precise timestamps, in the reader's language.
//
// Lists are read at a glance, where the exact second never matters: a relative
// label answers "how long ago" and the precise one belongs in a `title`
// attribute, reachable by anyone who wants it and in the way of nobody who does
// not.
//
// This lived in `lib/skills/updatedAt.ts` and was the only locale-aware one of
// the app's four timestamp formatters. The recycle bin needed the same thing,
// so it moved here rather than becoming a fifth. `lib/skills/updatedAt.ts`
// re-exports it under its old names, so its callers and tests are untouched.
//
// Two other formatters remain deliberately separate: `Flow`'s takes a "just now"
// string of its own and counts weeks, and `PulseInbox`'s renders through that
// module's own i18n keys. Repointing either would change wording users already
// read, which is not this change's business.

import { intlLocale } from "@/lib/i18n/intlLocale";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A relative label — "2 days ago" — in the caller's language.
 *
 * Returns null for an absent or unparseable value rather than "Invalid Date":
 * the timestamp is decoration, and a broken one should not be louder than the
 * skill it sits under.
 */
export function relativeTime(
  iso: string | undefined,
  lang: string,
  now: Date = new Date(),
): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const elapsed = parsed.getTime() - now.getTime();
  const absolute = Math.abs(elapsed);

  // Largest unit that still reads sensibly. Below a minute is "now" rather than
  // a count of seconds nobody asked for.
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute < MINUTE
      ? [0, "minute"]
      : absolute < HOUR
        ? [Math.round(elapsed / MINUTE), "minute"]
        : absolute < DAY
          ? [Math.round(elapsed / HOUR), "hour"]
          : absolute < 30 * DAY
            ? [Math.round(elapsed / DAY), "day"]
            : absolute < 365 * DAY
              ? [Math.round(elapsed / (30 * DAY)), "month"]
              : [Math.round(elapsed / (365 * DAY)), "year"];

  try {
    return new Intl.RelativeTimeFormat(intlLocale(lang), {
      numeric: "auto",
    }).format(value, unit);
  } catch {
    // An unknown locale tag should not cost the label entirely.
    return parsed.toISOString().slice(0, 10);
  }
}

/**
 * The full timestamp, for the `title` attribute behind the relative one.
 */
export function preciseTime(
  iso: string | undefined,
  lang: string,
): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}
