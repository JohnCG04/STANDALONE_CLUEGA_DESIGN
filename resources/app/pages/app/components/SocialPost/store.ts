import { create, createStore, type StateCreator } from "zustand";

import type { AssetRef } from "@/lib/creative/assetRef";
import type { SocialAccount } from "@/lib/social-posts/accounts";
import type {
  SocialPlatform,
  SocialPostDraft,
  SocialPostRecord,
} from "@/lib/social-posts/client";

// State for the social-posting flow (PRD chapter V): opened from the
// "postSocial" action chip with the creative + source turn/conversation,
// rendered in the conversation's RIGHT-HAND DOCK (the same panel the media
// canvas uses) as a two-step wizard — pick a platform, then compose — and
// submitted via lib/social-posts/client. Post records stay here so
// PostHistoryBlock can report what this session has published.
//
// It used to render as a card appended under the turn, below the fold: the
// user clicked "Post to social" and nothing visibly happened.

/** Where the wizard is. "platform" is always the entry step — the compose
 *  step is a rendering OF the chosen accounts (their own privacy options, their
 *  own caps), so it has nothing to show until at least one is picked. */
export type SocialPostStep = "platform" | "compose";

/**
 * An account the post will publish to, as picked in step 1.
 *
 * The identity, the label and the caps are kept together on purpose: the
 * compose step names the accounts and reads their limits, and re-deriving that
 * from the account list would either re-fetch it (an uncacheable read) or go
 * stale against a selection the user made a moment ago.
 */
export type SelectedSocialAccount = {
  accountKey: string;
  platform: SocialPlatform;
  displayName: string;
  avatarUrl?: string;
  /** The platform-side id, which is what the per-account creator-info read is
   *  addressed by. */
  accountId: string;
};

/** Narrow an account list row down to what the selection keeps. */
export function toSelectedAccount(account: SocialAccount): SelectedSocialAccount {
  return {
    accountKey: account.accountKey,
    platform: account.platform,
    displayName: account.displayName,
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
    accountId: account.accountId,
  };
}

export type SocialPostContext = {
  /** The creative the chip was clicked on. The flow opens with exactly this
   *  selected; a TikTok photo carousel is built by adding to it. */
  assetRef: AssetRef;
  /** Every output of the same turn, in display order — the pool a carousel is
   *  picked from. Contains `assetRef`. A video turn leaves it at one item. */
  candidates?: AssetRef[];
  taskId?: string;
  conversationId?: string;
  /** Prompt of the source turn — seeds the caption drafts. */
  sourcePrompt?: string;
};

export interface SocialPostState {
  isOpen: boolean;
  step: SocialPostStep;
  context: SocialPostContext | null;
  /** The post's media, in publish order: one video, or up to 35 photos
   *  (`tiktokMediaShape` judges the combination). Seeded from the context's
   *  `assetRef`; the media picker adds and removes from the turn's candidates. */
  selectedAssets: AssetRef[];
  /** Step 1's answer: WHICH platforms. It stays a separate, coarser choice
   *  from the accounts because that is the decision the user makes first —
   *  and because step 2's account list is a rendering OF it. */
  selectedPlatforms: SocialPlatform[];
  /** Step 2's answer: which accounts of those platforms — several per platform
   *  is the point. Only ever holds accounts whose live read said they can
   *  publish; the picker offers no checkbox for the others. */
  selectedAccounts: SelectedSocialAccount[];
  /** The post itself: ONE caption, ONE set of settings, applied to every
   *  selected account. Was a map keyed by platform, which could not express two
   *  accounts of the same platform anyway — and the compose UI only ever
   *  edited one entry of it. */
  draft: SocialPostDraft | null;
  scheduleAt: string | null;
  /** Posts created this session, newest first (hydrated per conversation). */
  posts: SocialPostRecord[];

