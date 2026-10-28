"use client";

import { createContext, useContext } from "react";

/**
 * The element a Flow page actually scrolls: `FlowPageShell`'s `<main>`, never
 * the window (`.app-shell` is `h-dvh overflow-hidden`). It sits above every
 * page's tree, hence context rather than a prop. `null` on a page's first
 * render — "not yet", not "never"; it settles before paint.
 */
export const FlowScrollContext = createContext<HTMLElement | null>(null);

export const useFlowScrollElement = () => useContext(FlowScrollContext);
