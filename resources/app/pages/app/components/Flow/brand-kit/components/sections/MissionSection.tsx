"use client";

import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft } from "@/lib/media/brandKit";

import { BrandChipGroup } from "../BrandChipGroup";
import { BRAND_TEXTAREA_CLASS, VALUE_OPTIONS } from "../../constants";
import { useChipLabel, withMember } from "./shared";

/**
 * §1 — the mission statement and the values chips.
 *
 * `values` is kit-only — §4's projection table marks `mission.values` "stored
 * only" — which used to mean it could not be edited after the first save. The
 * save path PUTs the whole kit now, so it can.
 */
export const MissionSection = ({
  mission,
  onChange,
}: {
  mission: BrandDraft["mission"];
  onChange: (next: BrandDraft["mission"]) => void;
}) => {
  const { t } = useTranslate();
  const labelFor = useChipLabel("values");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.mission.statementLabel")}
        </span>
        <Textarea
          value={mission.statement}
          rows={4}
          className={BRAND_TEXTAREA_CLASS}
          placeholder={t("appChat.brandKit.mission.statementPlaceholder")}
          onChange={(event) => onChange({ ...mission, statement: event.target.value })}
        />
        {/* §9: the mission never appears as text in the image — it steers mood
            and subject only, and the prompt explicitly forbids printing it. */}
        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.brandKit.mission.statementHint")}
        </span>
      </label>

      <BrandChipGroup
        label={t("appChat.brandKit.mission.valuesLabel")}
        options={VALUE_OPTIONS}
        selected={mission.values}
        labelFor={labelFor}
        onToggle={(value) =>
          onChange({ ...mission, values: withMember(mission.values, value) })
        }
        onRemove={(value) =>
          onChange({
            ...mission,
            values: mission.values.filter((entry) => entry !== value),
          })
        }
      />
    </div>
  );
};
