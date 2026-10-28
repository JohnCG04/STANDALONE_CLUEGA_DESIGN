"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export function HoverTooltip({
  content,
  /**
   * How long the pointer has to rest before the card appears.
   *
   * 0 by default, which is every caller that existed before this: a tooltip on
   * a truncated cell should answer the moment you point at it. A ROW OF ICONS
   * wants a delay — sweeping across seven of them otherwise flashes seven
   * cards. Focus is never delayed: a keyboard user asked deliberately.
   */
  delayMs = 0,
  asChild = false,
  side = "top",
  align = "center",
  sideOffset = 8,
  contentClassName,
  children,
}: {
  content?: ReactNode;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  delayMs?: number;
  asChild?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const cancel = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  // Leaving the page mid-hover must not leave a timer holding a setState.
  useEffect(() => cancel, []);

  const openAfterDelay = () => {
    if (delayMs <= 0) {
      setOpen(true);
      return;
    }
    cancel();
    timer.current = window.setTimeout(() => setOpen(true), delayMs);
  };
  const closeNow = () => {
    cancel();
    setOpen(false);
  };

  if (!content) return <>{children}</>;

  const anchorProps = {
    onPointerEnter: openAfterDelay,
    onPointerLeave: closeNow,
    onFocusCapture: () => setOpen(true),
    onBlurCapture: closeNow,
  };
  const anchor = asChild && isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, anchorProps)
    : (
      <span className="block max-w-full" {...anchorProps}>
        {children}
      </span>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        {anchor}
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn("pointer-events-none z-[90] w-max max-w-[280px] rounded-lg border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-white shadow-xl", contentClassName)}
      >
        <div className="text-[12px] font-medium leading-snug">
          {content}
        </div>
      </PopoverContent>
    </Popover>
  );
}
