"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { useFlowRecentProjects } from "@/resources/app/components/FlowSidebar/useFlowRecentProjects";

import { WorkflowThumbnail } from "../../components/WorkflowThumbnail";
import { formatRelative } from "../../helpers";
import type { FlowProject } from "../../services/flow-builder.service";
import {
  HOME_RECENT_EDGE_EPSILON_PX,
  HOME_RECENT_PROJECTS_LIMIT,
  HOME_RECENT_SKELETON_COUNT,
} from "../constants";
import { useDragToScroll } from "../hooks/useDragToScroll";

/**
 * The most recently edited projects as a horizontal row the user slides through
 * with the arrow buttons, a mouse drag, or a swipe / trackpad scroll — a plain
 * scroll container, no carousel library — with a create tile in front of them
 * and "See All" to the full list.
 *
 * Reads the SAME narrow query the Flow sidebar's Recent Projects section reads
 * (page 1, `sort=updated_at`), only for a longer row — the limit is part of the
 * query key, so the two lists cache separately while both stay under the key
 * every create/rename/delete already invalidates.
 */
export const HomeRecentProjects = ({
  onCreate,
  onOpenProject,
  onSeeAll,
}: {
  onCreate: () => void;
  onOpenProject: (id: string) => void;
  onSeeAll: () => void;
}) => {
  const { t, lang } = useTranslate();
  const { projects, isLoading } = useFlowRecentProjects(
    HOME_RECENT_PROJECTS_LIMIT,
  );
  const justNow = t("appChat.flow.justNow");
  const updatedTemplate = t("appChat.flow.home.updated");

  const updatedLabel = (project: FlowProject) =>
    updatedTemplate.replace(
      "{time}",
      formatRelative(project.updated_at, lang, justNow),
    );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const measureFrame = useRef<number | null>(null);

  /**
   * Coalesced to one measurement per frame: the scroll handler fires for every
   * scrollLeft a drag writes, and each `scrollWidth` read forces a layout.
   */
  const updateEdges = useCallback(() => {
    if (measureFrame.current !== null) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      const el = scrollerRef.current;
      if (!el) return;
      setCanPrevious(el.scrollLeft > HOME_RECENT_EDGE_EPSILON_PX);
      setCanNext(
        el.scrollLeft <
          el.scrollWidth - el.clientWidth - HOME_RECENT_EDGE_EPSILON_PX,
      );
    });
  }, []);

  // The edges depend on layout, not just on scrolling: a viewport resize can turn
  // a non-scrollable row scrollable and back, and so can the tile count when the
  // fetched projects replace the skeletons. The observer catches the resize; the
  // tile count is a dependency instead, because the track fills the scroller and
  // the tiles overflow it, so adding tiles no longer resizes the track itself.
  useEffect(() => {
    updateEdges();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateEdges);
    if (scrollerRef.current) observer.observe(scrollerRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => {
      observer.disconnect();
      if (measureFrame.current !== null) {
        cancelAnimationFrame(measureFrame.current);
        measureFrame.current = null;
      }
    };
  }, [updateEdges, isLoading, projects.length]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  const { dragging, handlers: dragHandlers } = useDragToScroll(scrollerRef);

  const scrollable = canPrevious || canNext;
  /**
   * Width of one tile. A fifth of the visible row (minus the four `gap-5`
   * gutters) caps the row at five tiles however wide the screen gets — a fixed
   * px width let a 1900px screen show seven. The min-widths keep the old fixed
   * sizes below ~1260px, where a fifth would be too narrow to read, so narrow
   * screens still scroll through part-tiles as before.
   */
  const tileClass =
    "w-[calc((100%-5rem)/5)] min-w-[208px] shrink-0 sm:min-w-[236px]";

  return (
    <section
      aria-labelledby="flow-home-recent-title"
      data-learn="flow-home.recent-projects"
      className="mt-10"
    >
      <header className="flex items-center justify-between gap-4">
        <h2
          id="flow-home-recent-title"
          className="text-[22px] font-bold leading-tight text-neutral-900 dark:text-neutral-50"
        >
          {t("appChat.flow.home.recentTitle")}
        </h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-bold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50 dark:focus-visible:ring-neutral-100"
        >
          {t("appChat.flow.home.seeAll")}
          <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="relative mt-4">
        {/* The arrows centre on the THUMBNAILS, not on the section: `top-0` +
            `bottom-[54px]` + `my-auto` centres each one in the band above the
            two meta lines, which would otherwise pull them below the cards.
            54px = a tile's meta block (mt-2.5 + h-5 name + mt-1 + h-4 date)
            plus the scroller's own `pb-1` — keep it in step with those. */}
        {scrollable ? (
          <>
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={!canPrevious}
              aria-label={t("appChat.flow.home.scrollBack")}
              className={cn(
                "absolute left-1 top-0 bottom-[54px] z-20 my-auto flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition-opacity hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
                canPrevious ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={!canNext}
              aria-label={t("appChat.flow.home.scrollForward")}
              className={cn(
                "absolute right-1 top-0 bottom-[54px] z-20 my-auto flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition-opacity hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
                canNext ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        ) : null}

        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          {...dragHandlers}
          /* Deliberately no scroll-snap: the row has to stop exactly where the
             hand left it. Mandatory snap also fights every scrollLeft a drag
             writes, so it would have to be switched off mid-gesture — and
             switching it back on is itself the jump it was meant to avoid. */
          className={cn(
            "overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            dragging ? "cursor-grabbing select-none" : "cursor-grab",
          )}
        >
          <ul ref={trackRef} className="flex gap-5">
            <li className={tileClass}>
              <button
                type="button"
                onClick={onCreate}
                data-learn="flow-home.create-new"
                className="group block w-full text-left focus-visible:outline-none"
              >
                <span className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white transition-colors group-hover:border-neutral-400 group-hover:bg-neutral-50 group-focus-visible:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:group-hover:bg-neutral-800">
                  <Plus
                    className="size-6 text-neutral-400 transition-transform group-hover:scale-110 dark:text-neutral-500"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-2.5 block h-5 truncate text-[13px] font-bold leading-5 text-neutral-800 dark:text-neutral-100">
                  {t("appChat.flow.createNew")}
                </span>
              </button>
            </li>

            {isLoading
              ? Array.from({ length: HOME_RECENT_SKELETON_COUNT }).map(
                  (_, index) => (
                    <li key={index} className={tileClass} aria-hidden="true">
                      <Skeleton className="aspect-[16/9] w-full rounded-xl" />
                      <Skeleton className="mt-2.5 h-5 w-3/4 rounded-md" />
                      <Skeleton className="mt-1 h-4 w-1/2 rounded-md" />
                    </li>
                  ),
                )
              : projects.map((project) => (
                  <li key={project.id} className={tileClass}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      className="group block w-full text-left focus-visible:outline-none"
                    >
                      <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 transition-shadow group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] group-focus-visible:ring-2 group-focus-visible:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:group-focus-visible:ring-neutral-100">
                        <WorkflowThumbnail
                          src={project.thumbnail_url}
                          type={project.thumbnail_type}
                          alt={project.name}
                        />
                      </span>
                      {/* `title` so a name the tile had to truncate is still readable. */}
                      <span
                        title={project.name}
                        className="mt-2.5 block h-5 truncate text-[13px] font-bold leading-5 text-neutral-800 dark:text-neutral-100"
                      >
                        {project.name}
                      </span>
                      <span className="mt-1 block h-4 truncate text-[12px] font-medium leading-4 text-neutral-500 dark:text-neutral-400">
                        {updatedLabel(project)}
                      </span>
                    </button>
                  </li>
                ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
