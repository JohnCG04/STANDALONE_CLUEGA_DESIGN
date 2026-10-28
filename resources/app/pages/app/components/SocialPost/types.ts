import type { AssetRef } from "@/lib/creative/assetRef";
import type { SocialPlatform, SocialPostDraft } from "@/lib/social-posts/client";
import type { SocialAccount, SocialPlatformAvailability } from "@/lib/social-posts/accounts";
import type { SelectedSocialAccount } from "./store";
import type {
  TikTokComplianceIssue,
  TikTokCreatorInfo,
  TikTokMediaShape,
  TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";

/** The live creator-info read, per account or folded across all of them.
 *  TikTok forbids caching it, so "idle" is a real state: the read is parked
 *  until the compose step actually needs it. */
export type CreatorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; info: TikTokCreatorInfo }
  | {
      status: "error";
      reconnect: boolean;
      // TikTok said this creator may not post now (daily cap, spam hold, rate limit).
      cannotPost?: boolean;
      message?: string;
    };

/**
 * Everything the compose step's presentation needs, in one object.
 *
 * The sections are pure renderings of this: `useComposeController` owns the
 * store reads, the effects and the submit, so a field component can be moved or
 * restyled without touching a rule.
 */
export type ComposeController = {
  draft: SocialPostDraft | undefined;
  settings: TikTokPostSettings;
  shape: TikTokMediaShape;
  /** Photos in the carousel; 0 when the post is a single video. */
  photoCount: number;
  /** The pool a carousel is picked from — the source turn's outputs. */
  candidates: AssetRef[];
  selectedAssets: AssetRef[];
  toggleAsset: (asset: AssetRef) => void;
  /** The asset the preview shows: a carousel's cover, or the clip. */
  previewAsset: AssetRef | undefined;
  previewMediaType: "image" | "video";

  /** The combined creator read: the strictest common answer across every
   *  selected account, because one set of settings goes to all of them. */
  creator: CreatorState;
  retryCreator: () => void;
  /** The accounts this post publishes to, in the order they were picked. */
  accounts: readonly SelectedSocialAccount[];
  /** Every account of the platforms step 1 picked — the rows of step 2's
   *  account list, publishable or not. */
  listedAccounts: readonly SocialAccount[];
  accountsLoading: boolean;
  accountsFailed: boolean;
  reloadAccounts: () => void;
  /** Each platform's server verdict: whether it can publish at all, and why not. */
  platformAvailability: readonly SocialPlatformAvailability[];
  /** Tick or untick one account. */
  toggleAccount: (account: SelectedSocialAccount) => void;
  /** Each account's own live read, keyed by the id creator-info is addressed
   *  by — what lets a row show its own state instead of the folded one. */
  accountReads: Record<string, CreatorState>;
  /** How many of the SELECTED accounts have answered their live read. */
  readyAccountCount: number;
  /** Set when ticking an account narrowed the shared privacy options past the
   *  level already chosen, so the cleared field can explain itself. */
  privacyReset: { level: string; accounts: string[] } | null;
  connecting: boolean;
  /** Start the OAuth connect that grants posting on one platform. */
  connect: (platform: SocialPlatform) => void;
  tiktokSelected: boolean;
  facebookSelected: boolean;

  /** The optional destination link of a Facebook post (`settings.link`): with
   *  one, the photo goes out as a link post carrying Facebook's CTA button. */
  facebookLink: string;
  setFacebookLink: (link: string) => void;
  /** A Facebook account is selected and the link is not an http(s) URL. */
  facebookLinkInvalid: boolean;
  /** A Facebook account is selected and the scheduled time is outside the
   *  10-minutes-to-75-days window Facebook holds a post for. */
  facebookScheduleOutOfRange: boolean;

  /** TikTok's master "disclose commercial content" switch. The API has no field
   *  for it — it gates the two labels below — so it lives in the controller. */
  disclosureOn: boolean;
  setDisclosureOn: (value: boolean) => void;
  issues: readonly TikTokComplianceIssue[];
  videoDurationSec: number | null;
  setVideoDurationSec: (seconds: number) => void;
  durationOverCap: boolean;
  /** A capped video whose length is not read yet — the post waits for it. */
  durationPending: boolean;

  scheduleAt: string | null;
  setScheduleAt: (value: string | null) => void;

  setCaption: (caption: string) => void;
  patch: (patch: Partial<TikTokPostSettings>) => void;
  setCoverIndex: (index: number) => void;
  regenerate: () => void;
  cycleHashtags: () => void;
  removeHashtag: (tag: string) => void;

  canSubmit: boolean;
  submitting: boolean;
  submit: () => Promise<void>;
  /** Throw the draft away and close the dock. */
  discard: () => void;
};
