"use client";

import { useTranslate } from "@/hooks/useTranslate";
import type { AssetRef } from "@/lib/creative/assetRef";
import {
  TIKTOK_MAX_PHOTOS,
  assetMediaKind,
} from "@/lib/social-posts/tiktokRules";
import { cn } from "@/lib/utils";

import { SignedImg, SignedVideo } from "@/components/media/SignedMedia";

/**
 * The turn's outputs as a selectable strip. Selection order IS carousel order,
 * so the badge carries the position rather than a tick.
 *
 * The cover control appears only for a photo carousel — `photo_cover_index` is
 * the only cover TikTok's API takes from us, and it indexes photos. A video post
 * has no cover to choose here.
 */
export function MediaPicker({
  candidates,
  coverIndex,
  hint,
  max = TIKTOK_MAX_PHOTOS,
  onSetCover,
  onToggle,
  selected,
  showCover,
}: {
  candidates: readonly AssetRef[];
  /** Position of the carousel cover within `selected`, or null when the post
   *  is not a carousel. */
  coverIndex: number | null;
  /** Replaces the carousel hint when a selected platform takes fewer items
   *  (a Facebook post carries one). */
  hint?: string;
  /** The most items the selected platforms take together. */
  max?: number;
  onSetCover: (index: number) => void;
  onToggle: (asset: AssetRef) => void;
  selected: readonly AssetRef[];
  showCover: boolean;
}) {
  const { t } = useTranslate();
  const over = selected.length > max;
  const positionOf = (asset: AssetRef) =>
    selected.findIndex((item) => item.url === asset.url);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          {showCover
            ? t("appChat.socialPost.coverHeading")
            : t("appChat.socialPost.mediaHeading")}
        </span>
        <span
          className={cn(
            "text-[11px]",
            over ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {t("appChat.socialPost.mediaCount")
            .replace("{count}", String(selected.length))
            .replace("{max}", String(max))}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map((asset) => {
          const position = positionOf(asset);
          const isSelected = position >= 0;
          const isCover = showCover && coverIndex === position && isSelected;
          return (
            <div key={asset.url} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => onToggle(asset)}
                aria-pressed={isSelected}
                className={cn(
                  "relative size-16 overflow-hidden rounded-[10px] border transition-colors",
                  isSelected
                    ? "border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                    : "border-border opacity-60 hover:opacity-100",
                )}
              >
                {assetMediaKind(asset) === "video" ? (
                  <SignedVideo src={asset.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <SignedImg loading="lazy" decoding="async" src={asset.url} alt="" className="h-full w-full object-cover" />
                )}
                {isSelected ? (
                  <span className="absolute top-1 left-1 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                    {position + 1}
                  </span>
                ) : null}
              </button>
              {showCover && isSelected ? (
                <button
                  type="button"
                  onClick={() => onSetCover(position)}
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    isCover
                      ? "bg-blue-500 text-white"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {isCover
                    ? t("appChat.socialPost.coverBadge")
                    : t("appChat.socialPost.setCover")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p
        className={cn(
          "mt-1.5 text-[11px]",
          over ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
        )}
      >
        {hint ??
          t("appChat.socialPost.carouselHint").replace(
            "{max}",
            String(TIKTOK_MAX_PHOTOS),
          )}
      </p>
    </div>
  );
}
