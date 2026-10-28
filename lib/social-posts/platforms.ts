/**
 * The social platforms a creative can be published to (PRD chapter V).
 *
 * Brand names are NOT translated — "TikTok" is "TikTok" in every locale, and the
 * status card used to render `capitalize(post.platform)`, which turned the wire
 * value `tiktok` into "Tiktok". They live here so the dialog and the status card
 * cannot drift apart on either the label or the ordering.
 *
 * Placement labels ARE translated (see `socialPost.placements.*`): "Feed" and
 * "Reels" are product surfaces a reader expects in their own language, while the
 * ratio suffix is a number and stays as-is.
 */

import type { SocialPlatform } from "./client";
import type { IntegrationServiceID } from "@/lib/integrations/types";

export type SocialPlatformMeta = {
  id: SocialPlatform;
  /** Brand name, deliberately locale-independent. */
  label: string;
  /** The integration whose connection state drives the "linked" badge. */
  service: IntegrationServiceID;
  /** Announced, not shipped: the tile renders disabled with a "coming soon"
   *  badge. Instagram's adapter is not wired, so offering it would take a post
   *  that silently never lands. Only the fallback for a backend too old to
   *  report availability — the server's answer wins when it gives one. */
  comingSoon?: true;
};

export const SOCIAL_PLATFORMS: readonly SocialPlatformMeta[] = [
  // tiktokAccount, not tiktokAds: publishing runs on the creator's own Login
  // Kit grant (video.publish), which the ads connection does not carry.
  { id: "tiktok", label: "TikTok", service: "tiktokAccount" },
  { id: "instagram", label: "Instagram", service: "instagram", comingSoon: true },
  // meta: Facebook posts to Pages through the Meta connection, connected with
  // the publishing profile (pages_manage_posts) — see useConnectSocial.
  { id: "facebook", label: "Facebook", service: "meta" },
];

/** The platforms a post can actually be published to right now. */
export const AVAILABLE_SOCIAL_PLATFORMS: readonly SocialPlatformMeta[] =
  SOCIAL_PLATFORMS.filter((platform) => !platform.comingSoon);

const LABEL_BY_ID = new Map<string, string>(
  SOCIAL_PLATFORMS.map((platform) => [platform.id, platform.label]),
);

/** Brand label for a platform id; unknown ids fall back to the raw value so a
 *  new backend platform still renders something truthful. */
export function socialPlatformLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id;
}

/** One preview frame in the size-adaptation step: a translated placement name
 *  plus the aspect it crops to. */
export type PlacementPreview = {
  /** i18n key under `appChat.socialPost.placements`. */
  key: "tiktok" | "igReels" | "igFeed" | "fbFeed";
  /** CSS `aspect-ratio` value. */
  aspect: string;
  /** Ratio as shown to the reader, appended after the localized name. */
  ratio: string;
};

const PLACEMENTS_BY_PLATFORM: Record<SocialPlatform, PlacementPreview[]> = {
  tiktok: [{ key: "tiktok", aspect: "9/16", ratio: "9:16" }],
  instagram: [
    { key: "igReels", aspect: "9/16", ratio: "9:16" },
    { key: "igFeed", aspect: "4/5", ratio: "4:5" },
  ],
  facebook: [{ key: "fbFeed", aspect: "1/1", ratio: "1:1" }],
};

/** Placement previews for the selected platforms, deduped, in platform order. */
export function placementPreviewsFor(
  platforms: readonly SocialPlatform[],
): PlacementPreview[] {
  const out: PlacementPreview[] = [];
  const seen = new Set<string>();
  for (const platform of SOCIAL_PLATFORMS) {
    if (!platforms.includes(platform.id)) continue;
    for (const placement of PLACEMENTS_BY_PLATFORM[platform.id]) {
      if (seen.has(placement.key)) continue;
      seen.add(placement.key);
      out.push(placement);
    }
  }
  return out;
}
