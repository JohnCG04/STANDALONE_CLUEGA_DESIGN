/**
 * What to paint for one attached file, and what actually plays it.
 *
 * Two facts drive every rule here, and both fail silently in JSX:
 *
 *   1. A url the backend accepts is not always a url a browser can decode. A
 *      trend pick travels as the post's watch PAGE — pointing an <img> or a
 *      <video> at it renders nothing, which is exactly the gray tile with a play
 *      button this module exists to remove.
 *   2. Frame zero of a clip is often black (a fade-in, a slate). Asking the
 *      browser for a frame slightly in is the difference between a thumbnail and
 *      a black square — the same reason the artifacts grid appends `#t` (see
 *      AssetVideoPoster in artifacts/components/AssetContent.tsx).
 *
 * Pure and in `lib/**` because `resources/**` is outside the test glob (see the
 * note in apps/app/package.json), and both facts above regress without a trace.
 */

/** The subset of a message attachment that decides what renders. */
export type AttachmentStillItem = {
  url: string;
  isVideo: boolean;
  posterUrl?: string;
  mediaUrl?: string;
  /** `url` is not playable media (a watch page, or a cover still). */
  isPageUrl?: boolean;
  /** The kinds that have no frame at all. A document is never given a url; an
   *  audio bed HAS one and it decodes to sound, so only the kind tells it from
   *  an image — which is how an .mp3 reached an <img>. */
  kind?: "document" | "audio";
};

export type ThumbSource =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "none" };

/**
 * How far into a clip to seek for its still. Small enough to stay on the opening
 * shot, far enough past a fade-in to carry pixels.
 */
export const STILL_SEEK = "#t=0.1";

/** Media that can be handed to a player, or undefined when there is none. */
export function playbackSrcFor(item: AttachmentStillItem): string | undefined {
  if (item.mediaUrl) return item.mediaUrl;
  return item.isPageUrl ? undefined : item.url;
}

/**
 * The element and src for this row's still, or `none` when nothing can be
 * painted — a cover-only trend pick whose cover the backend has blanked. `none`
 * is a real state, not a bug: the caller shows an icon, never a play button over
 * an empty box.
 */
export function stillSourceFor(item: AttachmentStillItem): ThumbSource {
  // No frame exists for these, whatever the url decodes to.
  if (item.kind === "document" || item.kind === "audio") return { kind: "none" };
  if (!item.isVideo) {
    // An image's own url is its still — a page url is only ever a video's.
    return item.url && !item.isPageUrl
      ? { kind: "image", src: item.url }
      : item.posterUrl
        ? { kind: "image", src: item.posterUrl }
        : { kind: "none" };
  }
  if (item.posterUrl) return { kind: "image", src: item.posterUrl };
  const playable = playbackSrcFor(item);
  return playable
    ? { kind: "video", src: `${playable}${STILL_SEEK}` }
    : { kind: "none" };
}

/**
 * A still item for a row that is NOT a `ComposerAttachment` — a knowledge-base
 * clip, an ad-library entry, a catalog sample.
 *
 * Those rows arrive as loose pairs (`previewUrl`, `embedURL` + `thumbnailURL`,
 * `preview_video_url` + `thumbnail_url`) and each surface used to chain them
 * with `||` in its own JSX, which is three more copies of the decision this
 * module owns — and three places where a page url reaches a `<video>` with no
 * poster and no fallback, i.e. a black box the user reads as a broken tile.
 *
 * `isPageUrl` is inferred rather than taken on trust: these shapes carry no
 * flag, so the known providers are recognised by url — the same ladder rows
 * persisted before the flag existed go down.
 */
export function stillItemFor(input: {
  /** The thing to paint when there is no playable media: a cover, a thumbnail. */
  posterUrl?: string;
  /** Media a player can take, when the row has one. */
  mediaUrl?: string;
  isVideo: boolean;
}): AttachmentStillItem {
  const playable = input.mediaUrl && !isKnownWatchPageUrl(input.mediaUrl)
    ? input.mediaUrl
    : undefined;
  return {
    url: playable ?? input.posterUrl ?? "",
    isVideo: input.isVideo,
    posterUrl: input.posterUrl,
    mediaUrl: playable,
    // Without a playable url the row's own `url` above is the poster, which is
    // a still and never a player's src.
    isPageUrl: playable ? undefined : true,
  };
}

/**
 * Whether a url is a provider watch page, for rows persisted before
 * `isPageUrl` existed. A heuristic on purpose — the alternative for those rows
 * is a <video> pointed at an HTML page, which paints the tile this module fixes.
 * New rows never reach this: they carry the flag.
 */
export function isKnownWatchPageUrl(url: string): boolean {
  return /^https?:\/\/(?:[\w-]+\.)*(?:tiktok\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|douyin\.com)\//i.test(
    url,
  );
}
