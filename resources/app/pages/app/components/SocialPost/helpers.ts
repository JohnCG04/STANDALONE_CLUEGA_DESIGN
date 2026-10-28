import type { AssetRef } from "@/lib/creative/assetRef";
import type { SocialPlatform, SocialPostDraft } from "@/lib/social-posts/client";
import { facebookMediaFits } from "@/lib/social-posts/facebookRules";
import { SOCIAL_PLATFORMS } from "@/lib/social-posts/platforms";
import {
  tiktokCoverIndex,
  type TikTokMediaShape,
  type TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";
import {
  ICON_KEY_BY_SERVICE_ID,
  integrationIcons,
} from "../Ability/ApplicationAuthorization/constants";
import type { ComposeController } from "./types";

/** `datetime-local` value for a Date in the user's zone — `toISOString()`
 *  yields UTC wall-clock, which is the wrong seed for a local-time input. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The TikTok draft's settings under their real names. Free-form on the wire
 *  (each adapter reads its own keys), typed the moment the composer touches it. */
export function tiktokSettingsOf(
  draft: SocialPostDraft | undefined,
): TikTokPostSettings {
  return (draft?.settings ?? {}) as TikTokPostSettings;
}

/** The Facebook destination link in the shared draft (`settings.link`, the one
 *  key the Facebook adapter reads); "" when none was entered. */
export function facebookLinkOf(draft: SocialPostDraft | undefined): string {
  const link = draft?.settings?.link;
  return typeof link === "string" ? link : "";
}

/** The draft as it is sent: the link trimmed, and dropped when empty or when
 *  no Facebook account is selected — a link left over from a deselected Page
 *  must not ride along on a post that no longer goes to Facebook. */
export function draftForSubmit(
  draft: SocialPostDraft,
  facebookSelected: boolean,
): SocialPostDraft {
  if (!draft.settings || !("link" in draft.settings)) return draft;
  const rest = { ...draft.settings };
  delete rest.link;
  const link = facebookLinkOf(draft).trim();
  return {
    ...draft,
    settings: facebookSelected && link ? { ...rest, link } : rest,
  };
}

/** Whether an account's row waits on a live creator read before it can be
 *  ticked. Only TikTok has one — the Content Posting API requires it before a
 *  direct post. A Facebook Page's options are all in the account list, so its
 *  row is decided by `canPublish` alone; waiting on a read that is never
 *  issued would leave the Page's checkbox disabled forever. */
export function needsCreatorRead(account: { platform: SocialPlatform }): boolean {
  return account.platform === "tiktok";
}

/**
 * The asset the preview frame shows.
 *
 * A carousel previews its COVER, not its first photo — the cover is what TikTok
 * shows in the feed, so previewing anything else would misrepresent the post.
 * A video post has exactly one asset either way.
 */
export function previewAssetFor(
  assets: readonly AssetRef[],
  shape: TikTokMediaShape,
  settings: TikTokPostSettings,
  fallback: AssetRef | undefined,
): AssetRef | undefined {
  if (shape.kind === "photo" && assets.length > 0) {
    return assets[tiktokCoverIndex(settings, assets.length)] ?? assets[0];
  }
  return assets[0] ?? fallback;
}

/** The hashtags as they read once published: "#a #b #c". */
export function hashtagText(hashtags: readonly string[]): string {
  return hashtags.map((tag) => `#${tag}`).join(" ");
}

/**
 * `DD/MM/YYYY - hh:mm`, in the reader's own clock.
 *
 * Deliberately NOT `formatDateTime`: the posting history is a log the user
 * scans down a column, and a fixed numeric shape lines up where a locale-styled
 * date ("Sep 7, 2026, 6:42 PM") does not. Zoneless on the wire it is not — the
 * value is an instant, so it renders in local time like every other timestamp.
 */
export function formatPostTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} - ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/**
 * The platform's brand mark, from the same map the connectors list draws from —
 * so the posting history and the integrations screen show one TikTok, not two.
 * Resolved through the platform's own `service`, which is the id that map keys on.
 */
export function platformIconUrl(platform: string): string | undefined {
  const meta = SOCIAL_PLATFORMS.find((entry) => entry.id === platform);
  if (!meta) return undefined;
  const key = ICON_KEY_BY_SERVICE_ID[meta.service];
  return key ? integrationIcons[key] : undefined;
}

