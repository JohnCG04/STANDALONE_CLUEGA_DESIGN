"use client";

import { useEffect, useState } from "react";

/**
 * The "Copied" tick that returns to "Copy" on its own.
 *
 * Nine components wrote this by hand and four of them leaked: the reset timer
 * outlives a component that unmounts inside the window — a transcript row as
 * messages stream in, a dialog closed right after a copy — and sets state on a
 * dead tree. Keying the effect on the flag makes the cleanup the unmount path
 * too, so there is no timer id to remember.
 */
export function useCopiedFlag(resetMs = 1500): [boolean, () => void] {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), resetMs);
    return () => window.clearTimeout(timer);
  }, [copied, resetMs]);

  return [copied, () => setCopied(true)];
}
