"use client";

import { createContext, useContext } from "react";

export interface MobileSidebarState {
  /** True at 768px and below, where the rail floats instead of taking a column. */
  isMobile: boolean;
  isOpen: boolean;
  close: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarState>({
  isMobile: false,
  isOpen: false,
  close: () => {},
});

export const MobileSidebarProvider = MobileSidebarContext.Provider;

/**
 * Read by the two sidebars so their own collapse key can close the drawer
 * instead of narrowing a rail that is already floating over the page.
 */
export const useMobileSidebar = () => useContext(MobileSidebarContext);
