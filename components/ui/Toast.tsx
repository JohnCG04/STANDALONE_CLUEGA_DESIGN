"use client";

import { AlertCircle, Info, X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useToastStore } from "@/lib/stores/useToastStore";

// App-wide toast viewport — mount once near the page root. Renders the queue
// from useToastStore (fixed top-center so it never fights the composer).
//
// WHERE: centred on the chat frame, not the window. A screen marks its conversation column
// with `data-toast-anchor`; the viewport measures it (and follows resizes) and sits at its
// horizontal centre, just under its header. Screens without a marker fall back to the app
// shell's <main>, and with neither the CSS default (window centre) stays.
//
// `top-16` (64px), not the 16px it was: the page header is about 56px tall in the app
// (Pulse, the chat, the Library), and a toast at 16px sat ON it — over the tab strip and
// the panel toggle — so a message about an upload covered the controls the reader needed
// next. 64px puts it just under the header, centred.

// One entry per tone, so the three channels that carry "which kind of message is
// this" stay together and cannot drift apart.
//
// ⚠ Colour is never the only carrier. A red/blue distinction is invisible to a
// colour-blind reader and to anyone reading a greyscale screenshot, so it cannot
// be the only thing saying which kind of message this is. The glyph is the
// redundant visual channel and the ARIA role is the non-visual one.
const TONES = {
  error: {
    Icon: AlertCircle,
    // Assertive: a failed write has to reach the user BEFORE they act on the
    // assumption it worked.
    role: "alert" as const,
    box: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    icon: "text-red-500 dark:text-red-400",
  },
  info: {
    Icon: Info,
    // Polite: a screen reader finishes its sentence first. Right for "here is
    // what your click did", which the user asked for by clicking.
    role: "status" as const,
    // Blue rather than neutral. `tone: "info"` used to fall through to
    // white-on-neutral — indistinguishable from no tone at all, so the one
    // thing the tone existed to say went unsaid.
    box: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
    icon: "text-blue-500 dark:text-blue-400",
  },
};

/** Header (~56px) plus a small gap: the toast's top edge, measured from the anchor's top. */
const BELOW_HEADER_PX = 64;

export const ToastViewport = () => {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const viewportRef = useRef<HTMLDivElement>(null);
  const visible = toasts.length > 0;

  // Written straight to the element, not through state: it is a pure measurement, and a
  // setState in an effect would re-render the whole queue on every resize.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!visible || !node) return;
    const anchor =
      document.querySelector<HTMLElement>("[data-toast-anchor]") ??
      document.querySelector<HTMLElement>("main");
    const place = () => {
      if (!anchor?.isConnected) {
        node.style.left = "";
        node.style.top = "";
        return;
      }
      const rect = anchor.getBoundingClientRect();
      node.style.left = `${rect.left + rect.width / 2}px`;
      node.style.top = `${Math.max(BELOW_HEADER_PX, rect.top + BELOW_HEADER_PX)}px`;
    };
    place();
    window.addEventListener("resize", place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (anchor) observer?.observe(anchor);
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
    // `toasts` too: a toast pushed after navigating to another screen must re-find its anchor.
  }, [visible, toasts]);

  if (!visible) return null;

  return (
    <div
      ref={viewportRef}
      className="pointer-events-none fixed left-1/2 top-16 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => {
        const tone = TONES[toast.tone === "error" ? "error" : "info"];
        return (
          <div
            key={toast.id}
            role={tone.role}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold shadow-lg",
              tone.box,
            )}
          >
            <tone.Icon
              aria-hidden
              className={cn("mt-px h-4 w-4 shrink-0", tone.icon)}
              strokeWidth={2}
            />
            <span className="min-w-0 flex-1 whitespace-pre-line break-words">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-0.5 underline underline-offset-2 hover:opacity-80"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              onClick={() => dismiss(toast.id)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
