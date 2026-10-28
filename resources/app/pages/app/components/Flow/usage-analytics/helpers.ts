// Pure view-model math for the Usage Analytics page, plus the bits the blocks
// share around the charts (the rank-assigned series palette, the short date
// label). Kept out of the components so the parts that can be wrong in
// interesting ways (percentages that don't sum, a legend that hides the wrong
// series) run under node --test; the Chart.js wiring itself lives in
// @/components/dashboard/widgets/chartjs.

import {
  parseBucketKey,
  toIsoDate,
  type UsageBucket,
  type UsageDateWindow,
} from "@/lib/flow/usage-analytics/timeRange";
import { intlLocale } from "@/lib/i18n/intlLocale";

import { VIZ_SERIES } from "../../MarketingReports/shared/viz";
import { MAX_LEGEND_SERIES } from "./constants";
import type {
  LegendGrouping,
  ModelShare,
  RankedSeries,
  UsageChartFilters,
  UsageGenerationsFilters,
} from "./types";
import type {
  ModelUsageSeries,
  ModelUsageTotal,
  UsageSeriesFilters,
} from "./usage-analytics.service";

/**
 * The colour of the series at rank `index` (largest first). Assigned BY RANK
 * and shared by the usage chart and the Models Usage list, so the same model
 * wears the same colour in both blocks — both sort by consumption over the
 * same filtered window, so their ranks agree. The seven-colour palette is the
 * report kit's, contrast-checked in both themes.
 */
export function seriesColorAt(index: number): string {
  return VIZ_SERIES[index % VIZ_SERIES.length];
}

/** "Aug 4" in the user's language, from a `YYYY-MM-DD` bucket. */
export function shortDateLabel(iso: string, lang: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), { month: "short", day: "numeric" }).format(
      new Date(y, m - 1, d),
    );
  } catch {
    return iso;
  }
}

function formatParts(
  date: Date,
  lang: string,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), options).format(date);
  } catch {
    return fallback;
  }
}

/**
 * The x-axis labels for a bucketed answer — hour, day or month keys as the API
 * returns them (see parseBucketKey).
 *
 * Takes the WHOLE axis rather than one key at a time for the one case that
 * needs its neighbours: hourly buckets inside a single calendar day print as
 * "14:00", because repeating the date 24 times says nothing, while an hourly
 * window spanning several days has to keep the day or the axis restarts at
 * 00:00 with no way to tell which day it is.
 */
export function bucketLabels(
  keys: readonly string[],
  lang: string,
  bucket: UsageBucket,
): string[] {
  if (bucket === "month") {
    return keys.map((key) => {
      const date = parseBucketKey(key);
      return date ? formatParts(date, lang, { month: "short", year: "numeric" }, key) : key;
    });
  }
  if (bucket === "day") return keys.map((key) => shortDateLabel(key.slice(0, 10), lang));

  const dates = keys.map((key) => parseBucketKey(key));
  const days = new Set(dates.map((date) => (date ? toIsoDate(date) : "")));
  const sameDay = days.size <= 1;
  return keys.map((key, index) => {
    const date = dates[index];
    if (!date) return key;
    return formatParts(
      date,
      lang,
      sameDay
        ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
        : { month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23" },
      key,
    );
  });
}

/**
 * The window under the picker's label — "Aug 15 – Sep 13", or "Sep 13" when
 * both ends are the same day. An open start prints only the end, because
 * "all time" has no start to name.
 */
export function formatWindowRange(window: UsageDateWindow, lang: string): string {
  const end = shortDateLabel(window.end_date, lang);
  if (!window.start_date) return end;
  const start = shortDateLabel(window.start_date, lang);
  return start === end ? end : `${start} – ${end}`;
}


/**
 * Per-model share of consumption, descending, summing to EXACTLY 100.
 *
 * Largest-remainder rounding rather than per-row Math.round: independently
 * rounded rows sum to 99 or 101 often enough that the table would routinely
 * contradict its own caption. Zero-consumption input yields [] — an empty
 * ranking, not a division by zero dressed as data.
 */
export function computeModelShares(totals: readonly ModelUsageTotal[]): ModelShare[] {
  const total = totals.reduce((sum, row) => sum + Math.max(0, row.credits), 0);
  if (total <= 0) return [];

  const ranked = [...totals]
    .filter((row) => row.credits > 0)
    .sort((a, b) => b.credits - a.credits);

  const exact = ranked.map((row) => (row.credits / total) * 100);
  const floors = exact.map(Math.floor);
  let leftover = 100 - floors.reduce((sum, value) => sum + value, 0);

  // Hand the leftover points to the rows that lost the most in flooring.
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  const percents = [...floors];
  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    percents[index] += 1;
    leftover -= 1;
  }

  return ranked.map((row, index) => ({ ...row, percent: percents[index] }));
}

