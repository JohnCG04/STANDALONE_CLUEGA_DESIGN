"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { dragCarriesFiles } from "@/lib/uploads/limits";

/** How long without a `dragover` before we conclude the drag is gone.
 *
 *  `dragover` fires continuously while a drag is live (every 50-350ms depending
 *  on the engine), so silence for this long means the pointer left. Only the
 *  watchdog needs it — every other exit is event-driven. */
const DRAG_IDLE_MS = 700;
const DRAG_WATCHDOG_MS = 400;

/**
 * The drag-hover state machine for a file drop surface. No upload, no
 * validation, no copy — those differ per surface, this does not.
 *
 * Extracted because the same ~40 lines were already written three times
 * (useSkillDropzone, UploadDropzoneModal, knowledge/BatchComposer) and each copy
 * is missing a different one of the fixes below.
 *
 * It deliberately does NOT own `onDrop`: what a drop MEANS is the caller's
 * business, and routing it back through a callback prop would be indirection
 * around one line. Callers write their own `onDrop` and call `endDrag()` first.
 */
export function useDragFileTarget(): {
  isDragging: boolean;
  /** Spread onto the element that IS the surface. */
  dragHandlers: {
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
  };
  /** Call first thing from your own `onDrop`. */
  endDrag: () => void;
} {
  const [isDragging, setIsDragging] = useState(false);

  // dragenter/dragleave fire for EVERY descendant the pointer crosses — over a
  // chat transcript that is hundreds of elements a second, and a plain boolean
  // switches the overlay off the moment the cursor reaches a message bubble.
  // Counting enters and leaves tracks the surface as a whole.
  const dragDepth = useRef(0);
  const lastDragOverAt = useRef(0);

  const endDrag = useCallback(() => {
    dragDepth.current = 0;
    setIsDragging(false);
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    // Gated: a dragged asset-library row or a dragged link is not a file drop,
    // and lighting up the overlay for it would claim a gesture this surface
    // does not handle.
    if (!dragCarriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    // ⚠ Deliberately NOT gated on dragCarriesFiles, unlike enter/over. If the
    // gate ever answered false on a leave it had answered true for on enter,
    // the counter would leak and the overlay would stick until the next click.
    // Decrementing unconditionally cannot leak; at worst it ends a drag early.
    if (dragDepth.current === 0) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) endDrag();
  }, [endDrag]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!dragCarriesFiles(event.dataTransfer)) return;
    // Without preventDefault here the browser REFUSES the drop and navigates
    // the tab to file:///… instead — the user is thrown out of the app.
    event.preventDefault();
    // Flips the OS cursor from "no entry" to a copy badge. Cosmetic, and most
    // of what makes the gesture feel like it will work.
    event.dataTransfer.dropEffect = "copy";
    lastDragOverAt.current = Date.now();
  }, []);

  // Every way a drag can end WITHOUT the surface seeing a matching dragleave.
  // Each of these leaves the overlay stuck on screen otherwise.
  useEffect(() => {
    if (!isDragging) return;

    // relatedTarget === null means the pointer left the WINDOW, not a child.
    const onWindowDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) endDrag();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") endDrag();
    };
    // Capture phase: a drop released somewhere else in the app (the side panel,
    // the header) may stopPropagation, and we still need to know it happened.
    window.addEventListener("drop", endDrag, true);
    window.addEventListener("dragleave", onWindowDragLeave);
    // Only fires when the drag SOURCE is in-page; an OS-originated drag has no
    // source. A supplement, never the mechanism.
    window.addEventListener("dragend", endDrag);
    window.addEventListener("keydown", onKeyDown);

    // Safari's window-level dragleave is unreliable, so events alone cannot
    // guarantee cleanup. This is the only check that holds on all three engines.
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastDragOverAt.current > DRAG_IDLE_MS) endDrag();
    }, DRAG_WATCHDOG_MS);

    return () => {
      window.removeEventListener("drop", endDrag, true);
      window.removeEventListener("dragleave", onWindowDragLeave);
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(watchdog);
    };
  }, [endDrag, isDragging]);

  return {
    isDragging,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave },
    endDrag,
  };
}
