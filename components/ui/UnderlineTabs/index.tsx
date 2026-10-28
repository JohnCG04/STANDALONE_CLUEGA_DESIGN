"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Tabs, TabsList, TabsTrigger } from "../tabs";
import { Button } from "../Button";

/** One tab: the value handed back on select, plus what the strip renders. */
export type UnderlineTabItem<TValue extends string = string> = {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
};

export type UnderlineTabsProps<TValue extends string = string> = {
  /** Tabs in display order. */
  tabs: readonly UnderlineTabItem<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  /** Leading back/collapse button. Omit to render the strip without one. */
  onCollapse?: () => void;
  collapseLabel?: string;
  /** Host icon-button token, merged OVER the built-in one, so an app that owns
   *  its own icon-button recipe stays the single source for those pixels. */
  collapseClassName?: string;
  /** `aria-label` for the tablist. */
  label?: string;
  /** Rendered flush-right on the same row — chips, actions, a settings entry. */
  rightSlot?: ReactNode;
  /** Merged OVER every trigger's recipe — type scale, padding, active colour. */
  triggerClassName?: string;
  /** Merged OVER the sliding underline's recipe. A surface that underlines in
   *  its own accent rather than in `foreground` overrides `bg-*` here, because
   *  the bar is this one element and no longer the trigger's own border. */
  indicatorClassName?: string;
  /** Host layout only (outer spacing). The strip owns nothing above itself. */
  className?: string;
  /** Mirrored to `data-section-id` for analytics/e2e selectors. */
  sectionId?: string;
  /** Mirrored to `data-option-id` on the collapse button. */
  collapseId?: string;
  /** How the active tab is marked. `underline` (default) is the sliding bar
   *  this component is named for. `segmented` is the same strip with the bar
   *  off and the active tab raised on its own chip — for a row that sits INSIDE
   *  other content (beside a title, say) rather than heading a panel, where an
   *  underline reads as a rule across the page. */
  variant?: "underline" | "segmented";
};

/** Strips the pill/segmented look off `TabsList` so the row can be a bare,
 *  scrollable line. Written as overrides rather than a fork of tabs.tsx: the
 *  base recipe stays the one place the primitive is defined. `relative` is what
 *  the sliding underline positions against — it has to live INSIDE the scroller
 *  so it travels with the triggers when the row overflows. */
const tabsListClassName =
  "relative flex h-auto min-w-0 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Same idea for the trigger: the active state becomes an underline instead of
 *  a raised chip. The border stays transparent in BOTH states — it only reserves
 *  the 2px the sliding indicator draws into, so switching tabs moves one bar
 *  instead of blinking two. */
const tabsTriggerClassName =
  "relative shrink-0 rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** The segmented trigger: no reserved underline band, and the active state is a
 *  chip. Everything else — Radix wiring, roving focus, the scroller — is shared
 *  with the underline recipe above. */
const segmentedTriggerClassName =
  // `bg-muted`, NOT `bg-accent`: this theme's --accent is a green, so the active
  // tab came out as a green chip beside a black page title.
  "relative shrink-0 rounded-lg border-0 px-3 py-1.5 text-[12px] font-medium leading-[18px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** The sliding underline. Its geometry is written to the DOM directly rather
 *  than rendered, so measuring costs no re-render and React never resets it —
 *  which is also why the `data-placed` flag below can be set imperatively.
 *  `motion-safe` (not `motion-reduce:transition-none`) carries the reduced-motion
 *  opt-out: as a guard on the only rule that turns the transition ON, there is no
 *  ordering question between two competing variants. */
const indicatorClassName =
  "pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 rounded-full bg-foreground opacity-0 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:data-[placed=true]:transition-[transform,width]";

/** Measuring has to happen before paint or the underline lands a frame late,
 *  but `useLayoutEffect` warns when React renders this on the server. */
const useMeasureEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Underlined tabs: an optional leading collapse button, a horizontally
 * scrollable tab row, and a right-hand slot on the same line. The active
 * underline is one element that slides and resizes between triggers.
 *
 * Built on the shadcn `Tabs` primitive ([tabs.tsx](../tabs.tsx)), so keyboard
 * nav, roving focus and the ARIA wiring come from Radix — this file only
 * restyles it and adds the two edge slots.
 *
 * Presentational only: no state beyond the underline's measured geometry, no
 * i18n, no feature ids. The caller owns `value`/`onChange` and whatever it hangs
 * in `rightSlot`, which is what keeps the component usable from either zone.
 *
 * Renders no `TabsContent` on purpose — it drives a surface that lives outside
 * the strip (a composer, a canvas), not stacked panels.
 */
export const UnderlineTabs = <TValue extends string>({
  tabs,
  value,
  onChange,
  onCollapse,
  collapseLabel,
  collapseClassName,
  label,
  rightSlot,
  triggerClassName,
  indicatorClassName: indicatorOverride,
  className,
  sectionId,
  collapseId,
  variant = "underline",
}: UnderlineTabsProps<TValue>) => {
  const segmented = variant === "segmented";
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const measure = useCallback(() => {
    const indicator = indicatorRef.current;
    const node = triggerRefs.current.get(value);
    if (!indicator || !node) return;

    // `offsetLeft` is measured against the list, which is the scroll container:
    // an overflowing row then carries the underline along with its triggers for
    // free. `translateX` rather than `left` keeps the travel on the compositor.
    indicator.style.width = `${node.offsetWidth}px`;
    indicator.style.transform = `translateX(${node.offsetLeft}px)`;
    indicator.style.opacity = "1";
  }, [value]);

  // Keyed on the tab VALUES rather than the `tabs` array: callers build that
  // array inline, so depending on its identity would tear down and rebuild the
  // observer on every render. Label text can still change underneath (i18n,
  // late-loading fonts) — the per-trigger observation below catches that.
  const tabsKey = tabs.map((tab) => tab.value).join(" ");

  useMeasureEffect(() => {
    measure();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    if (listRef.current) observer.observe(listRef.current);
    for (const node of triggerRefs.current.values()) observer.observe(node);

    return () => observer.disconnect();
  }, [measure, tabsKey]);

  // The first placement must not animate, or the underline sweeps in from the
  // row's origin on mount. Enabling the transition from a LATER frame is what
  // separates the two: by the time this runs, the initial geometry is painted,
  // so turning the transition on has nothing left to animate.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (indicatorRef.current) indicatorRef.current.dataset.placed = "true";
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as TValue)}
      data-section-id={sectionId}
      className={cn(
        "flex items-center gap-1",
        // No rule under a strip that sits inside other content: the border is
        // what makes an underline strip read as the head of a panel.
        segmented ? "min-w-0" : "border-b border-border",
        className,
      )}
    >
      {onCollapse ? (
        <Button
          type="button"
          data-option-id={collapseId}
          className={cn(
            collapseClassName,
            "mr-1 shrink-0",
          )}
          aria-label={collapseLabel}
          onClick={onCollapse}
          variant="ghost"
          size="icon"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </Button>
      ) : null}

      <TabsList
        ref={listRef}
        aria-label={label}
        className={tabsListClassName}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            ref={(node) => {
              if (node) triggerRefs.current.set(tab.value, node);
              else triggerRefs.current.delete(tab.value);
            }}
            value={tab.value}
            disabled={tab.disabled}
            data-tab-id={tab.value}
            className={cn(
              segmented ? segmentedTriggerClassName : tabsTriggerClassName,
              triggerClassName,
            )}
          >
            {tab.label}
          </TabsTrigger>
        ))}

        {/* Decorative twin of the active trigger's bottom border. Renders zero
            width so it cannot flash at the row's origin before the first
            measurement; `measure` gives it geometry from there on. A child of
            the tablist rather than a sibling because only the tablist scrolls —
            and `aria-hidden` because a tablist may otherwise own only tabs. */}
        {segmented ? null : (
          <span
            ref={indicatorRef}
            aria-hidden="true"
            data-slot="underline-indicator"
            className={cn(indicatorClassName, indicatorOverride)}
          />
        )}
      </TabsList>

      {rightSlot ? <div className="ml-auto pl-2">{rightSlot}</div> : null}
    </Tabs>
  );
};