export function seriesTotal(series: ModelUsageSeries): number {
  return series.points.reduce((sum, point) => sum + (point.credits ?? 0), 0);
}

/**
 * US-02's legend rule: the top series by consumption keep their chips, the
 * low-usage tail groups into "+n more". Grouped models keep their plot lines —
 * only the legend folds. No group is made for a single overflow series: a
 * "+1 more" chip costs the same space the chip it hides would have.
 */
export function groupLegendSeries(
  series: readonly ModelUsageSeries[],
  maxVisible: number = MAX_LEGEND_SERIES,
): LegendGrouping {
  const ranked = [...series].sort((a, b) => seriesTotal(b) - seriesTotal(a));
  if (ranked.length <= maxVisible + 1) return { visible: ranked, more: [] };
  return {
    visible: ranked.slice(0, maxVisible),
    more: ranked.slice(maxVisible),
  };
}

/**
 * The series largest first, each wearing its rank's colour and carrying its
 * total. Rank decides BOTH the colour and the draw order: the Models Usage
 * list ranks by the same consumption, so one model wears one colour in both
 * blocks, and a small series is drawn after — on top of — a large one's fill.
 * The input array is left untouched (the page hands it to other blocks).
 */
export function rankSeries(
  series: readonly ModelUsageSeries[],
  colorAt: (index: number) => string = seriesColorAt,
): RankedSeries[] {
  return [...series]
    .sort((a, b) => seriesTotal(b) - seriesTotal(a))
    .map((entry, index) => ({ ...entry, color: colorAt(index), total: seriesTotal(entry) }));
}

/**
 * The tail of a long row list folded into one summary row.
 *
 * A hover on a day twelve models worked draws a card taller than the plot it
 * hangs in — so the tail is folded, not printed. Rows must already be ordered
 * (the callers sort largest first), because what is folded is whatever falls
 * past `max`, and `fold` is handed the hidden rows AND their total so the
 * summary row can state both.
 */
export function foldRowsTail<T extends { raw: number }>(
  rows: readonly T[],
  max: number,
  fold: (hidden: readonly T[], total: number) => T,
): T[] {
  // Folding a single overflow row costs the line it saves — same rule the
  // legend's "+n more" follows.
  if (rows.length <= max + 1) return [...rows];
  const hidden = rows.slice(max);
  const total = hidden.reduce((sum, row) => sum + row.raw, 0);
  return [...rows.slice(0, max), fold(hidden, total)];
}

