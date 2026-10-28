"use client";

import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft } from "@/lib/media/brandKit";

import { RadioCardGroup } from "../RadioCardGroup";
import {
  BRAND_TEXTAREA_CLASS,
  COMPOSITION_STYLE_OPTIONS,
  WHITE_SPACE_OPTIONS,
} from "../../constants";
import type { CompositionStyle, WhiteSpace } from "../../types";

/**
 * §7 — how a composition is arranged and how much room it leaves.
 *
 * The two pickers write plain strings (`layout.composition`,
 * `layout.whitespace`), which §4 projects verbatim into
 * `spacing.composition_styles` and `spacing.white_space`. So the stored value
 * is the option id, not its label — a translated label would change what the
 * renderer reads when the UI language changed.
 *
 * `customRules` is a single kit string that becomes a one-entry
 * `spacing.custom_rules[]`, which is why the textarea maps to `[0]`.
 */
export const SpacingSection = ({
  layout,
  onChange,
}: {
  layout: BrandDraft["layout"];
  onChange: (next: BrandDraft["layout"]) => void;
}) => {
  const { t } = useTranslate();

  const isComposition = (value: string): value is CompositionStyle =>
    COMPOSITION_STYLE_OPTIONS.some((option) => option.value === value);
  const isWhiteSpace = (value: string): value is WhiteSpace =>
    WHITE_SPACE_OPTIONS.some((option) => option.value === value);

  return (
    <div className="flex flex-col gap-6">
      <RadioCardGroup
        label={t("appChat.brandKit.layout.compositionLabel")}
        options={COMPOSITION_STYLE_OPTIONS}
        // A value the kit already held that is not one of ours (an extractor
        // wrote "asymmetric") selects nothing rather than mislabelling a card.
        value={isComposition(layout.composition) ? layout.composition : null}
        onChange={(value) => onChange({ ...layout, composition: value })}
      />

      <RadioCardGroup
        label={t("appChat.brandKit.layout.whiteSpaceLabel")}
        options={WHITE_SPACE_OPTIONS}
        value={isWhiteSpace(layout.whitespace) ? layout.whitespace : null}
        onChange={(value) => onChange({ ...layout, whitespace: value })}
      />

      <label className="flex max-w-3xl flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.layout.customRulesLabel")}
        </span>
        <Textarea
          value={layout.customRules[0] ?? ""}
          rows={3}
          className={BRAND_TEXTAREA_CLASS}
          placeholder={t("appChat.brandKit.layout.customRulesPlaceholder")}
          onChange={(event) =>
            onChange({
              ...layout,
              customRules: event.target.value ? [event.target.value] : [],
            })
          }
        />
      </label>
    </div>
  );
};
