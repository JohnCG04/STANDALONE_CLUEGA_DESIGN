"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useTranslate } from "@/hooks/useTranslate";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import {
  AppSidebarLayer,
  MobileSidebarProvider,
} from "@/resources/app/components/AppSidebarLayer";
import { FlowSidebar } from "@/resources/app/components/FlowSidebar";
import { SidebarCollapseProvider } from "@/resources/app/components/Sidebar/collapseContext";
import { ViewErrorBoundary } from "@/resources/app/pages/app/ViewErrorBoundary";

/**
 * The Design workspace frame: the Flow sidebar beside the page.
 *
 * The Flow branch of the product app's shell, without the rest of it. On phones the
 * rail floats as a drawer; it remembers the route it was opened on, so the drawer
 * closes as soon as one of its rows navigates away.
 */
export function DesignShell({ children }: { children: ReactNode }) {
  const { t } = useTranslate();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isDrawerLayout = useIsMobileViewport();
  const searchQuery = searchParams?.toString() ?? "";
  const routeKey = searchQuery ? `${pathname}?${searchQuery}` : pathname;
  const [mobileSidebarRoute, setMobileSidebarRoute] = useState<string | null>(null);
  const isMobileSidebarOpen = isDrawerLayout && mobileSidebarRoute === routeKey;
  const closeMobileSidebar = useCallback(() => setMobileSidebarRoute(null), []);
  // Null unless there is a shut drawer to open: that tells a page header it has no key to draw.
  const openMobileSidebar = useMemo(
    () =>
      isDrawerLayout && !isMobileSidebarOpen
        ? () => setMobileSidebarRoute(routeKey)
        : null,
    [isDrawerLayout, isMobileSidebarOpen, routeKey],
  );
  const mobileSidebar = useMemo(
    () => ({
      isMobile: isDrawerLayout,
      isOpen: isMobileSidebarOpen,
      close: closeMobileSidebar,
    }),
    [isDrawerLayout, isMobileSidebarOpen, closeMobileSidebar],
  );

  return (
    <SidebarCollapseProvider isMobile={isDrawerLayout} openDrawer={openMobileSidebar}>
      <div className="app-shell">
        <div className="app-layout">
          <MobileSidebarProvider value={mobileSidebar}>
            <AppSidebarLayer
              isMobile={isDrawerLayout}
              isOpen={isMobileSidebarOpen}
              openLabel={t("appChat.flow.sidebar.expandSidebar")}
              onOpen={() => setMobileSidebarRoute(routeKey)}
              onClose={closeMobileSidebar}
            >
              <FlowSidebar />
            </AppSidebarLayer>
          </MobileSidebarProvider>

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col font-semibold">
            <ViewErrorBoundary key={pathname} viewName="flow">
              {children}
            </ViewErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarCollapseProvider>
  );
}
