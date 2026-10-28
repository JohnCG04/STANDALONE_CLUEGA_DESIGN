"use client";

import { useCallback, useState, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/utils";

import { FlowScrollContext } from "./flowScroll";

/**
 * The one page shell every Flow workspace page (Home, Projects, Techniques, …)
 * renders inside. Single source of truth for the container spacing standard:
 * full-width, even side padding (px-6 / sm:px-8), no max-width. New Flow pages
 * must render inside this instead of hand-rolling their own <main>.
 *
 * It is also the page's scroll container, which it publishes on
 * `FlowScrollContext` for the descendants that have to track scrolling.
 */
export const FlowPageShell = ({
  scrollRef,
  fill = false,
  flush = false,
  children,
}: {
  /** Attach when the page needs to drive the scroll position (e.g. pagination). */
  scrollRef?: Ref<HTMLElement>;
  /** A full-height body that does not scroll, for a workspace whose panes scroll themselves. */
  fill?: boolean;
  /** With `fill`: no side or top padding, for an editor that runs edge to edge. */
  flush?: boolean;
  children: ReactNode;
}) => {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  // Feeds both readers: the caller's ref and the context's state. Ref callbacks
  // run in the commit phase, so that state is flushed before paint.
  const attach = useCallback(
    (element: HTMLElement | null) => {
      setScrollElement(element);
      if (typeof scrollRef === "function") scrollRef(element);
      else if (scrollRef) scrollRef.current = element;
    },
    [scrollRef],
  );

  return (
    <FlowScrollContext.Provider value={scrollElement}>
      <main
        ref={attach}
        className={cn(
          "flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-950",
          fill ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "w-full",
            !flush && "px-6 pt-6 sm:px-8 sm:pt-8",
            fill ? cn("flex min-h-0 flex-1 flex-col", !flush && "pb-6") : "pb-20",
          )}
        >
          {children}
        </div>
      </main>
    </FlowScrollContext.Provider>
  );
};
