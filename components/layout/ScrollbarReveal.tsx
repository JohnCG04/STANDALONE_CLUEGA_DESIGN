"use client";

import { useEffect } from "react";

/** How long a scrollbar stays after the last scroll — the sidebar's 700ms. */
export const SCROLLBAR_HIDE_AFTER_MS = 700;

type Timers = WeakMap<Element, ReturnType<typeof setTimeout>>;

/** Shows `box`'s scrollbar now and hides it once scrolling has been quiet. */
export function revealScrollbar(box: Element, timers: Timers) {
  box.classList.add("is-scrolling");
  clearTimeout(timers.get(box));
  timers.set(
    box,
    setTimeout(() => box.classList.remove("is-scrolling"), SCROLLBAR_HIDE_AFTER_MS),
  );
}

/**
 * Every scrollbar behaves as the sidebar's: invisible at rest, shown while its
 * box scrolls, gone 700ms after (asked for, 2026-10-06). One capture listener
 * on the document instead of an onScroll per list — `scroll` does not bubble,
 * but it does pass through the capture phase. The page itself scrolls with the
 * document as the target, so that lands on <html>. The CSS that reads
 * `.is-scrolling` is in app/globals.css.
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers: Timers = new WeakMap();
    const onScroll = (event: Event) =>
      revealScrollbar(
        event.target instanceof Element ? event.target : document.documentElement,
        timers,
      );
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  return null;
}
