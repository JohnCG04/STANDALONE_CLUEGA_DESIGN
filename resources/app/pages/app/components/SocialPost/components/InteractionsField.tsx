"use client";

import { useTranslate } from "@/hooks/useTranslate";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverTooltip } from "@/resources/app/components/ui/HoverTooltip";
import {
  tiktokInteractionAvailability,
  type TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";
import { cn } from "@/lib/utils";

// Positive keys end-to-end: the backend adapter reads `allow_*` and inverts
// onto TikTok's `disable_*` itself.
const INTERACTIONS = [
  ["allow_comment", "allowComment"],
  ["allow_duet", "allowDuet"],
  ["allow_stitch", "allowStitch"],
] as const;

/**
 * What viewers may do with the post. Kept as three separate switches rather
 * than TikTok Studio's merged "Reuse of content" because `allow_duet` and
 * `allow_stitch` are separate fields on the wire — merging them here would take
 * away a choice the API accepts.
 *
 * An option the creator switched off in their own account is dead, not merely
 * ignored: that is TikTok's rule, and posting it anyway is rejected. All three
 * start unticked — only an explicit `true` ticks one.
 */
export function InteractionsField({
  availability,
  isCarousel,
  onPatch,
  settings,
}: {
  availability: ReturnType<typeof tiktokInteractionAvailability>;
  isCarousel: boolean;
  onPatch: (patch: Partial<TikTokPostSettings>) => void;
  settings: TikTokPostSettings;
}) {
  const { t } = useTranslate();

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-foreground">
        {t("appChat.socialPost.interactionsLabel")}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {INTERACTIONS.map(([settingKey, labelKey]) => {
          const available = availability[settingKey];
          // Duet and stitch do not exist for a photo carousel at all.
          if (!available && isCarousel && settingKey !== "allow_comment") {
            return null;
          }
          return (
            // Tooltip on the WRAPPER, not the control: a disabled Checkbox has
            // `pointer-events-none`, so a `title` on it would never be read —
            // and "why is this greyed out" is exactly what needs answering.
            <HoverTooltip
              key={settingKey}
              content={available ? null : t("appChat.socialPost.interactionOff")}
            >
              <Checkbox
                checked={available && settings[settingKey] === true}
                disabled={!available}
                onCheckedChange={(checked) => onPatch({ [settingKey]: checked })}
                label={t(`appChat.socialPost.${labelKey}`)}
                className={cn("text-[13px]", !available && "cursor-not-allowed")}
              />
            </HoverTooltip>
          );
        })}
      </div>
    </div>
  );
}
