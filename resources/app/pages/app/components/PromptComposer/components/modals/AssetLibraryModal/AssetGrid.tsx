"use client";

import { useState, type ReactNode } from "react";

import { AudioLines, Check, PlayCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useInView } from "@/hooks/useInView";
import { previewUrlFor, thumbUrlFor } from "@/lib/media/previewUrl";
import { cn } from "@/lib/utils";

import type { AssetSource } from "@/lib/creative/assetRef";
import { SignedImg, SignedVideo } from "@/components/media/SignedMedia";

// One selectable row of the asset-library modal (PRD Screen 4): shared by the
// Upload / Generation history / Cluega DB / Cluega Design tabs so every grid
// tab renders identical tiles with a checkbox overlay + video badge.

export type PickableAsset = {
  /** Stable selection key (artifact id / asset id / url). */
  key: string;
  url: string;
  /** Poster for videos; falls back to url for images. */
  thumbnailUrl?: string;
  fileName: string;
  isVideo: boolean;
  /** An audio file: no frame to draw, so the tile shows a glyph and its title. */
  isAudio?: boolean;
  /** Width ÷ height, for the masonry layout; square when unknown. */
  aspect?: number;
  artifactId?: string;
  source: AssetSource;
  title?: string;
};

type AssetGridProps = {
  items: PickableAsset[];
  selected: ReadonlyMap<string, PickableAsset>;
  onToggle: (item: PickableAsset) => void;
  /** `masonry` keeps each picture's own ratio. Default `grid` (square tiles). */
  layout?: "grid" | "masonry";
  /** A first cell drawn before the tiles, e.g. an upload tile. */
  leading?: ReactNode;
};

const MASONRY_CLASS = "columns-3 gap-3 sm:columns-4 md:columns-5 [&>*]:mb-3";

/** The grid wrapper, shared with the skeleton so a load can't reflow the tiles. */
const GRID_CLASS = "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5";

/** Placeholder tiles drawn in the real grid's geometry while a page loads —
 *  per-tile shimmer instead of a centered spinner, so switching tab or filter
 *  swaps content in place rather than collapsing and re-growing the body. */
export function AssetGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="aspect-square rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The picture inside one tile, and what to show when there isn't one.
 *
 * Measured on dev (2026-09-16): the Cluega-DB grid was a wall of file names
 * with nothing above them. A tile had exactly one way to draw itself — the
 * `?w=320` derivative — and no answer when that came back 400 or when the row
 * carried a url no browser can load, so the `<img loading="lazy" decoding="async">` stayed empty and the
 * caption underneath was the only thing left.
 *
 * Same ladder the template grid already uses (`SampleTile`): the derivative,
 * then the original, then an honest placeholder. Mounting is gated on
 * visibility for the reason stated there too — `loading="lazy"` starts rows
 * ahead of the viewport, and thirty originals in flight is how the visible
 * tiles end up waiting.
 */
function AssetThumb({ item }: { item: PickableAsset }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [fullSize, setFullSize] = useState(false);
  const [broken, setBroken] = useState(false);

  const source = item.thumbnailUrl || item.url;
  // The tile is ~164px. Measured on dev (QA round 7): these were loading the
  // ORIGINALS — 1050x1482 and 2048x2048 PNGs, 1.3 MB each, thirty of them per
  // open — while the CDP has served a JPEG derivative on
  // /media/artifact-images?w= all along. The same artifact at w=320 is 18 KB:
  // 71x less per tile.
  const thumb = thumbUrlFor(source, 320);
  const original = previewUrlFor(source) || source;
  const src = fullSize ? original : thumb;

  if (item.isAudio)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-100 px-3 text-center text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        <AudioLines className="size-7" />
        <span className="line-clamp-2 text-[11px]">{item.title ?? item.fileName}</span>
      </div>
    );

  return (
    <div ref={ref} className="h-full w-full">
      {!src || broken ? (
        // Never a blank box: a tile that cannot draw says so, and keeps the
        // grid's geometry while it does.
        <div className="flex h-full w-full items-center justify-center bg-neutral-200 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {item.isVideo ? <PlayCircle className="size-6" /> : "No preview"}
        </div>
      ) : !inView ? (
        <div className="h-full w-full animate-pulse bg-neutral-200 dark:bg-neutral-800" />
      ) : item.isVideo ? (
        // A video's own bytes can't be an <img loading="lazy" decoding="async"> src — decode its first frame as
        // the thumbnail instead, same as the library page.
        <SignedVideo
          src={src}
          preload="metadata"
          muted
          playsInline
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <SignedImg
          src={src}
          alt={item.fileName}
          loading="lazy"
          decoding="async"
          width={320}
          height={320}
          onError={() => {
            // A deployment whose backend predates `?w=` answers the derivative
            // with a 400. Fall back to the object itself before giving up.
            if (!fullSize && thumb !== original) {
              setFullSize(true);
              return;
            }
            setBroken(true);
          }}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

export function AssetGrid({
  items,
  selected,
  onToggle,
  layout = "grid",
  leading,
}: AssetGridProps) {
  const masonry = layout === "masonry";
  return (
    <div className={masonry ? MASONRY_CLASS : GRID_CLASS}>
      {leading}
      {items.map((item) => {
        const isSelected = selected.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item)}
            style={masonry ? { aspectRatio: item.aspect || 1 } : undefined}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-neutral-100 text-left dark:bg-neutral-900",
              masonry ? "block w-full break-inside-avoid" : "aspect-square",
              isSelected
                ? "border-blue-500 ring-2 ring-blue-500/40"
                : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800",
            )}
          >
            {/* Keyed on the URL: a row whose thumbnail changes gets a fresh
                tile rather than one still holding the previous one's
                "this failed" state. */}
            <AssetThumb key={item.thumbnailUrl || item.url} item={item} />
            {item.isVideo ? (
              <PlayCircle
                className="absolute bottom-1.5 left-1.5 size-5 text-white drop-shadow"
                strokeWidth={2}
              />
            ) : null}
            <span
              className={cn(
                "absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border",
                isSelected
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-white/80 bg-black/20 text-transparent group-hover:text-white/70",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-[11px] text-white">
              {item.title ?? item.fileName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
