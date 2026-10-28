"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  DRAG_SCROLL_FRICTION,
  DRAG_SCROLL_MIN_FLICK_VELOCITY,
  DRAG_SCROLL_THRESHOLD_PX,
} from "../constants";

interface DragState {
  pointerId: number;
  /** Scroll offset and pointer position the gesture started from. */
  startX: number;
  startScrollLeft: number;
  /** Where the pointer is now — read by the frame callback, not applied inline. */
  currentX: number;
  /** Last sample, for the release velocity (px per ms). */
  lastX: number;
  lastTime: number;
  velocity: number;
  /** The pointer has passed the threshold — this gesture is a drag, not a click. */
  dragging: boolean;
}

/**
 * Mouse drag-to-scroll for a horizontal scroller, with a flick that coasts.
 *
 * Pointer events, so a pen behaves like a mouse; touch is skipped because the
 * browser's own panning already handles it (and hijacking it would cost the
 * native momentum and the vertical scroll that starts inside the row).
 *
 * Moves are applied in a rAF loop rather than inside the event handler: a mouse
 * or trackpad reports far more often than the screen repaints, and each inline
 * write would scroll — then have the scroll handler measure — several times per
 * frame. One write per frame is what makes the row track the cursor smoothly.
 *
 * The gesture only becomes a drag past DRAG_SCROLL_THRESHOLD_PX — below that a
 * press is still a click, so the cards under it stay clickable. Once it is a
 * drag the pointer is captured (the gesture survives leaving the row) and the
 * click that follows the release is swallowed in the capture phase, so letting
 * go over a card does not also open that project.
 */
export function useDragToScroll(ref: RefObject<HTMLElement | null>) {
  const state = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const cancelFrame = useCallback(() => {
    if (frame.current === null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  // A drag that outlives the component (unmount mid-gesture) must not keep a
  // frame scheduled against a detached element.
  useEffect(() => cancelFrame, [cancelFrame]);

  /** One write per frame while the pointer is down. */
  const track = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const step = () => {
      frame.current = null;
      const drag = state.current;
      if (!drag) return;
      el.scrollLeft = drag.startScrollLeft - (drag.currentX - drag.startX);
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [ref]);

  /** After the release: keep gliding, shedding speed, until it dies or hits an edge. */
  const coast = useCallback(
    (velocity: number) => {
      const el = ref.current;
      if (!el) return;
      const step = () => {
        frame.current = null;
        // 16ms rather than a measured delta: the speed is a feel constant, and a
        // long frame must not translate into one long jump.
        const next = el.scrollLeft - velocity * 16;
        const max = el.scrollWidth - el.clientWidth;
        el.scrollLeft = next;
        velocity *= DRAG_SCROLL_FRICTION;
        const stalled =
          Math.abs(velocity) < DRAG_SCROLL_MIN_FLICK_VELOCITY ||
          (next <= 0 && velocity > 0) ||
          (next >= max && velocity < 0);
        if (stalled) return;
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [ref],
  );

  const stop = (event: PointerEvent) => {
    const drag = state.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.current = null;
    if (!drag.dragging) return;
    cancelFrame();
    ref.current?.releasePointerCapture?.(event.pointerId);
    suppressClick.current = true;
    setDragging(false);
    if (Math.abs(drag.velocity) >= DRAG_SCROLL_MIN_FLICK_VELOCITY) {
      coast(drag.velocity);
    }
  };

  return {
    /** True while the pointer is dragging the row — for the cursor. */
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        const el = ref.current;
        if (!el) return;
        // Grabbing a coasting row stops it where it is, as a scrollbar would.
        cancelFrame();
        // A press that never became a drag left the flag set (no click followed,
        // e.g. the release landed outside the row) — clear it before the next one.
        suppressClick.current = false;
        state.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: el.scrollLeft,
          currentX: event.clientX,
          lastX: event.clientX,
          lastTime: event.timeStamp,
          velocity: 0,
          dragging: false,
        };
      },
      onPointerMove: (event: PointerEvent) => {
        const drag = state.current;
        const el = ref.current;
        if (!drag || !el || drag.pointerId !== event.pointerId) return;
        drag.currentX = event.clientX;
        const elapsed = event.timeStamp - drag.lastTime;
        if (elapsed > 0) {
          const sample = (event.clientX - drag.lastX) / elapsed;
          // Smoothed, so one stuttering sample cannot decide the whole flick.
          drag.velocity = drag.velocity * 0.7 + sample * 0.3;
          drag.lastX = event.clientX;
          drag.lastTime = event.timeStamp;
        }
        if (drag.dragging) return;
        if (Math.abs(event.clientX - drag.startX) < DRAG_SCROLL_THRESHOLD_PX) return;
        drag.dragging = true;
        el.setPointerCapture(event.pointerId);
        setDragging(true);
        track();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onClickCapture: (event: MouseEvent) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      // The thumbnails are <img>: without this a drag across one starts the
      // browser's native image drag instead of scrolling the row.
      onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}
