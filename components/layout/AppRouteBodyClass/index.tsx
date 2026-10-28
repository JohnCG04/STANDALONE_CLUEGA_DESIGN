"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Toggles the `app-route-body` class on <body> while an `/app/*` route is
 * mounted. The class scopes the app-only theming (dark mode, sidebar, shell)
 * defined in globals.css so it never leaks onto the public marketing pages,
 * which share the same root-layout <body>.
 *
 * The full-page onboarding/personalize wizards are excluded on purpose — they
 * render without the app shell and never carried this class before.
 */
const EXCLUDED_ROUTES = ["/app/onboarding", "/app/personalize"];

export function AppRouteBodyClass() {
  const pathname = usePathname();
  const enabled = !EXCLUDED_ROUTES.includes(pathname);

  useEffect(() => {
    if (!enabled) return;

    document.body.classList.add("app-route-body");

    return () => {
      document.body.classList.remove("app-route-body");
    };
  }, [enabled]);

  return null;
}