/**
 * Can step 1 hand off to the composer?
 *
 * One picked platform, and nothing more. It deliberately does NOT require a
 * publishable account: the account list — with its per-account reconnect
 * button — lives in step 2, so a tenant whose only account expired has to be
 * able to get there. Post stays blocked until something is actually selectable,
 * which is step 2's job to say.
 */
export function canContinueToCompose(
  selectedPlatforms: readonly SocialPlatform[],
): boolean {
  return selectedPlatforms.length > 0;
}

/** Platforms in the order the platform table declares them, deduped — so the
 *  compose header does not reshuffle as platforms are picked. */
export function orderedPlatforms(
  platforms: readonly SocialPlatform[],
): SocialPlatform[] {
  const picked = new Set(platforms);
  return SOCIAL_PLATFORMS.filter((meta) => picked.has(meta.id)).map((meta) => meta.id);
}

/**
 * What one row of the step-2 account list may do.
 *
 * Two independent sources can make an account unusable, and they are folded
 * here so the row renders one state rather than second-guessing which check
 * won: `can_publish` from the account list (status not active, missing
 * video.publish scope, platform not wired) and the account's own live
 * creator-info read (a token TikTok has since invalidated — the list cannot
 * know, because the row was active when it was written).
 *
 *   - "loading": the live read is in flight. The checkbox is present but
 *     disabled: ticking an account whose options are unknown would fold the
 *     shared settings from an answer we do not have yet.
 *   - "selectable": can publish, and its options are known — at once for an
 *     account with no live read (a Facebook Page, see needsCreatorRead).
 *   - "reconnect": TikTok invalidated the grant (401/410) — an OAuth round
 *     trip fixes it, a retry does not.
 *   - "cannotPost": TikTok says this creator may not post right now (daily cap,
 *     spam hold, rate limit) — waiting fixes it, reconnecting does not.
 *   - "unusable": anything else — the list said no, or the read failed for a
 *     reason worth retrying.
 */
export type AccountRowState =
  | "loading"
  | "selectable"
  | "reconnect"
  | "cannotPost"
  | "unusable";

export function accountRowState(
  account: { canPublish: boolean; platform: SocialPlatform; status?: string },
  read: { status: string; reconnect?: boolean; cannotPost?: boolean } | undefined,
): AccountRowState {
  if (!account.canPublish) return "reconnect";
  if (!needsCreatorRead(account)) return "selectable";
  if (!read || read.status === "loading" || read.status === "idle") return "loading";
  if (read.status === "error") {
    if (read.reconnect === true) return "reconnect";
    return read.cannotPost === true ? "cannotPost" : "unusable";
  }
  return "selectable";
}

/** Why Post is disabled, in the order the form explains it; null when it can go out. */
export function composeBlockedReason(
  c: ComposeController,
  t: (key: string) => string,
): string | null {
  if (c.canSubmit || c.submitting) return null;
  if (c.accounts.length === 0) return t("appChat.socialPost.noAccountSelected");
  if (c.facebookSelected && !facebookMediaFits(c.selectedAssets.length)) {
    return t("appChat.socialPost.shape.facebookSingle");
  }
  if (c.facebookLinkInvalid) return t("appChat.socialPost.facebookLinkInvalid");
  if (c.facebookScheduleOutOfRange) {
    return t("appChat.socialPost.facebookScheduleOutOfRange");
  }
  // The rest is TikTok's: a Facebook-only post has no creator read or TikTok shape.
  if (!c.tiktokSelected) return null;
  if (c.shape.kind === "invalid") return t(`appChat.socialPost.shape.${c.shape.problem}`);
  // Before the read lands its settings aren't on screen, so an issue would point at nothing.
  if (c.creator.status === "error") {
    return c.creator.cannotPost
      ? c.creator.message || t("appChat.socialPost.creatorCannotPost")
      : t("appChat.socialPost.creatorFailed");
  }
  if (c.creator.status !== "ready") return t("appChat.socialPost.creatorLoading");
  if (c.durationOverCap) {
    return t("appChat.socialPost.durationOver")
      .replace("{seconds}", String(c.videoDurationSec ?? 0))
      .replace("{cap}", String(c.creator.info.maxVideoPostDurationSec));
  }
  if (c.durationPending) return t("appChat.socialPost.durationChecking");
  const issue = c.issues[0];
  return issue ? t(`appChat.socialPost.${issue}`) : null;
}
