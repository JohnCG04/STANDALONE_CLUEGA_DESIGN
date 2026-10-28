// Wire tolerance for the TikTok Popular trend corpus. The corpus' response
// shapes were specified by curl only — no captured payload — so every field is
// resolved through a pick-list of plausible spellings with the CANONICAL name
// first: a payload that already matches the canonical shape passes through
// unchanged, and the first live payload that doesn't costs an edit to exactly
// this one file. Pure module (no client imports) so it sits inside the test
// glob beside trendDetail.ts.
//
// The `analysis` variant set is anchored on the one shape this backend team
// has already shipped: the tiktok-one ad-videos DTO
// (lib/integrations/client.ts — summary / detailed_description /
// content_signals / hashtag_topics / interpretation{likely_objective,
// commercial_intent, virality_signals}).

export type TrendVideoAnalysis = {
  summary?: string;
  detailedDescription?: string;
  /** Generic bullets — used when the wire hands us a bare list of sentences. */
  points: string[];
  contentSignals: string[];
  hashtagTopics: string[];
  viralitySignals: string[];
  likelyObjective?: string;
  commercialIntent?: string;
};

export type TrendVideo = {
  video_id: string;
  handle_name?: string;
  display_name?: string;
  thumbnail_url?: string;
  embed_url?: string;
  /** Canonical watch URL. Never expires, unlike `embed_url`. */
  video_url?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
  video_views?: number;
  duration_seconds?: number;
  performance_score?: number;
  trend_score?: number;
  ranking_reasons?: string[];
  create_time?: string;
  caption_hashtags?: string[];
  analysis?: TrendVideoAnalysis;
};

/** Normalized two-level category (NOT a wire echo): `id` is the enum-like
 *  code the videos endpoint filters by (e.g. BEAUTY_AND_PERSONAL_CARE). */
export type TrendCategory = {
  id: string;
  name: string;
  children: TrendCategory[];
};

