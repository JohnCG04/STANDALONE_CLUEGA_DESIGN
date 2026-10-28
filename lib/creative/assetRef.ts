// Unified creative-asset reference (PRD §6.3): the single unit every picker
// produces and every handoff destination (run ads / social post / Cluega
// Design) consumes. Destinations receive it as URL params together with the
// originating task + conversation so they can write status back to the
// source timeline.

export type AssetSource =
  | "local"
  | "history"
  | "cluega_db"
  | "design"
  | "apps"
  | "trend"
  | "template"
  | "avatar"
  | "generated";

export type AssetRefMeta = {
  /** What the BYTES are. Orthogonal to the attachment's role. media-ai needs it
   *  to decide whether to read a video track or analyze a single still. */
  mediaType: "image" | "video" | "audio";
  /** How much of the reference is actually observable. `cover_only` means the
   *  attachment is a still standing in for a video, so any beat/pacing in the
   *  recipe is inferred rather than seen. */
  fidelity?: "video" | "cover_only";
  title?: string;
  artifactId?: string;
  /** Length of a video asset. Snake_case because it crosses the wire into the
   *  social post's asset meta, where the TikTok publisher preflights it against
   *  the creator's own maximum post duration. */
  duration_seconds?: number;
  /** Artifact the asset was derived from (e.g. a generated result's input). */
  sourceArtifactId?: string;
} & Partial<TrendReferenceMeta> &
  Partial<StyleReferenceMeta>;

/**
 * Corpus provenance for a style reference picked from the Insights ad library
 * (PRD IMG-03).
 *
 * Separate from TrendReferenceMeta even though both describe a TikTok post: a
 * trend pick is a video to imitate the pacing of, and this is one frame of
 * somebody else's ad to imitate the treatment of. The ids here are what make
 * "which published ad was this render styled on" answerable months later, which
 * is the first question asked when an output looks too close to its source.
 */
export type StyleReferenceMeta = {
  /** `market_ad_assets.id` — the corpus row itself. */
  assetId?: string;
  /** The platform's own id for the creative, as the corpus recorded it. */
  sourceAssetId?: string;
  /** The corpus' dedupe key, e.g. `tiktok_one:<video_id>`. */
  normKey?: string;
  /** The public post this was captured from. Provenance only — never fetched as
   *  media, for the same reason `embedUrl` is not. */
  sourceUrl?: string;
};

/**
 * Corpus provenance for a TikTok One trend pick.
 *
 * Sent flat inside `meta` because that is where media-ai reads it
 * (`app/materials/reference_conditioning.build_reference_meta`, which accepts
 * either spelling). It sharpens a recipe read from the footage, and when only a
 * cover is available it is most of what the recipe can be built from. `videoId`
 * is how the backend re-resolves a cover whose signed URL has expired.
 */
export type TrendReferenceMeta = {
  provider: "tiktok";
  videoId: string;
  handleName?: string;
  displayName?: string;
  caption?: string;
  hashtags?: string[];
  durationSeconds?: number;
  /** The fetchable cover. Also the attachment's url when `fidelity` is
   *  `cover_only`; otherwise it is just the chip's poster. */
  thumbnailUrl?: string;
  /** Canonical public watch URL — real footage, and it never expires. Normally
   *  the attachment's url; media-ai resolves the MP4 from it. */
  videoUrl?: string;
  /** An embed PAGE, not media. Preview only — the backend must never fetch it,
   *  and it must never be the attachment's url (it resolves to HTML). */
  embedUrl?: string;
  metrics?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    favorites?: number;
    performanceScore?: number;
    trendScore?: number;
  };
};

export type AssetRef = {
  source: AssetSource;
  id?: string;
  url: string;
  meta?: AssetRefMeta;
};

// Param names are part of the cross-module handoff contract — change them in
// lockstep with every destination that calls parseHandoffParams.
const PARAM_SOURCE = "asset_source";
const PARAM_ID = "asset_id";
const PARAM_URL = "asset_url";
const PARAM_MEDIA_TYPE = "asset_media_type";
const PARAM_TITLE = "asset_title";
const PARAM_ARTIFACT_ID = "asset_artifact_id";
const PARAM_TASK = "task";
const PARAM_CONVERSATION = "conversation";

const ASSET_SOURCES: readonly AssetSource[] = [
  "local",
  "history",
  "cluega_db",
  "design",
  "apps",
  "trend",
  "template",
  "avatar",
  "generated",
];

function isAssetSource(value: string): value is AssetSource {
  return (ASSET_SOURCES as readonly string[]).includes(value);
}

export type HandoffContext = {
  ref: AssetRef;
  taskId?: string;
  conversationId?: string;
};

/** Serialize an asset reference (+ source task/conversation) for a redirect. */
export function buildHandoffParams(
  ref: AssetRef,
  taskId?: string,
  conversationId?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set(PARAM_SOURCE, ref.source);
  params.set(PARAM_URL, ref.url);
  if (ref.id) params.set(PARAM_ID, ref.id);
  if (ref.meta?.mediaType) params.set(PARAM_MEDIA_TYPE, ref.meta.mediaType);
  if (ref.meta?.title) params.set(PARAM_TITLE, ref.meta.title);
  if (ref.meta?.artifactId) params.set(PARAM_ARTIFACT_ID, ref.meta.artifactId);
  if (taskId) params.set(PARAM_TASK, taskId);
  if (conversationId) params.set(PARAM_CONVERSATION, conversationId);
  return params;
}

/**
 * Read a handoff back out of URL params. Returns null when no asset URL is
 * present — destinations treat that as "opened directly, nothing to preload".
 */
export function parseHandoffParams(
  params: URLSearchParams,
): HandoffContext | null {
  const url = params.get(PARAM_URL);
  if (!url) return null;

  const rawSource = params.get(PARAM_SOURCE) ?? "";
  const mediaType = params.get(PARAM_MEDIA_TYPE);
  const title = params.get(PARAM_TITLE);
  const artifactId = params.get(PARAM_ARTIFACT_ID);

  const meta: AssetRefMeta | undefined =
    mediaType === "image" || mediaType === "video"
      ? {
          mediaType,
          ...(title ? { title } : {}),
          ...(artifactId ? { artifactId } : {}),
        }
      : undefined;

  return {
    ref: {
      source: isAssetSource(rawSource) ? rawSource : "generated",
      id: params.get(PARAM_ID) ?? undefined,
      url,
      ...(meta ? { meta } : {}),
    },
    taskId: params.get(PARAM_TASK) ?? undefined,
    conversationId: params.get(PARAM_CONVERSATION) ?? undefined,
  };
}
