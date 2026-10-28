"use client";

import { useTranslate } from "@/hooks/useTranslate";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsToggle } from "@/components/settings/SettingsToggle";
import {
  tiktokCommercialLabelKey,
  type TikTokComplianceIssue,
  type TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";
import { SettingRow } from "./SettingRow";

/**
 * Commercial disclosure — off by default, and once on it must name what kind of
 * commercial content this is. The master switch is UI-only: the API has no
 * field for it, it gates the two labels that DO travel.
 */
export function DisclosureField({
  disclosureOn,
  issues,
  onDisclosureChange,
  onPatch,
  settings,
}: {
  disclosureOn: boolean;
  issues: readonly TikTokComplianceIssue[];
  onDisclosureChange: (value: boolean) => void;
  onPatch: (patch: Partial<TikTokPostSettings>) => void;
  settings: TikTokPostSettings;
}) {
  const { t } = useTranslate();
  const labelKey = tiktokCommercialLabelKey(settings);

  return (
    <div>
      <SettingRow
        title={t("appChat.socialPost.disclosureToggle")}
        sub={t("appChat.socialPost.disclosureHint")}
      >
        <SettingsToggle
          checked={disclosureOn}
          ariaLabel={t("appChat.socialPost.disclosureToggle")}
          onCheckedChange={(checked) => {
            onDisclosureChange(checked);
            if (!checked) {
              onPatch({ is_brand_organic: false, is_branded_content: false });
            }
          }}
        />
      </SettingRow>

      {disclosureOn ? (
        <div className="mt-2.5 flex flex-col gap-2">
          <Checkbox
            checked={settings.is_brand_organic === true}
            onCheckedChange={(checked) => onPatch({ is_brand_organic: checked })}
            label={t("appChat.socialPost.brandOrganic")}
            className="text-[13px]"
          />
          <Checkbox
            checked={settings.is_branded_content === true}
            onCheckedChange={(checked) =>
              // A paid partnership may not be private: clear a SELF_ONLY pick
              // the moment it becomes impossible, rather than letting the post
              // fail at publish.
              onPatch({
                is_branded_content: checked,
                ...(checked && settings.privacy_level === "SELF_ONLY"
                  ? { privacy_level: undefined }
                  : {}),
              })
            }
            label={t("appChat.socialPost.brandedContent")}
            className="text-[13px]"
          />
          {/* TikTok wants the poster told which label the post will carry. */}
          {labelKey ? (
            <p className="text-[11px] text-muted-foreground">
              {t(`appChat.socialPost.commercialLabel.${labelKey}`)}
            </p>
          ) : null}
          {issues.includes("disclosureIncomplete") ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {t("appChat.socialPost.disclosureIncomplete")}
            </p>
          ) : null}
          {issues.includes("brandedContentPrivate") ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              {t("appChat.socialPost.brandedContentPrivate")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
