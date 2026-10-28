"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the app shell stops being a two-column layout.
 *
 * 768px and below is mobile — inclusive, which is why this is a raw media query
 * and not Tailwind's `md:` (that one flips at 768 and would leave the shell
 * one pixel out of step with the JS that drives the drawer).
 */
export const MOBILE_VIEWPORT_QUERY = "(max-width: 768px)";

const subscribeToViewport = (onChange: () => void) => {
  const media = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const readIsMobile = () => window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;

// The server has no viewport to read, so it renders the desktop shell and the
// first client pass corrects it — the same trade the home masonry makes.
export const useIsMobileViewport = () =>
  useSyncExternalStore(subscribeToViewport, readIsMobile, () => false);
