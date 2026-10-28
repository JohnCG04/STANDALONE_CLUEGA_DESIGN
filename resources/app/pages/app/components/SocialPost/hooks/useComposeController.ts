"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { trackEvent } from "@/lib/analytics/productEvents";
import { CdpApiError } from "@/lib/cdp";
import { draftCaption } from "@/lib/social-posts/captionDraft";
import {
  facebookLinkValid,
  facebookMediaFits,
  facebookScheduleFits,
} from "@/lib/social-posts/facebookRules";
import {
  TIKTOK_DEFAULT_SETTINGS,
  assetMediaKind,
  tiktokComplianceIssues,
  tiktokCoverIndex,
  tiktokMediaShape,
  type TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";
import { createSocialPost, type SocialPostRecord } from "@/lib/social-posts/client";
import { useToastStore } from "@/lib/stores/useToastStore";
import {
  accountRowState,
  draftForSubmit,
  facebookLinkOf,
  needsCreatorRead,
  orderedPlatforms,
  previewAssetFor,
  tiktokSettingsOf,
} from "../helpers";
import { useSocialPost, useSocialPostStoreApi } from "../storeContext";
import type { ComposeController } from "../types";
import { useConnectSocial } from "../useConnectSocial";
import { useSocialAccounts } from "../useSocialAccounts";
import { combineCreatorReads, useTikTokCreators } from "./useTikTokCreators";

/**
 * The compose step's whole brain: draft seeding, TikTok's live creator read and
 * the reconciles it forces, the compliance gates, and the submit.
 *
 * Deliberately NOT hoisted into SocialPostPanel. The creator read is gated on
 * having a linked account, not on the step — mounting this on the platform step
 * would fire TikTok's uncacheable read before the user has even chosen where to
 * post.
 */
interface ComposeControllerOptions {
  /** Read accounts and creator info; the drawer turns this on at its compose step. */
  active?: boolean;
  /** Pre-tick the first usable account per platform; a workflow node leaves it to the user. */
  preselect?: boolean;
  /** After a post is created; the drawer closes itself instead. */
  onSubmitted?: (record: SocialPostRecord) => void;
}

export function useComposeController(
  options: ComposeControllerOptions = {},
): ComposeController {
  // `lang` drives the DRAFTED CAPTION as well as the chrome: a caption is
  // content the user publishes, so it follows the reader's language rather than
  // being drafted in English and translated by hand afterwards.
  const { t, lang } = useTranslate();
  const store = useSocialPostStoreApi();
  const isOpen = useSocialPost((s) => s.isOpen);
  const context = useSocialPost((s) => s.context);
  const step = useSocialPost((s) => s.step);
  const selectedAssets = useSocialPost((s) => s.selectedAssets);
  const selectedPlatforms = useSocialPost((s) => s.selectedPlatforms);
  const selectedAccounts = useSocialPost((s) => s.selectedAccounts);
  const draft = useSocialPost((s) => s.draft);
  const scheduleAt = useSocialPost((s) => s.scheduleAt);
  const toggleAsset = useSocialPost((s) => s.toggleAsset);
  const toggleAccount = useSocialPost((s) => s.toggleAccount);
  const selectAccounts = useSocialPost((s) => s.selectAccounts);
  const retainAccounts = useSocialPost((s) => s.retainAccounts);
  const setDraft = useSocialPost((s) => s.setDraft);
  const setScheduleAt = useSocialPost((s) => s.setScheduleAt);
  const upsertPost = useSocialPost((s) => s.upsertPost);
  const close = useSocialPost((s) => s.close);
  const pushToast = useToastStore((s) => s.push);
  const { preselect = true, onSubmitted } = options;
  const active = options.active ?? (isOpen && step === "compose");

  // Memoized so the draft-seeding effect does not re-run every render.
  const captionLocale = useMemo(() => ({ t, lang }), [t, lang]);

  const [submitting, setSubmitting] = useState(false);
  const tiktokSettings = tiktokSettingsOf(draft ?? undefined);

  // Read off the store rather than seeded false: Back unmounts the compose step,
  // and a remount that reset this to false would show the disclosure switched
  // off while the brand labels are still attached to the draft.
  const [disclosureOn, setDisclosureOn] = useState(() => {
    const settings = tiktokSettingsOf(
      store.getState().draft ?? undefined,
    );
    return (
      settings.is_brand_organic === true || settings.is_branded_content === true
    );
  });
  // Read off the preview's metadata. Sent as the asset's `duration_seconds` so
  // the backend can preflight it against the creator's own cap, and shown here
  // so a too-long clip is caught before the post is spent.
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const variantRef = useRef<number>(0);

  const shape = useMemo(() => tiktokMediaShape(selectedAssets), [selectedAssets]);

  const { connecting, connect } = useConnectSocial();

  // The account list is read HERE as well as in step 1, because step 2 is where
  // the accounts are picked. Only one of the two is enabled at a time (the
  // panel renders one step), so this is not a second request — and re-entering
  // the step re-reads, which is how a reconnect round trip shows up.
  const {
    accounts: allAccounts,
    platforms: platformAvailability,
    loading: accountsLoading,
    failed: accountsFailed,
    reload: reloadAccounts,
  } = useSocialAccounts(active);

  // Only the platforms step 1 picked. An account of a platform the user did not
  // choose has no business in this list, let alone in a creator read.
  const platformAccounts = useMemo(
    () => allAccounts.filter((account) => selectedPlatforms.includes(account.platform)),
    [allAccounts, selectedPlatforms],
  );

  // Read creator-info for EVERY listed TikTok account, not just the ticked
  // ones. That is what lets a row show "reconnect" before it is picked — the
  // account list cannot know a token TikTok has since invalidated, because the
  // row was active when it was written. One read per account, well inside
  // TikTok's 20/min per-token budget.
  const listedTikTokIds = platformAccounts
    .filter((account) => needsCreatorRead(account) && account.canPublish)
    .map((account) => account.accountId)
    .join(",");
  const tiktokAccountIds = useMemo(
    () => (listedTikTokIds === "" ? [] : listedTikTokIds.split(",")),
    [listedTikTokIds],
  );

  const { byAccount: accountReads, retry: retryCreator } = useTikTokCreators(
    active,
    tiktokAccountIds,
  );

  // The shared settings fold over the SELECTED accounts only — those are the
  // ones the post goes to, and the strictest common answer across them is what
  // may be offered.
  //
  // TikTok accounts only: creator-info is a TikTok read, and folding over an
  // account that has none (a Facebook Page) would leave the fold waiting
  // forever on a read that is never coming, with the Post button blocked and
  // nothing on screen to explain it.
  const selectedIdsKey = selectedAccounts
    .filter((account) => needsCreatorRead(account))
    .map((account) => account.accountId)
    .join(",");
  const selectedIds = useMemo(
    () => (selectedIdsKey === "" ? [] : selectedIdsKey.split(",")),
    [selectedIdsKey],
  );
  const creator = useMemo(
    () => combineCreatorReads(selectedIds, accountReads),
    [selectedIds, accountReads],
  );
  const readyAccountCount = selectedIds.filter(
    (id) => accountReads[id]?.status === "ready",
  ).length;

  // Which listed accounts may be ticked at all. Folded from both sources (the
  // list's can_publish and the account's own live read) in one place, so the
  // picker, the pre-selection and the drop-on-refresh cannot disagree.
  const selectableKeys = useMemo(
    () =>
      platformAccounts
        .filter(
          (account) =>
            accountRowState(account, accountReads[account.accountId]) === "selectable",
        )
        .map((account) => account.accountKey),
    [platformAccounts, accountReads],
  );
  const selectableKey = selectableKeys.join(",");

  // A selected account can go bad between being ticked and a refresh (its grant
  // dies, someone revokes it). It is dropped rather than left ticked: the row
  // has no checkbox in that state, so a ticked-but-unselectable account would
  // be a selection the user cannot see or undo. The row itself stays on screen,
  // showing why and offering reconnect, so this is not a silent change.
  useEffect(() => {
    if (accountsLoading || accountsFailed || platformAccounts.length === 0) return;
    retainAccounts(selectableKey === "" ? [] : selectableKey.split(","));
  }, [
    accountsLoading,
    accountsFailed,
    platformAccounts.length,
    selectableKey,
    retainAccounts,
  ]);

  // Pre-tick the first usable account of each chosen platform, once, when the
  // user has not picked any. It reproduces what a post carrying no account has
  // always published as (the platform's newest active connection) rather than
  // opening on an empty selection and a blocked Post button.
  const preselectedRef = useRef(false);
  useEffect(() => {
    if (!active) {
      preselectedRef.current = false;
      return;
    }
    if (!preselect || preselectedRef.current || selectedAccounts.length > 0) return;
    if (accountsLoading || selectableKeys.length === 0) return;
    const firstPerPlatform = new Map<string, (typeof platformAccounts)[number]>();
    for (const account of platformAccounts) {
      if (!selectableKeys.includes(account.accountKey)) continue;
      if (!firstPerPlatform.has(account.platform)) {
        firstPerPlatform.set(account.platform, account);
      }
    }
    if (firstPerPlatform.size === 0) return;
    preselectedRef.current = true;
    selectAccounts(
      [...firstPerPlatform.values()].map((account) => ({
        accountKey: account.accountKey,
        platform: account.platform,
        displayName: account.displayName,
        ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
        accountId: account.accountId,
      })),
    );
  }, [
    active,
    preselect,
    accountsLoading,
    platformAccounts,
    selectableKeys,
    selectedAccounts.length,
    selectAccounts,
  ]);

  const tiktokSelected = selectedAccounts.some(
    (account) => account.platform === "tiktok",
  );
  const facebookSelected = selectedAccounts.some(
    (account) => account.platform === "facebook",
  );

  // The caption is drafted in the voice of the first chosen platform (in the
  // platform table's order): one shared draft goes to every account, so it can
  // only be written for one of them.
  const captionPlatform = orderedPlatforms(selectedPlatforms)[0] ?? "tiktok";

  // Seed the shared draft once. TikTok's default settings come with it so the
  // submit payload always carries them — minus privacy_level, which the creator
  // must choose themselves. The Facebook adapter ignores them.
  useEffect(() => {
    if (!isOpen || !context || draft) return;
    setDraft({
      ...draftCaption(captionPlatform, context.sourcePrompt ?? "", 0, captionLocale),
      settings: { ...TIKTOK_DEFAULT_SETTINGS },
    });
  }, [isOpen, context, draft, setDraft, captionLocale, captionPlatform]);

  const patch = useCallback(
    (next: Partial<TikTokPostSettings>) => {
      const current = store.getState().draft;
      if (!current) return;
      // Choosing a level answers the notice, so it goes — leaving it up would
      // explain a field that is no longer empty.
      if (next.privacy_level) setPrivacyReset(null);
      setDraft({
        ...current,
        settings: { ...tiktokSettingsOf(current), ...next },
      });
    },
    [store, setDraft],
  );

  // Why a privacy level was cleared, so the empty field is not a mystery:
  // ticking one more account can narrow the shared options past the level
  // already chosen. Names the accounts that do not allow it.
  const [privacyReset, setPrivacyReset] = useState<{
    level: string;
    accounts: string[];
  } | null>(null);

  // Reconcile the draft with what the SELECTED accounts actually allow, once
  // their live reads land: an interaction any of them switched off is sent as
  // off (TikTok rejects the post otherwise), and a privacy level that is no
  // longer on offer is cleared rather than posted at some other level.
  useEffect(() => {
    if (creator.status !== "ready" || !draft) return;
    const info = creator.info;
    const settings = tiktokSettingsOf(draft);
    const next: Partial<TikTokPostSettings> = {};
    if (info.commentDisabled && settings.allow_comment !== false) {
      next.allow_comment = false;
    }
    if (info.duetDisabled && settings.allow_duet !== false) next.allow_duet = false;
    if (info.stitchDisabled && settings.allow_stitch !== false) {
      next.allow_stitch = false;
    }
    const level = settings.privacy_level;
    if (
      level &&
      info.privacyLevelOptions.length > 0 &&
      !info.privacyLevelOptions.includes(level)
    ) {
      next.privacy_level = undefined;
      // The accounts to blame are the ones whose own options lack the level —
      // read per account, because the fold only reports the intersection.
      setPrivacyReset({
        level,
        accounts: selectedAccounts
          .filter((account) => {
            const read = accountReads[account.accountId];
            return (
              read?.status === "ready" && !read.info.privacyLevelOptions.includes(level)
            );
          })
          .map((account) => account.displayName),
      });
    }
    if (Object.keys(next).length > 0) patch(next);
  }, [creator, draft, patch, selectedAccounts, accountReads]);

  // Dropping a photo can leave the cover pointing past the end of the carousel.
  useEffect(() => {
    if (!draft || shape.kind !== "photo") return;
    const settings = tiktokSettingsOf(draft);
    if (settings.photo_cover_index === undefined) return;
    const clamped = tiktokCoverIndex(settings, selectedAssets.length);
    if (clamped !== settings.photo_cover_index) {
      patch({ photo_cover_index: clamped });
    }
  }, [selectedAssets, shape.kind, draft, patch]);

  const setCaption = useCallback(
    (caption: string) => {
      const current = store.getState().draft;
      if (!current) return;
      setDraft({ ...current, caption });
    },
    [store, setDraft],
  );

  const regenerate = useCallback(() => {
    if (!context) return;
    variantRef.current += 1;
    const fresh = draftCaption(
      captionPlatform,
      context.sourcePrompt ?? "",
      variantRef.current,
      captionLocale,
    );
    const current = store.getState().draft;
    setDraft({ ...fresh, settings: current?.settings });
  }, [store, context, setDraft, captionLocale, captionPlatform]);

  const cycleHashtags = useCallback(() => {
    if (!context) return;
    variantRef.current += 1;
    const fresh = draftCaption(
      captionPlatform,
      context.sourcePrompt ?? "",
      variantRef.current,
      captionLocale,
    );
    const current = store.getState().draft;
    if (!current) return;
    setDraft({ ...current, hashtags: fresh.hashtags });
  }, [store, context, setDraft, captionLocale, captionPlatform]);

  // The Facebook destination link: a free-form key on the shared settings,
  // which only the Facebook adapter reads. Written straight onto the draft
  // rather than through `patch`, whose type is TikTok's settings.
  const facebookLink = facebookLinkOf(draft ?? undefined);
  const setFacebookLink = useCallback(
    (link: string) => {
      const current = store.getState().draft;
      if (!current) return;
      setDraft({ ...current, settings: { ...current.settings, link } });
    },
    [store, setDraft],
  );

  const removeHashtag = useCallback(
    (tag: string) => {
      const current = store.getState().draft;
      if (!current) return;
      setDraft({
        ...current,
        hashtags: current.hashtags.filter((item) => item !== tag),
      });
    },
    [store, setDraft],
  );

  const setCoverIndex = useCallback(
    (index: number) => patch({ photo_cover_index: index }),
    [patch],
  );

  const issues = useMemo(
    () =>
      tiktokSelected
        ? tiktokComplianceIssues(
            tiktokSettings,
            creator.status === "ready" ? creator.info : null,
            disclosureOn,
          )
        : [],
    [tiktokSelected, tiktokSettings, creator, disclosureOn],
  );

  const durationOverCap =
    creator.status === "ready" &&
    creator.info.maxVideoPostDurationSec > 0 &&
    videoDurationSec !== null &&
    shape.kind === "video" &&
    videoDurationSec > creator.info.maxVideoPostDurationSec;

  // The cap can only be checked once the clip's length is read, so the post waits for it.
  const durationPending =
    creator.status === "ready" &&
    creator.info.maxVideoPostDurationSec > 0 &&
    shape.kind === "video" &&
    videoDurationSec === null;

  // TikTok's gates, in the order the step explains them: a media shape TikTok
  // has a post type for, the live creator read for EVERY selected account, and
  // a draft that satisfies the guidelines. "Is an account connected" is no
  // longer among them — the picker only offers publishable accounts, so a
  // selection implies the connection.
  const tiktokBlocked =
    tiktokSelected &&
    (shape.kind === "invalid" ||
      creator.status !== "ready" ||
      issues.length > 0 ||
      durationOverCap ||
      durationPending);

  // Facebook's gates — each one the backend would refuse at create: one media
  // item, a usable link, and a schedule inside Facebook's window.
  const facebookLinkInvalid = facebookSelected && !facebookLinkValid(facebookLink);
  const facebookScheduleOutOfRange =
    facebookSelected &&
    scheduleAt !== null &&
    !Number.isNaN(Date.parse(scheduleAt)) &&
    !facebookScheduleFits(new Date(scheduleAt), new Date());
  const facebookBlocked =
    facebookSelected &&
    (!facebookMediaFits(selectedAssets.length) ||
      facebookLinkInvalid ||
      facebookScheduleOutOfRange);

  const submit = useCallback(async () => {
    if (!context || selectedAccounts.length === 0 || submitting) return;
    // Same gates as the button's `disabled` — belt and braces against a
    // keyboard submit racing the connection check.
    if (tiktokBlocked || facebookBlocked) return;
    if (selectedAssets.length === 0) return;
    if (scheduleAt !== null && Number.isNaN(Date.parse(scheduleAt))) return;
    setSubmitting(true);
    try {
      const record = await createSocialPost({
        // One target per selected account. The shared draft below applies to
        // all of them; no per-target override is sent, because the privacy
        // levels on offer are already the intersection of what every selected
        // account allows.
        targets: selectedAccounts.map((account) => ({
          platform: account.platform,
          accountKey: account.accountKey,
        })),
        draft: draftForSubmit(draft ?? { caption: "", hashtags: [] }, facebookSelected),
        assets: selectedAssets.map((asset) =>
          assetMediaKind(asset) === "video" && videoDurationSec !== null
            ? {
                ...asset,
                meta: {
                  // `mediaType` is required on the meta, and a ref that reached
                  // here as a video by its extension alone may not carry one.
                  mediaType: "video" as const,
                  ...asset.meta,
                  duration_seconds: videoDurationSec,
                },
              }
            : asset,
        ),
        // The input holds a zoneless `datetime-local` string; the backend
        // wants RFC3339, so stamp the user's zone on here.
        scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        conversationId: context.conversationId,
        taskId: context.taskId,
      });
      upsertPost(record);
      trackEvent("handoff_success", {
        target: "social",
        asset_ref: selectedAssets[0]?.url ?? "",
        platforms: [
          ...new Set(selectedAccounts.map((account) => account.platform)),
        ].join(","),
        accounts: selectedAccounts.length,
      });
      pushToast(t("appChat.socialPost.submitted"), "info");
      if (onSubmitted) onSubmitted(record);
      else close();
    } catch (error) {
      // A 4xx carries the backend's own sentence (which rule the post broke); say that.
      const specific =
        error instanceof CdpApiError && error.status < 500 ? error.message : "";
      pushToast(specific || t("appChat.socialPost.submitFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  }, [
    context,
    selectedAccounts,
    selectedAssets,
    submitting,
    tiktokBlocked,
    facebookBlocked,
    facebookSelected,
    videoDurationSec,
    draft,
    scheduleAt,
    upsertPost,
    pushToast,
    t,
    onSubmitted,
    close,
  ]);

  const scheduleValid =
    scheduleAt === null || !Number.isNaN(Date.parse(scheduleAt));
  const canSubmit =
    selectedAccounts.length > 0 &&
    selectedAssets.length > 0 &&
    !tiktokBlocked &&
    !facebookBlocked &&
    scheduleValid;

  const fallbackAsset = context?.assetRef ?? selectedAssets[0];
  const candidates = context?.candidates ?? (fallbackAsset ? [fallbackAsset] : []);
  const previewAsset = previewAssetFor(
    selectedAssets,
    shape,
    tiktokSettings,
    fallbackAsset,
  );

  return {
    draft: draft ?? undefined,
    settings: tiktokSettings,
    shape,
    photoCount: shape.kind === "photo" ? selectedAssets.length : 0,
    candidates,
    selectedAssets,
    toggleAsset,
    previewAsset,
    previewMediaType:
      previewAsset && assetMediaKind(previewAsset) === "video"
        ? "video"
        : "image",

    creator,
    retryCreator,
    accountReads,
    accounts: selectedAccounts,
    // Every account of the chosen platforms — the step-2 picker's rows.
    listedAccounts: platformAccounts,
    accountsLoading,
    accountsFailed,
    reloadAccounts,
    platformAvailability,
    toggleAccount,
    // How many of the selected accounts answered their live read.
    readyAccountCount,
    privacyReset,
    connecting,
    connect,
    tiktokSelected,
    facebookSelected,

    facebookLink,
    setFacebookLink,
    facebookLinkInvalid,
    facebookScheduleOutOfRange,

    disclosureOn,
    setDisclosureOn,
    issues,
    videoDurationSec,
    setVideoDurationSec,
    durationOverCap,
    durationPending,

    scheduleAt,
    setScheduleAt,

    setCaption,
    patch,
    setCoverIndex,
    regenerate,
    cycleHashtags,
    removeHashtag,

    canSubmit,
    submitting,
    submit,
    // `reset()` spreads the initial state, whose `isOpen` is false — one call
    // both throws the draft away and closes the dock.
    discard: () => store.getState().reset(),
  };
}
