/**
 * TikTok direct-post rules, as pure functions.
 *
 * The Content Posting API's UX guidelines are not decoration — an integration
 * that pre-selects a privacy level, offers one the creator's account does not
 * have, lets a branded-content post go out private, or hides who the post lands
 * on fails TikTok's audit. Stating each rule once, here, is what lets the tests
 * pin them down and the compose card stay a rendering of them.
 *
 * The media shape is the other half: one TikTok post is ONE video or a carousel
 * of up to 35 photos, never a mix. The backend rejects a mixed list at create
 * (400), so the card has to know the same rule to explain it before the submit.
 */

import type { AssetRef } from "@/lib/creative/assetRef";

/** TikTok's own cap on a photo carousel. */
export const TIKTOK_MAX_PHOTOS = 35;

/** The Content Posting API's cap on a post's caption. Enforced in the composer
 *  so the text is never truncated server-side after the post is already spent. */
export const TIKTOK_MAX_CAPTION = 2200;

/** The title shown above a photo carousel. */
export const TIKTOK_MAX_PHOTO_TITLE = 90;

/** What one asset is, as far as TikTok's two post types are concerned. */
export type TikTokMediaKind = "video" | "photo" | "unknown";

/** Why a selection cannot become a TikTok post. */
export type TikTokShapeProblem =
  | "empty"
  | "mixed"
  | "multipleVideos"
  | "tooManyPhotos"
  | "unsupported";

export const TIKTOK_SHAPE_PROBLEMS: readonly TikTokShapeProblem[] = [
  "empty",
  "mixed",
  "multipleVideos",
  "tooManyPhotos",
  "unsupported",
];

export type TikTokMediaShape =
  | { kind: "video"; problem?: undefined }
  | { kind: "photo"; problem?: undefined }
  | { kind: "invalid"; problem: TikTokShapeProblem };

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v", ".mpeg", ".avi"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".webp", ".png", ".heic"];

/** What the bytes are: the ref's own declaration first, the URL's extension as
 *  the fallback — the same order the backend applies. */
export function assetMediaKind(asset: AssetRef): TikTokMediaKind {
  const declared = asset.meta?.mediaType;
  if (declared === "video") return "video";
  if (declared === "image") return "photo";
  if (declared === "audio") return "unknown";
  const path = asset.url.split("?")[0]?.toLowerCase() ?? "";
  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) return "video";
  if (PHOTO_EXTENSIONS.some((ext) => path.endsWith(ext))) return "photo";
  return "unknown";
}

/** The post type a selection makes, or why it makes none. */
export function tiktokMediaShape(assets: readonly AssetRef[]): TikTokMediaShape {
  if (assets.length === 0) return { kind: "invalid", problem: "empty" };
  const kinds = assets.map(assetMediaKind);
  if (kinds.includes("unknown")) return { kind: "invalid", problem: "unsupported" };
  const videos = kinds.filter((kind) => kind === "video").length;
  if (videos > 0 && videos !== kinds.length) {
    return { kind: "invalid", problem: "mixed" };
  }
  if (videos > 1) return { kind: "invalid", problem: "multipleVideos" };
  if (videos === 1) return { kind: "video" };
  if (assets.length > TIKTOK_MAX_PHOTOS) {
    return { kind: "invalid", problem: "tooManyPhotos" };
  }
  return { kind: "photo" };
}

/**
 * Creator info as `GET /integrations/tiktok-account/connections/{id}/creator-info`
 * reports it — the live read TikTok requires before every direct post. Declared
 * here, next to the rules that consume it, so the pure layer carries no import
 * of the fetch layer.
 */
export type TikTokCreatorInfo = {
  username: string;
  nickname: string;
  avatarUrl?: string;
  /** EXACTLY the levels this account may post at. Never widened locally. */
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  /** 0 when TikTok did not say; the card then shows no cap. */
  maxVideoPostDurationSec: number;
  /** The app has not passed TikTok's audit: the options are already cut to SELF_ONLY. */
  unaudited: boolean;
  /** How this deployment publishes; absent from a backend older than the field. */
  publishMode?: TikTokPublishMode;
};

/** `draft` lands in the creator's TikTok inbox; `mock` never reaches TikTok. */
export type TikTokPublishMode = "live" | "draft" | "mock";

export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

const PRIVACY_LABEL_KEY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "publicToEveryone",
  MUTUAL_FOLLOW_FRIENDS: "mutualFollowFriends",
  FOLLOWER_OF_CREATOR: "followerOfCreator",
  SELF_ONLY: "selfOnly",
};

/** i18n leaf under `appChat.socialPost.privacy` for a wire privacy level, or
 *  null for a level this build does not know — the caller then shows the raw
 *  value rather than a dotted key path. */
export function privacyLevelLabelKey(level: string): string | null {
  return PRIVACY_LABEL_KEY[level] ?? null;
}

/** The TikTok settings the backend adapter reads. Positive keys throughout —
 *  the adapter inverts `allow_*` onto TikTok's `disable_*` itself. */
