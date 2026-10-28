// Pure rules for the trend detail view (what the modal shows when a card is
// opened rather than picked). Here beside the client rather than in the modal's
// folder because `resources/**` sits outside the test glob, and the two facts
// most likely to regress silently are numeric: the engagement-rate division and
// the "real data only" tile omission — the corpus has no CTR percentile, no
// watch-through rate and no per-second curve, so a tile either shows a stored
// number or does not exist.

import type { TrendVideo } from "./client";
import { formatTrendViews } from "./localizeOptions";

/** Compact count in the given locale; "en" keeps the historical "2.4M" shape.
 *  Locale-aware because a dot decimal is wrong on a Vietnamese UI — the same
 *  defect the card's view badge had. */
export function formatCount(value: number | undefined, locale = "en"): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "0";
  return formatTrendViews(value, locale);
}

export function formatPercentage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

/** Decimals on the trend score. Two, not one, because the score is
 *  `log1p(hashtag_views) / sqrt(rank)` — a logarithm, so vast differences in
 *  hashtag reach land in the second decimal. At one decimal a whole page of the
 *  picker rendered the identical "21.1" (six genuinely different scores,
 *  21.1434 down to 21.1118) and read as a hardcoded placeholder. Not three:
 *  the score is a rank heuristic, and milli-precision on a heuristic is
 *  theatre. Corpus-wide the value spans ~12.8 to ~21.1. */
const TREND_SCORE_DECIMALS = 2;

export function formatTrendScore(value: number): string {
  return Number.isFinite(value)
    ? value.toFixed(TREND_SCORE_DECIMALS)
    : (0).toFixed(TREND_SCORE_DECIMALS);
}

/**
 * Engagement rate in percent, or null when views are missing/zero — the tile is
 * omitted rather than showing a 0% the data cannot support. Missing counters
 * count as 0 engagements, not as "unknown": the corpus stores absent metrics
 * and zero metrics the same way.
 */
export function engagementRatePercent(video: TrendVideo): number | null {
  const views = video.video_views;
  if (!views || views <= 0) return null;
  const engagements =
    (video.likes ?? 0) +
    (video.comments ?? 0) +
    (video.shares ?? 0) +
    (video.favorites ?? 0);
  return (engagements / views) * 100;
}

export type TrendMetricKey =
  | "views"
  | "engagementRate"
  | "trendScore"
  | "likes"
  | "comments"
  | "shares";

export type TrendMetricTile = {
  key: TrendMetricKey;
  value: string;
  /**
   * The same number at full precision, for a hover tooltip — set ONLY when
   * `value` hides something: an abbreviation ("2.4M" for 2,437,891) or a
   * rounding ("21.14" for 21.14339454110102). Left undefined when the tile
   * already shows the whole number, so hovering never produces a tooltip that
   * repeats what is on screen, and undefined for a placeholder, whose tooltip
   * is a translated explanation the view supplies instead.
   */
  precise?: string;
};

/** Shown where the corpus captured no number. Deliberately NOT "0": the
 *  discovery corpus stores "never captured" as the column default 0, and the
 *  API now omits those fields precisely so this layer can say "unknown"
 *  instead of asserting a measurement nobody took. A tile reading 0 therefore
 *  means a real, counted zero. */
export const METRIC_PLACEHOLDER = "--";

/**
 * The performance tiles for one trend, in display order — always the same six,
 * so the panel keeps its shape across videos and the reader can tell "no data"
 * from "small number" at a glance. A metric the corpus never stored carries
 * METRIC_PLACEHOLDER rather than being dropped or zero-filled.
 */
export function trendMetricTiles(
  video: TrendVideo,
  locale = "en",
): TrendMetricTile[] {
  // A tooltip earns its place only by revealing something. `full` is the
  // number written out; hand it over as `precise` when the tile is showing a
  // shortened form of it, and drop it when the two read the same.
  const revealing = (displayed: string, full: string): string | undefined =>
    displayed === full ? undefined : full;

  const countTile = (
    key: TrendMetricKey,
    value: number | undefined,
  ): TrendMetricTile => {
    if (value === undefined) return { key, value: METRIC_PLACEHOLDER };
    const displayed = formatCount(value, locale);
    return {
      key,
      value: displayed,
      // Grouped in the reader's locale, matching the abbreviation above it: a
      // dot decimal is wrong on a Vietnamese UI.
      precise: revealing(displayed, value.toLocaleString(locale)),
    };
  };

  const engagement = engagementRatePercent(video);
  const score = video.trend_score;

  return [
    countTile("views", video.video_views),
    {
      key: "engagementRate",
      // Null means there were no views to divide by, which makes the rate
      // unknowable rather than 0%.
      value: engagement === null ? METRIC_PLACEHOLDER : formatPercentage(engagement),
      // No tooltip: this one is a ratio we computed, not a stored figure, so
      // "full precision" would just be more decimals of our own arithmetic —
      // "0.7149%" over "0.71%" tells the reader nothing they can act on.
    },
    {
      key: "trendScore",
      value: score === undefined ? METRIC_PLACEHOLDER : formatTrendScore(score),
      precise:
        score === undefined
          ? undefined
          : revealing(formatTrendScore(score), String(score)),
    },
    countTile("likes", video.likes),
    countTile("comments", video.comments),
    countTile("shares", video.shares),
  ];
}

