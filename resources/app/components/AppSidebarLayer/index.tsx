"use client";

import type { ReactNode } from "react";
import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHasInlineExpandKey } from "@/resources/app/components/Sidebar/collapseContext";

/**
 * The sidebar's slot in the app shell.
 *
 * On desktop it is `display: contents` — no box at all, so the rail stays a
 * flex sibling of <main> and keeps taking a column of its own.
 *
 * At 768px and below that column would be most of the screen, so the slot turns
 * into a fixed layer: the rail slides in OVER the page (backdrop behind it,
 * content untouched underneath) instead of pushing it off to the right. The
 * wrapper is rendered in both modes rather than swapped for a fragment, so
 * crossing the breakpoint re-styles the rail rather than remounting it — its
 * open sections, scroll position and drag width all survive a rotation.
 */
export const AppSidebarLayer = ({
  isMobile,
  isOpen,
  openLabel,
  onOpen,
  onClose,
  children,
}: {
  isMobile: boolean;
  isOpen: boolean;
  openLabel: string;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) => {
  const isDrawerClosed = isMobile && !isOpen;
  // A header that draws the key itself claims it here, and this one steps back
  // — otherwise the floating key sits ON TOP of that header, over whatever mark
  // it leads with. Same mechanism the collapsed rail already uses on desktop.
  const headerHasKey = useHasInlineExpandKey();

  return (
    <>
      {isMobile && isOpen ? (
        <div
          role="presentation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-neutral-950/40"
        />
      ) : null}

      <div
        // The rail's own width rules key off this rather than a bare media
        // query: the drawer is only the Flow workspace's layout (the app page
        // decides), so a narrow viewport elsewhere must leave the column alone.
        data-sidebar-layer={isMobile ? "drawer" : "column"}
        className={cn(
          isMobile
            ? "fixed inset-y-0 left-0 z-50 flex transition-transform duration-200 ease-out"
            : "contents",
          isDrawerClosed && "-translate-x-full",
        )}
        // Off-screen is not the same as gone: without this the closed drawer
        // keeps every row in the tab order and in the screen reader's tree.
        inert={isDrawerClosed}
      >
        {children}
      </div>

      {isDrawerClosed && !headerHasKey ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          aria-expanded={false}
          // Deliberately the same box as SidebarExpandKey — on a phone this is
          // the only way back to the rail, so it reads as the one control that
          // opens it whichever sidebar the view is showing.
          // No border and no shadow: it was a white chip with a hairline AND a
          // drop shadow, and a white chip on a white page reads as an outline
          // whichever of the two is drawing it. It rests on the #F4F4F5 ground
          // instead, as SidebarExpandKey and the agent column's key do
          // (2026-09-25; it rested bare before).
          className="panel-toggle-key panel-toggle-key-filled fixed left-3 top-3 z-40"
        >
          {/* Divider on the LEFT, like every other instance of this key: it
              opens the panel on the left, and the toggle redline asks each
              glyph to mirror the side its control opens. It was `rotate-180`,
              which is the panel-RIGHT glyph. */}
          <PanelLeft className="size-[15px]" strokeWidth={1.75} />
        </button>
      ) : null}
    </>
  );
};

export { MobileSidebarProvider, useMobileSidebar } from "./context";
export type { MobileSidebarState } from "./context";
