"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Stop a dirty editor being abandoned by accident. Two exits are covered:
 * `beforeunload` for a reload or a closed tab (the browser ignores custom
 * text), and the page's own Back through `requestLeave`.
 *
 * The SIDEBAR is NOT covered, and cannot be: Next's App Router has no
 * `router.events`, so a page cannot intercept a navigation someone else
 * starts. Said plainly rather than left looking handled.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Assigning returnValue is what still triggers the prompt in Chromium.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const requestLeave = useCallback(
    (href: string) => {
      if (!isDirty) {
        router.push(href);
        return;
      }
      setPendingHref(href);
    },
    [isDirty, router],
  );

  const confirmLeave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  }, [pendingHref, router]);

  return {
    requestLeave,
    confirmOpen: pendingHref !== null,
    confirmLeave,
    cancelLeave: () => setPendingHref(null),
  };
}