  openFor: (context: SocialPostContext) => void;
  close: () => void;
  setStep: (step: SocialPostStep) => void;
  /** Add the asset to the end of the selection, or drop it. The clicked
   *  creative cannot be dropped — an empty post has nothing to publish. */
  toggleAsset: (asset: AssetRef) => void;
  /** Pick a platform, or drop it — and with it every account of that platform
   *  the second step had selected. */
  togglePlatform: (platform: SocialPlatform) => void;
  /** Add the account to the selection, or drop it. */
  toggleAccount: (account: SelectedSocialAccount) => void;
  /** Select these accounts outright — the pre-selection step 2 makes when the
   *  user has not picked any yet. */
  selectAccounts: (accounts: readonly SelectedSocialAccount[]) => void;
  /** Drop accounts that are no longer publishable — the list refreshed and one
   *  of them expired while the panel was open. */
  retainAccounts: (accountKeys: readonly string[]) => void;
  /** Swap the media pool without resetting the draft (a workflow node's inputs changed). */
  setMedia: (context: SocialPostContext | null, selectedAssets: AssetRef[]) => void;
  setDraft: (draft: SocialPostDraft) => void;
  setScheduleAt: (value: string | null) => void;
  upsertPost: (record: SocialPostRecord) => void;
  setPosts: (records: SocialPostRecord[]) => void;
  reset: () => void;
}

const initial = {
  isOpen: false,
  step: "platform" as SocialPostStep,
  context: null,
  selectedAssets: [] as AssetRef[],
  selectedPlatforms: [] as SocialPlatform[],
  selectedAccounts: [] as SelectedSocialAccount[],
  draft: null,
  scheduleAt: null,
};

const socialPostState: StateCreator<SocialPostState> = (set) => ({
  ...initial,
  posts: [],

  openFor: (context) =>
    set({
      ...initial,
      isOpen: true,
      context,
      selectedAssets: [context.assetRef],
    }),
  close: () => set({ isOpen: false }),
  setStep: (step) => set({ step }),
  toggleAsset: (asset) =>
    set((state) => {
      const selected = state.selectedAssets.some(
        (item) => item.url === asset.url,
      );
      if (!selected) return { selectedAssets: [...state.selectedAssets, asset] };
      const next = state.selectedAssets.filter((item) => item.url !== asset.url);
      return { selectedAssets: next.length > 0 ? next : state.selectedAssets };
    }),
  togglePlatform: (platform) =>
    set((state) => {
      const dropping = state.selectedPlatforms.includes(platform);
      const selectedPlatforms = dropping
        ? state.selectedPlatforms.filter((item) => item !== platform)
        : [...state.selectedPlatforms, platform];
      // Dropping a platform drops its accounts with it. Keeping them would
      // leave a post addressed to accounts of a platform the user just
      // deselected — and step 2 would not even list them to show it.
      const selectedAccounts = dropping
        ? state.selectedAccounts.filter((item) => item.platform !== platform)
        : state.selectedAccounts;
      return selectedPlatforms.length === 0
        ? { selectedPlatforms, selectedAccounts, step: "platform" as SocialPostStep }
        : { selectedPlatforms, selectedAccounts };
    }),
  selectAccounts: (accounts) => set({ selectedAccounts: [...accounts] }),
  toggleAccount: (account) =>
    set((state) => {
      const selected = state.selectedAccounts.some(
        (item) => item.accountKey === account.accountKey,
      );
      const selectedAccounts = selected
        ? state.selectedAccounts.filter(
            (item) => item.accountKey !== account.accountKey,
          )
        : [...state.selectedAccounts, account];
      // No bounce back to step 1 when the last one is unticked: the account
      // picker lives IN step 2 now, so an empty selection is a state the user
      // is looking at and can fix in place. Post stays blocked meanwhile.
      return { selectedAccounts };
    }),
  retainAccounts: (accountKeys) =>
    set((state) => {
      const keep = new Set(accountKeys);
      const selectedAccounts = state.selectedAccounts.filter((item) =>
        keep.has(item.accountKey),
      );
      if (selectedAccounts.length === state.selectedAccounts.length) return {};
      return { selectedAccounts };
    }),
  setDraft: (draft) => set({ draft }),
  setScheduleAt: (value) => set({ scheduleAt: value }),
  upsertPost: (record) =>
    set((state) => {
      const rest = state.posts.filter((item) => item.id !== record.id);
      return { posts: [record, ...rest] };
    }),
  setMedia: (context, selectedAssets) => set({ context, selectedAssets }),
  setPosts: (records) => set({ posts: records }),
  reset: () => set({ ...initial }),
});

/** The one flow the Chat and Pulse docks share. */
export const useSocialPostStore = create<SocialPostState>()(socialPostState);

/** A private flow (one per workflow node), starting from `seed` instead of closed. */
export function createSocialPostStore(seed: Partial<SocialPostState> = {}) {
  return createStore<SocialPostState>()((set, get, api) => ({
    ...socialPostState(set, get, api),
    ...seed,
  }));
}
