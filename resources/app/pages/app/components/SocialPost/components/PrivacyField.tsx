"use client";

import { Globe, Lock, UserCheck, Users, type LucideIcon } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  privacyLevelLabelKey,
  type TikTokComplianceIssue,
} from "@/lib/social-posts/tiktokRules";

/**
 * One glyph per wire level, so the reach of a level reads before its label does
 * — the same shapes TikTok's own picker leads with. Keyed by the wire value
 * rather than the i18n leaf: the level is what the account offers, and a
 * translation is free to reword the label without moving the icon.
 *
 * A level this build does not know simply gets no icon, the same way it falls
 * back to its raw value for the label.
 */
const PRIVACY_ICON: Record<string, LucideIcon> = {
  PUBLIC_TO_EVERYONE: Globe,
  FOLLOWER_OF_CREATOR: Users,
  MUTUAL_FOLLOW_FRIENDS: UserCheck,
  SELF_ONLY: Lock,
};

/**
 * Who the post lands on — EXACTLY the levels this account offers, which is a
 * TikTok audit rule: offering a level the creator does not have fails review.
 *
 * It opens EMPTY: TikTok forbids a default, so `privacyRequired` keeps the post
 * blocked until the creator picks. A disabled level carries its reason inline —
 * a disabled item ignores the pointer, so a tooltip on it would never show.
 */
export function PrivacyField({
  issues,
  onChange,
  options,
  value,
}: {
  issues: readonly TikTokComplianceIssue[];
  onChange: (value: string) => void;
  options: readonly { level: string; disabled: boolean }[];
  value: string | undefined;
}) {
  const { t } = useTranslate();

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-foreground">
        {t("appChat.socialPost.privacyLabel")}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full rounded-xl text-[13px]">
          <SelectValue placeholder={t("appChat.socialPost.privacyPlaceholder")} />
        </SelectTrigger>
        {/* `nokey`: in a workflow node, its type-ahead must not reach the canvas hotkeys. */}
        <SelectContent className="nokey rounded-xl">
          {options.map(({ level, disabled }) => {
            const key = privacyLevelLabelKey(level);
            const Icon = PRIVACY_ICON[level];
            return (
              <SelectItem
                key={level}
                value={level}
                disabled={disabled}
                className="text-[13px]"
              >
                {/* Inside the item's own text, so the trigger shows the icon
                    with the label once a level is picked. */}
                <span className="flex items-center gap-2">
                  {Icon ? (
                    <Icon
                      className="size-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                  ) : null}
                  {key ? t(`appChat.socialPost.privacy.${key}`) : level}
                  {disabled ? (
                    <span className="text-[11px] text-muted-foreground">
                      · {t("appChat.socialPost.privacySelfOnlyBranded")}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {issues.includes("privacyRequired") ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          {t("appChat.socialPost.privacyRequired")}
        </p>
      ) : null}
      {issues.includes("privacyNotAllowed") ? (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
          {t("appChat.socialPost.privacyNotAllowed")}
        </p>
      ) : null}
    </div>
  );
}
