"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { BRAND_KIT_GRID_CLASS, SKELETON_CARD_COUNT } from "../constants";

/**
 * Loading placeholder for the card grid — same columns as the real grid, and
 * the same anatomy: a full-bleed cover, a palette strip, a name.
 */
export const BrandKitGridSkeleton = () => (
  <div className={BRAND_KIT_GRID_CLASS} aria-busy="true" aria-live="polite">
    {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
      <div
        key={index}
        className="flex flex-col overflow-hidden rounded-2xl border border-neutral-100 dark:border-neutral-800"
      >
        <Skeleton className="h-[104px] w-full rounded-none" />
        <div className="flex flex-col gap-3 p-3">
          <Skeleton className="h-6 w-full rounded-md" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      </div>
    ))}
  </div>
);