/**
 * `#rrggbb` / `#rgb` → `rgba(r, g, b, alpha)`. Canvas has no fill-opacity, so
 * a translucent fill (the area under a line, the ground under a hatch) needs
 * the alpha inside the colour. Anything that is not a hex colour comes back
 * unchanged rather than mangled.
 */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : match[1];
  const value = parseInt(digits, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Params-shape filters: empty selections are OMITTED — absence means "all". */
export function toSeriesParams(filters: UsageChartFilters): UsageSeriesFilters {
  return {
    ...(filters.users.length > 0 ? { user_ids: filters.users } : {}),
    ...(filters.features.length > 0 ? { feature_ids: filters.features } : {}),
    ...(filters.models.length > 0 ? { model_ids: filters.models } : {}),
  };
}

/** The same selections as a stable cache-key fragment — empties included. */
export function toKeyFilters(filters: UsageChartFilters) {
  return {
    user_ids: filters.users,
    feature_ids: filters.features,
    model_ids: filters.models,
  };
}

/** The ledger's selections as a cache-key fragment: the chart facets plus its own. */
export function toGenerationsKeyFilters(filters: UsageGenerationsFilters) {
  return {
    ...toKeyFilters(filters),
    platforms: filters.platforms,
    credit_outcomes: filters.outcomes,
  };
}

/**
 * The selections as the API takes them: ONE value per facet.
 *
 * The endpoints match a single model / action / member, so the first selected
 * value is the one applied — and the UI state clamps each facet to one entry so
 * a user can never tick two and be shown the effect of one. Widening this to a
 * real multi-select is a backend change ($in instead of equality), not a
 * frontend one.
 */
export function toApiFilters(filters: UsageChartFilters): {
  userId?: string;
  action?: string;
  model?: string;
} {
  return {
    ...(filters.users[0] ? { userId: filters.users[0] } : {}),
    ...(filters.features[0] ? { action: filters.features[0] } : {}),
    ...(filters.models[0] ? { model: filters.models[0] } : {}),
  };
}

/**
 * The bucket-over-bucket change, as the tooltip prints it ("+8.5%", "-3.2%").
 *
 * `undefined` — not "0%" — whenever the comparison cannot be made: the first
 * bucket of the window has nothing behind it, an unsynced day is `null` rather
 * than a measured zero, and a rise from zero is an infinite percentage. In all
 * three the row simply carries no delta, because printing one would be an
 * invention.
 */
export function formatDelta(current: number | null, previous: number | null): string | undefined {
  if (current === null || previous === null || previous <= 0) return undefined;
  const percent = ((current - previous) / previous) * 100;
  if (!Number.isFinite(percent)) return undefined;
  // `|| 0` folds -0 into 0: a change of -0.04% rounds to negative zero, and
  // `(-0).toFixed(1)` is the string "-0.0" — a fall that did not happen.
  const rounded = Math.round(percent * 10) / 10 || 0;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/**
 * Which way `formatDelta` pointed — read back OFF the formatted string rather
 * than recomputed, so the arrow can never disagree with the number beside it:
 * a rise of +0.04% prints as "0.0%", and it must carry the flat mark, not an
 * up arrow over a figure that shows no change. `undefined` wherever the delta
 * itself is undefined, which is every case the comparison cannot be made.
 */
export function deltaTrend(
  current: number | null,
  previous: number | null,
): "up" | "down" | "flat" | undefined {
  const delta = formatDelta(current, previous);
  if (delta === undefined) return undefined;
  if (delta.startsWith("+")) return "up";
  if (delta.startsWith("-")) return "down";
  return "flat";
}

/**
 * The letters an avatar shows for a member.
 *
 * Two where the roster knows a full name ("Khang Nguyen" → "KN") and one where
 * it knows a single word or only an email — an initial pair invented out of an
 * address ("me", from meooo@…) reads as a name the directory never gave. A
 * member with neither gets "?" rather than an empty circle, because the circle
 * is what tells the eye a row belongs to a person at all.
 */
export function memberInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  const source = words[0] ?? email.trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}

/**
 * A stable hue per member, hashed from their id.
 *
 * The same face keeps the same colour between renders and between sessions — an
 * avatar that changes hue on every load is noise, not identity. The red band is
 * skipped: on this page red means a failed job and a debit, and a person is
 * neither. Mirrors the tenant directory's avatars so one member is one colour
 * across the app.
 */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return 30 + (Math.abs(hash) % 300);
}

/** Ids shorter than this are already readable — eliding them would only hide
 *  characters while saving none. */
const SHORT_ID_LENGTH = 14;

/**
 * A user id the roster could not name, shortened for the column:
 * "019da181-dcdb-7334-b60c-03a2cb99c416" → "019da181…c416".
 *
 * Both ends are kept because that is how a person checks an id against one they
 * are holding — and the cell carries the WHOLE id as its title, so the elision
 * never costs anyone the value they need to paste into a support request.
 */
export function shortUserId(id: string): string {
  const value = id.trim();
  if (value.length <= SHORT_ID_LENGTH) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