export type TikTokPostSettings = {
  privacy_level?: string;
  allow_comment?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  auto_add_music?: boolean;
  photo_cover_index?: number;
  title?: string;
  is_ai_generated?: boolean;
  is_brand_organic?: boolean;
  is_branded_content?: boolean;
};

/**
 * Seeded into a TikTok draft the moment it is created.
 *
 * TikTok's UX guideline forbids pre-selecting what the creator decides: there is
 * no `privacy_level` (the post stays blocked until one is picked) and comment,
 * duet and stitch all start OFF. `is_ai_generated` is true and has no toggle —
 * everything entering this flow came out of a generation, so the AIGC label is
 * a fact of the entry point, not a user choice. The disclosures start off too.
 */
export const TIKTOK_DEFAULT_SETTINGS: TikTokPostSettings = {
  allow_comment: false,
  allow_duet: false,
  allow_stitch: false,
  auto_add_music: false,
  is_ai_generated: true,
  is_brand_organic: false,
  is_branded_content: false,
};

/**
 * The privacy levels the card shows: exactly the creator's own options. SELF_ONLY
 * stays listed but disabled while the post is branded content — TikTok forbids a
 * private paid partnership, and a greyed option says why where a gap would not.
 */
export function tiktokPrivacyOptions(
  creator: TikTokCreatorInfo | null,
  brandedContent: boolean,
): { level: string; disabled: boolean }[] {
  return (creator?.privacyLevelOptions ?? []).map((level) => ({
    level,
    disabled: brandedContent && level === "SELF_ONLY",
  }));
}

/** Interactions TikTok lets this creator's audience have. Duet and stitch are
 *  video-only concepts; a photo post exposes comments alone. */
export function tiktokInteractionAvailability(
  creator: TikTokCreatorInfo | null,
  mediaKind: "video" | "photo",
): { allow_comment: boolean; allow_duet: boolean; allow_stitch: boolean } {
  return {
    allow_comment: !creator?.commentDisabled,
    allow_duet: mediaKind === "video" && !creator?.duetDisabled,
    allow_stitch: mediaKind === "video" && !creator?.stitchDisabled,
  };
}

/** Everything standing between the current draft and a post TikTok accepts. */
export type TikTokComplianceIssue =
  | "privacyRequired"
  | "privacyNotAllowed"
  | "brandedContentPrivate"
  | "disclosureIncomplete";

export function tiktokComplianceIssues(
  settings: TikTokPostSettings,
  creator: TikTokCreatorInfo | null,
  /** The master "disclose commercial content" switch, which the API has no
   *  field for: on with neither box ticked is a state TikTok blocks. */
  disclosureOn: boolean,
): TikTokComplianceIssue[] {
  const issues: TikTokComplianceIssue[] = [];
  const privacy = settings.privacy_level;
  if (!privacy) {
    issues.push("privacyRequired");
  } else if (
    creator &&
    creator.privacyLevelOptions.length > 0 &&
    !creator.privacyLevelOptions.includes(privacy)
  ) {
    issues.push("privacyNotAllowed");
  }
  if (settings.is_branded_content && privacy === "SELF_ONLY") {
    issues.push("brandedContentPrivate");
  }
  if (
    disclosureOn &&
    !settings.is_brand_organic &&
    !settings.is_branded_content
  ) {
    issues.push("disclosureIncomplete");
  }
  return issues;
}

/**
 * Which declaration the compose card must show under the disclosures. TikTok
 * words it three ways: music alone for an undisclosed post, the Branded Content
 * Policy once a paid partnership is declared, and both for "your brand".
 */
export const TIKTOK_DECLARATIONS = [
  "music",
  "brandOrganic",
  "brandedContent",
] as const;

export function tiktokDeclarationKey(
  settings: TikTokPostSettings,
): (typeof TIKTOK_DECLARATIONS)[number] {
  if (settings.is_branded_content) return "brandedContent";
  if (settings.is_brand_organic) return "brandOrganic";
  return "music";
}

/** The policies the declaration names; TikTok asks for them as links. */
export const TIKTOK_MUSIC_USAGE_URL =
  "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const TIKTOK_BRANDED_CONTENT_POLICY_URL =
  "https://www.tiktok.com/legal/page/global/bc-policy/en";

/** The label TikTok will put on the post. Paid partnership wins when both are ticked. */
export const TIKTOK_COMMERCIAL_LABELS = ["promotional", "paidPartnership"] as const;

export function tiktokCommercialLabelKey(
  settings: TikTokPostSettings,
): (typeof TIKTOK_COMMERCIAL_LABELS)[number] | null {
  if (settings.is_branded_content) return "paidPartnership";
  if (settings.is_brand_organic) return "promotional";
  return null;
}

/** The cover a photo carousel publishes with: the creator's pick when it still
 *  names a selected photo, the first one otherwise (TikTok's own default). */
export function tiktokCoverIndex(
  settings: TikTokPostSettings,
  photoCount: number,
): number {
  const index = settings.photo_cover_index;
  if (typeof index === "number" && index >= 0 && index < photoCount) return index;
  return 0;
}
