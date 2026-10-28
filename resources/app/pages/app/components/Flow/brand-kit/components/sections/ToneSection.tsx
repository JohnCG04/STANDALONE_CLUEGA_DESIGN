"use client";

import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft } from "@/lib/media/brandKit";

import { BrandChipGroup } from "../BrandChipGroup";
import {
  AVOID_WORD_OPTIONS,
  BRAND_TEXTAREA_CLASS,
  PERSONALITY_OPTIONS,
} from "../../constants";
import { useChipLabel, withMember } from "./shared";

/**
 * §6 — how the brand sounds, and the words it never uses.
 *
 * The "words to avoid" row is not a style note: it becomes `banned_claims`,
 * which §6 strips from every prompt AND from video narration, and which in
 * block mode refuses a generate before billing. The copy says so because a user
 * typing a word here is arming a gate, not leaving a hint.
 *
 * `soundsLike` is kit-only, so it is disabled on a saved brand.
 */
export const ToneSection = ({
  tone,
  onChange,
}: {
  tone: BrandDraft["tone"];
  onChange: (next: BrandDraft["tone"]) => void;
}) => {
  const { t } = useTranslate();
  const personalityLabel = useChipLabel("personality");
  const avoidLabel = useChipLabel("avoid");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.tone.statementLabel")}
        </span>
        <Textarea
          value={tone.soundsLike}
          rows={4}
          className={BRAND_TEXTAREA_CLASS}
          placeholder={t("appChat.brandKit.tone.statementPlaceholder")}
          onChange={(event) => onChange({ ...tone, soundsLike: event.target.value })}
        />
      </label>

      <BrandChipGroup
        label={t("appChat.brandKit.tone.personalityLabel")}
        options={PERSONALITY_OPTIONS}
        selected={tone.personality}
        labelFor={personalityLabel}
        onToggle={(value) =>
          onChange({ ...tone, personality: withMember(tone.personality, value) })
        }
        onRemove={(value) =>
          onChange({
            ...tone,
            personality: tone.personality.filter((entry) => entry !== value),
          })
        }
      />

      <div className="flex flex-col gap-1.5">
        <BrandChipGroup
          label={t("appChat.brandKit.tone.avoidLabel")}
          options={AVOID_WORD_OPTIONS}
          selected={tone.vocabularyAvoid}
          labelFor={avoidLabel}
          onToggle={(value) =>
            onChange({
              ...tone,
              vocabularyAvoid: withMember(tone.vocabularyAvoid, value),
            })
          }
          onRemove={(value) =>
            onChange({
              ...tone,
              vocabularyAvoid: tone.vocabularyAvoid.filter((entry) => entry !== value),
            })
          }
        />
        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.brandKit.tone.avoidHint")}
        </span>
      </div>
    </div>
  );
};