export type TrendPageInfo = {
  pageNo: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function pickString(rec: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function pickNumber(rec: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function pickStringArray(rec: UnknownRecord, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (!Array.isArray(value)) continue;
    const strings = value.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
    );
    if (strings.length > 0) return strings;
  }
  return undefined;
}

/** The payload itself when it is an array, else the first array found under
 *  the given keys. Null means "no list here" — the caller decides the shape. */
function pickList(payload: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  const rec = asRecord(payload);
  if (!rec) return null;
  for (const key of keys) {
    const value = rec[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

/** BEAUTY_AND_PERSONAL_CARE → "Beauty and personal care". */
export function humanizeCode(code: string): string {
  const words = code.replaceAll("_", " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : code;
}

const LIST_KEYS = ["items", "videos", "categories", "list", "data"];

const CATEGORY_ID_KEYS = [
  "id",
  "code",
  "value",
  // What the tiktok-popular categories endpoint ACTUALLY serves for a level-1
  // group ({level1, level1_name, level2:[{value, name}]}). Missing from this
  // list, every group normalized to null and the industry dropdown — gated on
  // categories.length > 0 — silently never rendered. First live payload, one
  // edit, exactly as the header promises.
  "level1",
  "category_id",
  "label_id",
  "category",
  "key",
];
const CATEGORY_NAME_KEYS = [
  "name",
  "level1_name",
  "label",
  "label_name",
  "category_name",
  "display_name",
  "title",
];
const CATEGORY_CHILD_KEYS = [
  "children",
  "sub_categories",
  "subcategories",
  "level2",
  "second_level",
  "sub_labels",
];

function normalizeCategory(entry: unknown): TrendCategory | null {
  // A bare code string is a legal category: name is humanized from it.
  if (typeof entry === "string" && entry.trim() !== "") {
    return { id: entry, name: humanizeCode(entry), children: [] };
  }
  const rec = asRecord(entry);
  if (!rec) return null;
  const id = pickString(rec, CATEGORY_ID_KEYS);
  if (!id) return null;
  const name = pickString(rec, CATEGORY_NAME_KEYS) ?? humanizeCode(id);
  const childList = pickList(rec, CATEGORY_CHILD_KEYS);
  const children = childList
    ? childList
        .map(normalizeCategory)
        .filter((child): child is TrendCategory => child !== null)
    : [];
  return { id, name, children };
}

export function normalizeTrendCategories(payload: unknown): TrendCategory[] {
  const list = pickList(payload, LIST_KEYS);
  if (!list) return [];
  return list
    .map(normalizeCategory)
    .filter((category): category is TrendCategory => category !== null);
}

const ANALYSIS_KEYS = ["analysis", "video_analysis", "ai_analysis", "insights"];

export function normalizeTrendAnalysis(
  raw: unknown,
): TrendVideoAnalysis | undefined {
  if (typeof raw === "string" && raw.trim() !== "") {
    return {
      summary: raw,
      points: [],
      contentSignals: [],
      hashtagTopics: [],
      viralitySignals: [],
    };
  }
  if (Array.isArray(raw)) {
    const points = raw.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
    );
    if (points.length === 0) return undefined;
    return {
      points,
      contentSignals: [],
      hashtagTopics: [],
      viralitySignals: [],
    };
  }
  const rec = asRecord(raw);
  if (!rec) return undefined;
  // interpretation{} is where the tiktok-one shape nests the read; tolerate
  // the same fields flat on the analysis object too.
  const interpretation = asRecord(rec.interpretation);

  const summary = pickString(rec, ["summary", "overview", "analysis_summary"]);
  const detailedDescription = pickString(rec, [
    "detailed_description",
    "details",
    "description",
  ]);
  const contentSignals = pickStringArray(rec, ["content_signals", "signals"]) ?? [];
  const hashtagTopics = pickStringArray(rec, ["hashtag_topics", "topics"]) ?? [];
  const viralitySignals =
    (interpretation
      ? pickStringArray(interpretation, ["virality_signals"])
      : undefined) ??
    pickStringArray(rec, ["virality_signals"]) ??
    [];
  const likelyObjective =
    (interpretation
      ? pickString(interpretation, ["likely_objective", "objective"])
      : undefined) ?? pickString(rec, ["likely_objective", "objective"]);
  const commercialIntent =
    (interpretation
      ? pickString(interpretation, ["commercial_intent"])
      : undefined) ?? pickString(rec, ["commercial_intent"]);

  const hasContent =
    summary !== undefined ||
    detailedDescription !== undefined ||
    likelyObjective !== undefined ||
    commercialIntent !== undefined ||
    contentSignals.length > 0 ||
    hashtagTopics.length > 0 ||
    viralitySignals.length > 0;
  if (!hasContent) return undefined;

  const analysis: TrendVideoAnalysis = {
    points: [],
    contentSignals,
    hashtagTopics,
    viralitySignals,
  };
  if (summary !== undefined) analysis.summary = summary;
  if (detailedDescription !== undefined) {
    analysis.detailedDescription = detailedDescription;
  }
  if (likelyObjective !== undefined) analysis.likelyObjective = likelyObjective;
  if (commercialIntent !== undefined) analysis.commercialIntent = commercialIntent;
  return analysis;
}

export function normalizeTrendVideo(raw: unknown): TrendVideo | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const videoId = pickString(rec, ["video_id", "id", "item_id", "aweme_id"]);
  if (!videoId) return null;
  const author = asRecord(rec.author);

  // Keys the wire did not provide are OMITTED, never written as `undefined`:
  // trendMetricTiles tells an absent metric (placeholder) from a captured 0
  // (the number), and a written undefined would survive JSON round-trips
  // differently than an absent key.
  const video: TrendVideo = { video_id: videoId };

  const handleName =
    pickString(rec, ["handle_name", "handle", "author_handle", "unique_id"]) ??
    (author ? pickString(author, ["unique_id", "handle", "handle_name"]) : undefined);
  if (handleName !== undefined) video.handle_name = handleName;

  const displayName =
    pickString(rec, ["display_name", "author_name", "nickname"]) ??
    (author ? pickString(author, ["nickname", "display_name", "name"]) : undefined);
  if (displayName !== undefined) video.display_name = displayName;

  const thumbnailUrl = pickString(rec, [
    "thumbnail_url",
    "cover_url",
    "cover",
    "thumbnail",
    "poster_url",
    "cover_image_url",
  ]);
  if (thumbnailUrl !== undefined) video.thumbnail_url = thumbnailUrl;

  const embedUrl = pickString(rec, ["embed_url", "embed"]);
  if (embedUrl !== undefined) video.embed_url = embedUrl;

  const videoUrl = pickString(rec, [
    "video_url",
    "share_url",
    "web_url",
    "tiktok_url",
    "url",
  ]);
  if (videoUrl !== undefined) video.video_url = videoUrl;

  const caption = pickString(rec, ["caption", "title", "desc", "description"]);
  if (caption !== undefined) video.caption = caption;

  const likes = pickNumber(rec, ["likes", "like_count", "digg_count"]);
  if (likes !== undefined) video.likes = likes;

  const comments = pickNumber(rec, ["comments", "comment_count"]);
  if (comments !== undefined) video.comments = comments;

  const shares = pickNumber(rec, ["shares", "share_count"]);
  if (shares !== undefined) video.shares = shares;

  const favorites = pickNumber(rec, [
    "favorites",
    "favorite_count",
    "favourite_count",
    "collect_count",
  ]);
  if (favorites !== undefined) video.favorites = favorites;

  const videoViews = pickNumber(rec, [
    "video_views",
    "views",
    "view_count",
    "play_count",
  ]);
  if (videoViews !== undefined) video.video_views = videoViews;

  const durationSeconds = pickNumber(rec, [
    "duration_seconds",
    "duration",
    "video_duration",
  ]);
  if (durationSeconds !== undefined) video.duration_seconds = durationSeconds;

  const performanceScore = pickNumber(rec, ["performance_score"]);
  if (performanceScore !== undefined) video.performance_score = performanceScore;

  const trendScore = pickNumber(rec, ["trend_score", "score"]);
  if (trendScore !== undefined) video.trend_score = trendScore;

  const rankingReasons = pickStringArray(rec, ["ranking_reasons", "reasons"]);
  if (rankingReasons !== undefined) video.ranking_reasons = rankingReasons;

  const createTime = pickString(rec, ["create_time", "created_at", "publish_time"]);
  if (createTime !== undefined) video.create_time = createTime;

  const captionHashtags = pickStringArray(rec, [
    "caption_hashtags",
    "hashtags",
    "hashtag_names",
  ]);
  if (captionHashtags !== undefined) video.caption_hashtags = captionHashtags;

  for (const key of ANALYSIS_KEYS) {
    const analysis = normalizeTrendAnalysis(rec[key]);
    if (analysis) {
      video.analysis = analysis;
      break;
    }
  }

  return video;
}

export function normalizeTrendVideoList(payload: unknown): TrendVideo[] {
  const list = pickList(payload, LIST_KEYS);
  if (!list) return [];
  return list
    .map(normalizeTrendVideo)
    .filter((video): video is TrendVideo => video !== null);
}

export function normalizeTrendPagination(
  raw: unknown,
  fallback: { pageNo: number; limit: number; itemCount: number },
): TrendPageInfo {
  const rec = asRecord(raw) ?? {};
  const pageNo =
    pickNumber(rec, ["page_no", "page", "current_page", "page_number"]) ??
    fallback.pageNo;
  const limit = pickNumber(rec, ["limit", "page_size", "per_page"]) ?? fallback.limit;
  const totalItems =
    pickNumber(rec, ["total_items", "total", "total_count"]) ?? fallback.itemCount;
  const totalPages =
    pickNumber(rec, ["total_pages", "page_count", "pages"]) ??
    Math.max(1, Math.ceil(totalItems / Math.max(1, limit)));
  return { pageNo, limit, totalItems, totalPages };
}
