"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { LearnStateProvider, useLearn } from "./LearnContext";

// Both surfaces already bail out internally (`if (!tour) return null`), but a
// rendered `dynamic()` still fetches its chunk — and LearnTour's chunk carries
// react-joyride. Mounting them only once their state exists is what actually keeps
// those bytes off a first load where nobody opens Learn.
const LearnDrawer = dynamic(() => import("./LearnDrawer").then((m) => m.LearnDrawer), {
  ssr: false,
});
const LearnTour = dynamic(() => import("./LearnTour").then((m) => m.LearnTour), {
  ssr: false,
});

function LearnSurfaces() {
  const { drawerGuideId, tour } = useLearn();

  return (
    <>
      {drawerGuideId ? <LearnDrawer /> : null}
      {tour ? <LearnTour /> : null}
    </>
  );
}

/**
 * LearnProvider mounts the Learn guide system once for the whole /app tree:
 * the shared state (per-user progress, drawer, tour) plus the drawer panel and
 * the spotlight tour overlay. Individual pages only render a <LearnButton
 * guideId="..."> in their header — everything else lives here.
 */
export function LearnProvider({ children }: { children: ReactNode }) {
  return (
    <LearnStateProvider>
      {children}
      <LearnSurfaces />
    </LearnStateProvider>
  );
}
