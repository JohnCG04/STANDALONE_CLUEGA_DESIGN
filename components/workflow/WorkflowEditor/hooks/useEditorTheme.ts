"use client";

import { useEffect, useState } from "react";
import type { WorkflowTheme } from "@dogclaw-ad/workflow";

import { useThemeStore } from "@/lib/stores/useThemeStore";

/** The editor's `theme` from the app's theme store; `system` follows the OS preference live. */
export function useEditorTheme(): WorkflowTheme {
  const mode = useThemeStore((s) => s.mode);
  const initTheme = useThemeStore((s) => s.init);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    initTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [initTheme]);

  return mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";
}
