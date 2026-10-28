"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft, BrandDraftLogo } from "@/lib/media/brandKit";

import { AddTile } from "../AddTile";
import { AssetTile } from "../AssetTile";
import { TILE_GRID_CLASS } from "../../constants";
import { useBrandAssetUpload } from "../../hooks/useBrandAssetUpload";

/**
 * §4 — the brand's marks.
 *
 * Only `logos[0]` is ever composited (§9: top-right, 16% of frame width); the
 * rest are a catalogue for this UI. `primary` is sorted first on import, so the
 * first tile is the primary mark unless someone reorders it — which is why the
 * hint names the first one rather than a variant.
 *
 * `unreadableLogos` is rendered PERSISTENTLY, not as a toast: §4 says those
 * marks will not appear on renders and "there is no later signal", so a
 * four-second notification would be the only warning the user ever gets.
 */
export const LogoSection = ({
  logos,
  unreadableLogos,
  onChange,
}: {
  logos: BrandDraft["logos"];
  unreadableLogos: readonly string[];
  onChange: (next: BrandDraftLogo[]) => void;
}) => {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // No cap of its own: a brand may catalogue as many marks as it likes, and
  // only the first is composited.
  const { upload, uploading } = useBrandAssetUpload(Number.MAX_SAFE_INTEGER);

  return (
    <div className="flex flex-col gap-4">
      <div className={TILE_GRID_CLASS}>
        <AddTile
          label={t("appChat.brandKit.logo.addShort")}
          icon={Plus}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        />
        {logos.map((logo, index) => (
          <AssetTile
            key={`${logo.artifactId}-${index}`}
            url={logo.artifactId}
            fileName={
              logo.fileName ||
              t("appChat.brandKit.logo.tile").replace("{index}", String(index + 1))
            }
            removeLabel={t("appChat.brandKit.logo.remove").replace(
              "{name}",
              logo.fileName ||
                t("appChat.brandKit.logo.tile").replace("{index}", String(index + 1)),
            )}
            onRemove={() => onChange(logos.filter((_, at) => at !== index))}
          />
        ))}
      </div>

      <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
        {t("appChat.brandKit.logo.primaryHint")}
      </p>

      {unreadableLogos.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-2.5 text-[13px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {t("appChat.brandKit.logo.unreadable").replace(
            "{count}",
            String(unreadableLogos.length),
          )}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          // Copy the list BEFORE clearing the input: `files` is a live view
          // of it, and the reset — which is what lets the same file be picked
          // twice — would otherwise empty the list we are about to upload.
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          void upload(picked, logos.length).then((assets) => {
            if (assets.length === 0) return;
            onChange([
              ...logos,
              ...assets.map((asset, index) => ({
                artifactId: asset.url,
                // The first mark a brand gets is its primary one.
                variant: logos.length + index === 0 ? "primary" : "",
                fileName: asset.fileName,
                format: "",
              })),
            ]);
          });
        }}
      />
    </div>
  );
};
