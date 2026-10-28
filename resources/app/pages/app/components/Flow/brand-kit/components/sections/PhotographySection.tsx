"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft } from "@/lib/media/brandKit";

import { AddTile } from "../AddTile";
import { AssetTile } from "../AssetTile";
import { BrandChipGroup } from "../BrandChipGroup";
import {
  BRAND_TEXTAREA_CLASS,
  COLOR_TREATMENT_OPTIONS,
  LIGHTING_OPTIONS,
  MOOD_OPTIONS,
  PHOTOGRAPHY_MAX_ASSETS,
  PHOTO_COMPOSITION_OPTIONS,
  TILE_GRID_CLASS,
} from "../../constants";
import { useBrandAssetUpload } from "../../hooks/useBrandAssetUpload";
import { useChipLabel, withMember } from "./shared";

/**
 * §5 — the moodboard and the four style vocabularies.
 *
 * The images are STORED AND NEVER SENT (§9): most models accept only four
 * reference images and number each one as a subject the picture must contain,
 * so a moodboard image in that list comes back drawn as the product. Only the
 * words below — and `subjectMatter` — reach a prompt. The hint says this
 * outright, because a grid of images that does nothing is otherwise indefensible.
 */
/** A name for a stored asset tile.
 *
 * An asset added through the picker keeps its filename in the URL, and that is
 * the useful label. One imported from a guideline is addressed by an opaque
 * storage id — `…/2026/09/01M3KK3AEM4AD…` — and showing that reads as a broken
 * tile even though the picture loads fine. Fall back to the numbered label the
 * logo tiles already use.
 */
function assetLabel(url: string, index: number, t: (key: string) => string): string {
  const last = url.split("/").pop() ?? "";
  const looksLikeAName = last.includes(".") && !/^[0-9A-Za-z]{20,}$/.test(last);
  return looksLikeAName
    ? last
    : t("appChat.brandKit.photography.tile").replace("{index}", String(index + 1));
}

export const PhotographySection = ({
  photography,
  onChange,
}: {
  photography: BrandDraft["photography"];
  onChange: (next: BrandDraft["photography"]) => void;
}) => {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { upload, uploading } = useBrandAssetUpload(PHOTOGRAPHY_MAX_ASSETS);

  const lightingLabel = useChipLabel("lighting");
  const moodLabel = useChipLabel("mood");
  const compositionLabel = useChipLabel("composition");
  const treatmentLabel = useChipLabel("colorTreatment");

  const group = (
    key: "lighting" | "mood" | "composition" | "colorTreatment",
    label: string,
    options: Parameters<typeof BrandChipGroup>[0]["options"],
    labelFor: (value: string) => string,
  ) => (
    <BrandChipGroup
      label={label}
      options={options}
      selected={photography[key]}
      labelFor={labelFor}
      onToggle={(value) =>
        onChange({ ...photography, [key]: withMember(photography[key], value) })
      }
      onRemove={(value) =>
        onChange({
          ...photography,
          [key]: photography[key].filter((entry) => entry !== value),
        })
      }
    />
  );

  const full = photography.moodboard.length >= PHOTOGRAPHY_MAX_ASSETS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.photography.assetsLabel").replace(
            "{max}",
            String(PHOTOGRAPHY_MAX_ASSETS),
          )}
        </span>
        <div className={TILE_GRID_CLASS}>
          <AddTile
            label={t("appChat.brandKit.photography.addShort")}
            icon={Plus}
            disabled={uploading || full}
            onClick={() => inputRef.current?.click()}
          />
          {photography.moodboard.map((url, index) => (
            <AssetTile
              key={`${url}-${index}`}
              url={url}
              fileName={assetLabel(url, index, t)}
              removeLabel={t("appChat.brandKit.photography.remove").replace(
                "{name}",
                assetLabel(url, index, t),
              )}
              onRemove={() =>
                onChange({
                  ...photography,
                  moodboard: photography.moodboard.filter((_, at) => at !== index),
                })
              }
            />
          ))}
        </div>
        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.brandKit.photography.assetsHint")}
        </span>
      </div>

      <div className="flex flex-col gap-5 border-t border-neutral-200 pt-5 dark:border-neutral-800">
        {group(
          "lighting",
          t("appChat.brandKit.photography.lighting"),
          LIGHTING_OPTIONS,
          lightingLabel,
        )}
        {group("mood", t("appChat.brandKit.photography.mood"), MOOD_OPTIONS, moodLabel)}
        {group(
          "composition",
          t("appChat.brandKit.photography.composition"),
          PHOTO_COMPOSITION_OPTIONS,
          compositionLabel,
        )}
        {group(
          "colorTreatment",
          t("appChat.brandKit.photography.colorTreatment"),
          COLOR_TREATMENT_OPTIONS,
          treatmentLabel,
        )}
      </div>

      <label className="flex max-w-2xl flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.photography.subjectLabel")}
        </span>
        <Textarea
          value={photography.subjectMatter}
          rows={2}
          className={BRAND_TEXTAREA_CLASS}
          placeholder={t("appChat.brandKit.photography.subjectPlaceholder")}
          onChange={(event) =>
            onChange({ ...photography, subjectMatter: event.target.value })
          }
        />
      </label>

      <label className="flex max-w-2xl flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("appChat.brandKit.photography.avoidLabel")}
        </span>
        <Textarea
          value={photography.avoid}
          rows={2}
          className={BRAND_TEXTAREA_CLASS}
          placeholder={t("appChat.brandKit.photography.avoidPlaceholder")}
          onChange={(event) => onChange({ ...photography, avoid: event.target.value })}
        />
      </label>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          // Copy the list BEFORE clearing the input: `files` is a live view
          // of it, and the reset — which is what lets the same file be picked
          // twice — would otherwise empty the list we are about to upload.
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          void upload(picked, photography.moodboard.length).then((assets) => {
            if (assets.length === 0) return;
            onChange({
              ...photography,
              moodboard: [...photography.moodboard, ...assets.map((asset) => asset.url)],
            });
          });
        }}
      />
    </div>
  );
};