/** i18n lookup with the raw-reason fallback the ad-video library established:
 *  an unknown corpus reason reads as its own words, not as a broken key path. */
export function rankingReasonLabel(
  reason: string,
  t: (path: string) => string,
): string {
  const label = t(`appChat.adVideo.modal.rankingReasons.${reason}`);
  return label.includes("appChat.") ? reason.replaceAll("_", " ") : label;
}

export type EngagementCurvePoint = {
  /** Seconds into the video. */
  second: number;
  /** Interaction level in percent, peak = the video's engagement rate. */
  percent: number;
};

/** mulberry32 — tiny seeded PRNG, so the same video always draws the same
 *  curve across opens, prev/next round-trips and reloads. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * ESTIMATED interaction-over-time curve — the corpus stores no per-second
 * analytics, so this is a Symphony-shaped illustration (early spike, long
 * decay, small end lift), deterministic per video and scaled so its peak is
 * the video's real engagement rate. The section that renders it carries the
 * "estimated" label; this function must never be mistaken for measured data.
 *
 * Null when there is no engagement rate to scale to — no metrics, no curve.
 * A missing duration falls back to a 20s axis (the corpus median short-video
 * length): the shape is already an estimate, but the PEAK value never is.
 */
export function engagementCurve(video: TrendVideo): EngagementCurvePoint[] | null {
  const duration =
    video.duration_seconds && video.duration_seconds > 0
      ? video.duration_seconds
      : 20;
  const peak = engagementRatePercent(video);
  if (peak === null || peak <= 0) return null;

  const random = seededRandom(hashString(video.video_id));
  const samples = Math.min(Math.max(Math.floor(duration), 8), 60);
  const points: EngagementCurvePoint[] = [];
  let max = 0;

  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    // Rise to a spike inside the first ~8% of the clip, then exponential decay
    // with a mild lift on the final beat — the canonical short-video shape.
    const rise = Math.min(1, x / 0.08);
    const decay = Math.exp(-4.5 * Math.max(0, x - 0.08));
    const endLift = 0.25 * x ** 8;
    const noise = 0.88 + random() * 0.24;
    const value = (rise * decay + endLift) * noise;
    max = Math.max(max, value);
    points.push({ second: Math.round(x * duration), percent: value });
  }

  if (max <= 0) return null;
  return points.map((point) => ({
    second: point.second,
    percent: (point.percent / max) * peak,
  }));
}

/** Whether a string is a link we can actually hand to a backend. */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The post's canonical watch URL, preferring the API's field but never trusting
 * it blindly.
 *
 * `video_url` has been observed arriving as a display label ("TikTok ·
 * Blasianithink"). A truthiness check passes that straight through as the
 * reference url, where it beats the (valid) cover and leaves the backend with
 * nothing to fetch — so the shape is checked, and `handle_name` + `video_id`,
 * which are the post's real identity, rebuild it when the check fails. Mirrors
 * `tikTokOneWatchURL` in the CDP and `public_url` in media-ai.
 */
export function trendWatchUrl(video: {
  video_url?: string | null;
  handle_name?: string | null;
  video_id?: string | null;
}): string {
  if (isHttpUrl(video.video_url)) return video.video_url as string;
  const handle = (video.handle_name ?? "").trim().replace(/^@/, "");
  const id = (video.video_id ?? "").trim();
  if (!handle || !id) return "";
  return `https://www.tiktok.com/@${handle}/video/${id}`;
}

/**
 * TikTok's clean embedded player (Player v1) for one post. Used as the
 * playback fallback when the corpus' signed media url is blanked or dead.
 * `/embed/v2` is deliberately NOT used: that page brings its own second play
 * button, a related-videos rail and a promo banner — inside a 340px pane it
 * reads as a broken UI. Player v1 with `rel=0` is just the video + controls.
 */
export function tiktokPlayerPageUrl(videoId: string): string {
  const params = new URLSearchParams({
    rel: "0", // no related-videos rail
    autoplay: "0",
    play_button: "1",
    volume_control: "1",
    progress_bar: "1",
    fullscreen_button: "1",
    timestamp: "1",
    music_info: "0",
    description: "0",
  });
  return `https://www.tiktok.com/player/v1/${videoId}?${params.toString()}`;
}

/** Second at which the estimated curve peaks — the chart's one-line insight. */
export function curvePeakSecond(points: EngagementCurvePoint[]): number {
  let best = points[0] ?? { second: 0, percent: 0 };
  for (const point of points) {
    if (point.percent > best.percent) best = point;
  }
  return best.second;
}
