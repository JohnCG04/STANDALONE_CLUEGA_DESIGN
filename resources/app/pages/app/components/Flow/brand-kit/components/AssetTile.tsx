"use client";

import { X } from "lucide-react";

import { SignedImg } from "@/components/media/SignedMedia";

/**
 * One uploaded asset: a thumbnail, its filename, and a remove affordance.
 *
 * The filename footer follows workflow-form/CreativeGridCard — a fixed
 * min-height so a one-line and a two-line name do not change the row's rhythm.
 */
export const AssetTile = ({
  url,
  fileName,
  removeLabel,
  onRemove,
}: {
  url: string;
  fileName: string;
  removeLabel: string;
  onRemove: () => void;
}) => (
  <div className="group relative flex flex-col gap-1.5">
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- an artifact id or
          an arbitrary https url, neither of which next/image can size ahead. */}
      {/* `object-contain`, not `cover`: a wordmark is far wider than the square
          tile, and cropping it to fill eats the first and last letters — a
          1300x360 LUMORA mark read as "UMORA". Letterboxing shows the mark. */}
      <SignedImg src={url} alt="" className="size-full object-contain p-2" />
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-neutral-700 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 dark:bg-neutral-900/80 dark:text-neutral-200"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
    <p
      title={fileName}
      className="line-clamp-2 min-h-[2.25rem] text-center text-[12px] font-medium text-neutral-600 dark:text-neutral-400"
    >
      {fileName}
    </p>
  </div>
);
