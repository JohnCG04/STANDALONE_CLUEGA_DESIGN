"use client";

import { FACEBOOK_MAX_MEDIA } from "@/lib/social-posts/facebookRules";
import { tiktokCoverIndex } from "@/lib/social-posts/tiktokRules";
import { Separator } from "@/components/ui/separator";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { orderedPlatforms } from "../helpers";
import { useSocialPost } from "../storeContext";
import type { ComposeController } from "../types";
import { AccountPicker } from "./AccountPicker";
import { CreatorGate } from "./CreatorGate";
import { DetailsSection } from "./DetailsSection";
import { FacebookLinkField } from "./FacebookLinkField";
import { MediaPicker } from "./MediaPicker";
import { PhonePreview } from "./PhonePreview";
import { SettingsSection } from "./SettingsSection";
import { WhenToPostField } from "./WhenToPostField";

/** Step 2's form — accounts, details, settings and preview — for the drawer and the workflow node. */
export function ComposeBody({ controller }: { controller: ComposeController }) {
  const { t } = useTranslate();
  const context = useSocialPost((s) => s.context);
  const selectedPlatforms = useSocialPost((s) => s.selectedPlatforms);

  const {
    accountReads,
    accounts,
    accountsFailed,
    accountsLoading,
    candidates,
    connect,
    connecting,
    creator,
    draft,
    facebookLink,
    facebookLinkInvalid,
    facebookScheduleOutOfRange,
    facebookSelected,
    listedAccounts,
    readyAccountCount,
    reloadAccounts,
    toggleAccount,
    previewAsset,
    previewMediaType,
    photoCount,
    retryCreator,
    scheduleAt,
    selectedAssets,
    setFacebookLink,
    setScheduleAt,
    settings,
    shape,
    tiktokSelected,
    toggleAsset,
    setCoverIndex,
    setVideoDurationSec,
  } = controller;

  const info = creator.status === "ready" ? creator.info : null;
  // The carousel cover is TikTok's: with only a Facebook Page picked, there is
  // no carousel to cover.
  const showCover = tiktokSelected && shape.kind === "photo";
  const platforms = orderedPlatforms(selectedPlatforms);
  // Who the preview shows the post as: the TikTok @handle once its read lands,
  // else the first selected Facebook Page's name.
  const previewHandle = info?.username
    ? `@${info.username}`
    : accounts.find((account) => account.platform === "facebook")?.displayName;

  if (!context) return null;

  return (
    <div className="@container/compose flex w-full flex-col gap-5">
      {/* Not gated: the row skeletons the wait in place, so a refresh
          does not unmount it and shove the form up and back down. Errors
          DO drop it — there is no account to name then, and the settings
          gate below is what explains the failure. */}
      {/* Step 2 leads with WHO: every account of the chosen platforms,
          each with its own status. An account that cannot publish gets a
          reconnect button instead of a checkbox — offering the tick and
          refusing the post later spends the post to say the same thing. */}
      <AccountPicker
        accounts={listedAccounts}
        connecting={connecting}
        failed={accountsFailed}
        loading={accountsLoading}
        onConnect={connect}
        onReload={reloadAccounts}
        onRetryRead={retryCreator}
        onToggle={toggleAccount}
        platforms={platforms}
        readyCount={readyAccountCount}
        reads={accountReads}
        selectedKeys={accounts.map((account) => account.accountKey)}
      />

      <Separator />

      {/* The column flip is CSS ONLY. Unmounting the preview at narrow
          widths would take the clip's duration read with it — see
          PhonePreview. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-5",
          "@[560px]/compose:grid-cols-[minmax(0,1fr)_224px]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-5">
          <DetailsSection
            caption={draft?.caption ?? ""}
            hashtags={draft?.hashtags ?? []}
            onCaptionChange={controller.setCaption}
            onRegenerate={controller.regenerate}
            onCycleHashtags={controller.cycleHashtags}
            onRemoveHashtag={controller.removeHashtag}
          >
            {candidates.length > 1 ? (
              <MediaPicker
                candidates={candidates}
                selected={selectedAssets}
                coverIndex={
                  showCover
                    ? tiktokCoverIndex(settings, selectedAssets.length)
                    : null
                }
                showCover={showCover}
                onToggle={toggleAsset}
                onSetCover={setCoverIndex}
                {...(facebookSelected
                  ? {
                      max: FACEBOOK_MAX_MEDIA,
                      hint: t("appChat.socialPost.shape.facebookSingle"),
                    }
                  : {})}
              />
            ) : null}
          </DetailsSection>

          <Separator />

          {/* No account ticked yet: the settings ARE a rendering of the
              selected accounts' own options, so there is nothing
              truthful to show until one is picked. */}
          {accounts.length === 0 ? (
            <p className="rounded-xl border border-border px-3 py-2.5 text-[12px] text-muted-foreground">
              {t("appChat.socialPost.noAccountSelected")}
            </p>
          ) : (
            <section className="flex flex-col gap-4">
              <h3 className="text-[13px] font-semibold text-foreground">
                {t("appChat.socialPost.settings")}
              </h3>
              {/* Timing applies to every platform, so it sits outside
                  the TikTok gate — a Facebook-only post must not wait on
                  a creator read it never gets. */}
              <WhenToPostField
                scheduleAt={scheduleAt}
                onChange={setScheduleAt}
                error={
                  facebookScheduleOutOfRange
                    ? t("appChat.socialPost.facebookScheduleOutOfRange")
                    : null
                }
              />
              {facebookSelected ? (
                <FacebookLinkField
                  value={facebookLink}
                  onChange={setFacebookLink}
                  invalid={facebookLinkInvalid}
                />
              ) : null}
              {tiktokSelected ? (
                <CreatorGate creator={creator} onRetry={retryCreator}>
                  <SettingsSection controller={controller} />
                </CreatorGate>
              ) : null}
            </section>
          )}
        </div>

        {/* Stacked, the media reads first; side by side it sits where a
            preview belongs. Ordered in CSS so the DOM keeps form → preview
            for the tab order into the footer. */}
        <div className="order-first @[560px]/compose:order-none @[560px]/compose:sticky @[560px]/compose:top-0 @[560px]/compose:self-start">
          {previewAsset ? (
            <PhonePreview
              asset={previewAsset}
              mediaType={previewMediaType}
              caption={draft?.caption ?? ""}
              hashtags={draft?.hashtags ?? []}
              handle={previewHandle}
              photoCount={photoCount}
              platforms={platforms}
              onVideoDuration={setVideoDurationSec}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
