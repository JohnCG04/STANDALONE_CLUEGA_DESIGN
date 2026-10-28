"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { PROJECT_GRID_CLASS, SKELETON_CARD_COUNT } from "../constants";

/** Loading placeholder for the project grid — same columns as the real grid. */
export const ProjectGridSkeleton = () => (
  <div className={PROJECT_GRID_CLASS} aria-busy="true" aria-live="polite">
    {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
      <div
        key={index}
        className="rounded-2xl border border-neutral-100 p-2.5 dark:border-neutral-800"
      >
        <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        <Skeleton className="mt-2.5 h-6 w-full rounded-lg" />
      </div>
    ))}
  </div>
);
