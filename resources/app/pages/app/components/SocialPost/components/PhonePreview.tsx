"use client";

import { useTranslate } from "@/hooks/useTranslate";
import type { AssetRef } from "@/lib/creative/assetRef";
import type { SocialPlatform } from "@/lib/social-posts/client";
import { placementPreviewsFor } from "@/lib/social-posts/platforms";
import { hashtagText } from "../helpers";
import { PREVIEW_MAX_WIDTH_PX } from "../constants";

import { SignedImg, SignedVideo } from "@/components/media/SignedMedia";

/**
 * The post as its first chosen platform will show it: TikTok's 9:16 frame, or
 * Facebook's 1:1 feed frame when only Facebook is chosen, with the caption over
 * the media. Deliberately ONE frame — the feed/profile/web variants of TikTok's
 * own studio are different crops of data we do not have, so rendering tabs for
 * them would be inventing previews. The media is letterboxed, never cropped, and
 * the clip plays with sound: TikTok's audit wants the poster to see exactly what goes out.
 *
 * MUST stay mounted at every panel width. The `<video>`'s `onLoadedMetadata` is
 * the only place the clip's duration is read: without it `durationOverCap` can
 * never fire and the submit omits `duration_seconds`, so an over-long clip is
 * spent on a backend rejection. That is why the layout switches columns in CSS
 * instead of conditionally rendering this.
 */
export function PhonePreview({
  asset,
  caption,
  handle,
  hashtags,
  mediaType,
  onVideoDuration,
  photoCount,
  platforms,
}: {
  asset: AssetRef;
  caption: string;
  /** Who the post appears as, formatted: "@username" for TikTok, the Page's
   *  name for Facebook. */
  handle?: string;
  hashtags: readonly string[];
  mediaType: "image" | "video";
  onVideoDuration: (seconds: number) => void;
  /** Photos in the carousel; 0 for a single video. */
  photoCount: number;
  /** The chosen platforms, in table order; the first one's frame is shown. */
  platforms: readonly SocialPlatform[];
}) {
  const { t } = useTranslate();
  const ratio = placementPreviewsFor(platforms)[0];
  const tags = hashtagText(hashtags);

  return (
    <figure className="mx-auto w-full" style={{ maxWidth: PREVIEW_MAX_WIDTH_PX }}>
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-neutral-950 shadow-sm"
        style={{ aspectRatio: ratio?.aspect ?? "9/16" }}
      >
        {mediaType === "video" ? (
          <SignedVideo
            src={asset.url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const seconds = event.currentTarget.duration;
              if (Number.isFinite(seconds) && seconds > 0) {
                onVideoDuration(Math.round(seconds));
              }
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <SignedImg loading="lazy" decoding="async" src={asset.url} alt="" className="h-full w-full object-contain" />
        )}

        {photoCount > 1 ? (
          <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
            1/{photoCount}
          </span>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-10 pb-3">
          {handle ? (
            <p className="text-[12px] font-semibold text-white">{handle}</p>
          ) : null}
          <p className="mt-1 line-clamp-3 text-[12px] leading-snug whitespace-pre-wrap text-white/90">
            {caption}
            {tags ? <span className="text-white/70"> {tags}</span> : null}
          </p>
        </div>
      </div>
      {ratio ? (
        <figcaption className="mt-2 text-center text-[11px] text-muted-foreground">
          {t("appChat.socialPost.previewLabel").replace("{ratio}", ratio.ratio)}
        </figcaption>
      ) : null}
    </figure>
  );
}
