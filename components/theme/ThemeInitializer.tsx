"use client";

import { useEffect } from "react";

import { useThemeStore } from "@/lib/stores/useThemeStore";

export function ThemeInitializer() {
  const initTheme = useThemeStore((state) => state.init);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return null;
}
