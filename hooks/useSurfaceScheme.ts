"use client";

import { useEffect, useState } from "react";

export type SurfaceScheme = "light" | "dark";

const DARK_SURFACE_ATTRIBUTE = "data-surface";
const APP_ROUTE_BODY_CLASS = "app-route-body";

/**
 * Which scheme a fixed overlay (the cookie notice, the preference center) should
 * paint itself in — decided by **the page it is standing on**, never by the
 * visitor's saved theme preference on its own.
 *
 * That distinction matters because `html.dark` is set from the theme cookie on
 * every route, but the theme only actually *renders* inside `/app`: the marketing
 * pages and the help centre hard-code light surfaces and carry no `dark:`
 * variants, so a visitor whose product theme is dark still sees a white home
 * page. Keying off `html.dark` alone put a dark panel on a light page.
 *
 * Resolution order:
 *
 * 1. `html[data-surface="dark"]` — a page that is dark by design while the theme
 *    stays light (the `/solutions/*` pages are built from `bg-black` sections).
 *    Set by `<DarkSurface />`. Wins outright.
 * 2. `body.app-route-body` **and** `html.dark` — an `/app` route, where the theme
 *    genuinely applies. `AppRouteBodyClass` adds that class precisely to scope the
 *    app's dark theming so it never leaks onto the public pages, which makes it
 *    the right test for "is the theme live here".
 * 3. Otherwise light — every other public page, whatever the saved theme is.
 *
 * A fixed overlay renders from a layout, outside the page's own DOM subtree, so a
 * CSS descendant selector can never reach it from the page: the page has to
 * announce itself on `<html>`/`<body>` and the overlay has to read it in JS.
 */
export function useSurfaceScheme(): SurfaceScheme {
  const [scheme, setScheme] = useState<SurfaceScheme>(() => readScheme());

  useEffect(() => {
    const sync = () => setScheme(readScheme());

    sync();

    // `html.class` changes when the theme is toggled, `html[data-surface]` when a
    // dark-by-design page mounts or unmounts, and `body.class` when navigating
    // into or out of an `/app` route.
    const observer = new MutationObserver(sync);

    observer.observe(document.documentElement, {
      attributeFilter: ["class", DARK_SURFACE_ATTRIBUTE],
    });
    observer.observe(document.body, { attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return scheme;
}

function readScheme(): SurfaceScheme {
  if (typeof document === "undefined") {
    return "light";
  }

  const root = document.documentElement;

  if (root.getAttribute(DARK_SURFACE_ATTRIBUTE) === "dark") {
    return "dark";
  }

  const isThemeLiveHere = document.body.classList.contains(APP_ROUTE_BODY_CLASS);

  return isThemeLiveHere && root.classList.contains("dark") ? "dark" : "light";
}
