/**
 * The arithmetic behind the §4.14 charts, kept out of the components.
 *
 * Three rules live here, and all three are about NOT inventing a number:
 *
 *   - a null value produces a null width, never a zero-width bar;
 *   - a measured-but-tiny value still produces a VISIBLE bar;
 *   - a delta needs both sides measured, or it is null.
 *
 * The third is the one worth a test. A missing baseline treated as zero turns
 * "we do not know the market share" into "+100% versus the market", which is a
 * claim the data cannot support.
 */

/** A bar's fill, 0–1, or null when there is nothing to draw. */
export function barFill(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, Math.min(1, value / max));
}

/**
 * A bar's CSS width.
 *
 * `null` in yields `null` out so a caller renders nothing at all. A measured
 * value clamps to a 2px floor: a 0.01% share drawn at 0px is indistinguishable
 * from an absent bar, and those are different facts.
 */
export function barWidth(value: number | null, max: number): string | null {
  const fill = barFill(value, max);
  if (fill === null) return null;
  return `max(2px, ${(fill * 100).toFixed(2)}%)`;
}

/**
 * One part's share of a whole, as a percentage.
 *
 * Null when the whole is zero or unmeasured — a share of nothing is undefined,
 * not 0% and not 100%.
 */
export function sharePercent(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null) return null;
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}

/** The difference between a subject and its baseline. Null if either is absent. */
export function compareDelta(
  baseline: number | null,
  subject: number | null,
): number | null {
  if (baseline === null || subject === null) return null;
  if (!Number.isFinite(baseline) || !Number.isFinite(subject)) return null;
  return subject - baseline;
}

export type CompareTone = "up" | "down" | "flat";

/**
 * How to colour a delta.
 *
 * `flat` covers both "no measurable difference" and "not measured at all",
 * because neither is a movement to point at — and a null rendered as a red
 * decline would be a fabricated finding.
 */
export function compareTone(delta: number | null, flatBelow = 0.5): CompareTone {
  if (delta === null || Math.abs(delta) <= flatBelow) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * The largest value in a series, for scaling a set of bars against each other.
 *
 * Returns 0 when nothing was measured, which `barFill` reads as "cannot scale"
 * and turns into a null width — so an all-null panel draws empty tracks rather
 * than a row of full bars.
 */
export function seriesMax(values: (number | null)[]): number {
  let max = 0;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    if (value > max) max = value;
  }
  return max;
}

/**
 * Percentage-point change against a previous period, for a KPI delta.
 *
 * Relative, signed, and null unless BOTH periods were measured — the mock's
 * "+18.4% vs the previous 30 days" is meaningless if the previous 30 days were
 * never refreshed, and rendering it as +100% or as 0% would both be lies.
 */
export function periodDelta(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
