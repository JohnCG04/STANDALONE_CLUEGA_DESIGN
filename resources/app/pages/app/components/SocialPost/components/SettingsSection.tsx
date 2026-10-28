"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { SettingsToggle } from "@/components/settings/SettingsToggle";
import {
  TIKTOK_MAX_PHOTO_TITLE,
  privacyLevelLabelKey,
  tiktokInteractionAvailability,
  tiktokPrivacyOptions,
} from "@/lib/social-posts/tiktokRules";
import type { ComposeController } from "../types";
import { DisclosureField } from "./DisclosureField";
import { InteractionsField } from "./InteractionsField";
import { PrivacyField } from "./PrivacyField";
import { SettingRow } from "./SettingRow";

/**
 * TikTok's own settings, in TikTok's own order. Everything TikTok's audit asks
 * the poster to decide (audience, interactions, disclosure) stays on screen; only
 * what a poster usually leaves alone folds behind "Show more". The consent line
 * lives in the footer, next to the button it applies to. Timing is not here: it
 * applies to every platform, so ComposeStep renders it above.
 *
 * Nothing here that the wire cannot carry: no high-quality upload switch, no
 * pre-publish checks, no location. The AI-generated row is shown but locked —
 * every creative posted from this flow IS generated, so the label is not ours
 * to turn off (`TIKTOK_DEFAULT_SETTINGS.is_ai_generated`).
 */
export function SettingsSection({
  controller,
}: {
  controller: ComposeController;
}) {
  const { t } = useTranslate();
  const [expanded, setExpanded] = useState(false);

  const {
    accounts,
    creator,
    privacyReset,
    disclosureOn,
    durationOverCap,
    issues,
    patch,
    photoCount,
    setDisclosureOn,
    settings,
    shape,
    videoDurationSec,
  } = controller;

  const info = creator.status === "ready" ? creator.info : null;
  const isCarousel = photoCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PrivacyField
          value={settings.privacy_level}
          options={tiktokPrivacyOptions(info, settings.is_branded_content === true)}
          onChange={(value) => patch({ privacy_level: value })}
          issues={issues}
        />
        {/* Why the field went empty: ticking one more account narrowed the
            shared options past the level already chosen. Named, because "pick
            an audience" on a field the user already filled reads as a bug. */}
        {privacyReset ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            {t("appChat.socialPost.privacyResetNotice")
              .replace(
                "{level}",
                privacyLevelLabelKey(privacyReset.level)
                  ? t(
                      `appChat.socialPost.privacy.${privacyLevelLabelKey(privacyReset.level)}`,
                    )
                  : privacyReset.level,
              )
              .replace("{names}", privacyReset.accounts.join(", "))}
          </p>
        ) : accounts.length > 1 ? (
          /* Why the list can be shorter than one account alone would offer:
             the settings are shared, so only levels EVERY selected account
             allows are listed. Without this a missing "Public" reads as a bug. */
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("appChat.socialPost.sharedSettingsHint")}
          </p>
        ) : null}
        {/* Why "Only me" is the only level on offer, before the poster wonders. */}
        {info?.unaudited ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            {t("appChat.socialPost.unauditedNotice")}
          </p>
        ) : null}
      </div>

      <InteractionsField
        settings={settings}
        availability={tiktokInteractionAvailability(
          info,
          isCarousel ? "photo" : "video",
        )}
        isCarousel={isCarousel}
        onPatch={patch}
      />

      {isCarousel ? (
        <div>
          <label
            htmlFor="social-post-photo-title"
            className="mb-1.5 block text-[13px] font-semibold text-foreground"
          >
            {t("appChat.socialPost.photoTitleLabel")}
          </label>
          <Input
            id="social-post-photo-title"
            value={settings.title ?? ""}
            maxLength={TIKTOK_MAX_PHOTO_TITLE}
            placeholder={t("appChat.socialPost.photoTitlePlaceholder")}
            onChange={(event) => patch({ title: event.target.value || undefined })}
            className="rounded-xl text-[13px]"
          />
        </div>
      ) : null}

      <DisclosureField
        disclosureOn={disclosureOn}
        onDisclosureChange={setDisclosureOn}
        settings={settings}
        onPatch={patch}
        issues={issues}
      />

      {durationOverCap && info ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {t("appChat.socialPost.durationOver")
            .replace("{seconds}", String(videoDurationSec ?? 0))
            .replace("{cap}", String(info.maxVideoPostDurationSec))}
        </p>
      ) : null}

      {expanded ? (
        <>
          {isCarousel ? (
            <SettingRow title={t("appChat.socialPost.autoAddMusic")}>
              <SettingsToggle
                checked={settings.auto_add_music === true}
                ariaLabel={t("appChat.socialPost.autoAddMusic")}
                onCheckedChange={(checked) => patch({ auto_add_music: checked })}
              />
            </SettingRow>
          ) : null}

          {/* Locked on: this flow only ever posts generated creatives, so the
              label is a statement of fact, not a preference. */}
          <SettingRow
            title={t("appChat.socialPost.aiGeneratedLabel")}
            sub={t("appChat.socialPost.aiLabelNotice")}
            hint={t("appChat.socialPost.aiGeneratedHint")}
          >
            <SettingsToggle
              checked
              disabled
              ariaLabel={t("appChat.socialPost.aiGeneratedLabel")}
              onCheckedChange={() => {}}
            />
          </SettingRow>
        </>
      ) : null}

      <div>
        <Button
          type="button"
          variant="link"
          size="pillCompact"
          onClick={() => setExpanded((value) => !value)}
          className="px-0"
        >
          {expanded
            ? t("appChat.socialPost.showLess")
            : t("appChat.socialPost.showMore")}
          {expanded ? (
            <ChevronUp className="size-4" strokeWidth={2} />
          ) : (
            <ChevronDown className="size-4" strokeWidth={2} />
          )}
        </Button>
      </div>
      {shape.kind === "invalid" ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {t(`appChat.socialPost.shape.${shape.problem}`)}
        </p>
      ) : null}
    </div>
  );
}
