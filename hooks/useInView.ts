"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useInView reports whether an element has entered the viewport, latching to
 * true on the first intersection and disconnecting afterwards — callers use it
 * to defer work for off-screen cards, so re-hiding a card must not undo it.
 *
 * `rootMargin` deliberately overshoots the viewport so a card starts loading
 * just before it scrolls into view.
 *
 * The ref must land on an element that generates a layout box. An element
 * styled `display: contents` produces none, and IntersectionObserver never
 * reports such a target as intersecting -- `inView` would stay false forever
 * and the deferred work would never start. The type parameter exists so a
 * caller whose real box is a button or a section can attach the ref to that
 * element directly instead of wrapping it in a box-less div.
 */
export function useInView<TElement extends HTMLElement = HTMLDivElement>(
  rootMargin = "300px",
) {
  const ref = useRef<TElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const element = ref.current;
    if (!element) return;

    // No observer (old browser / jsdom): degrade to eager rendering rather than
    // leaving the card blank forever.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
