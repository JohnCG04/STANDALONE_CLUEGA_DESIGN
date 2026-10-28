"use client";

import { useEffect, useState } from "react";

import { VIEW_MODE_STORAGE_KEY } from "../constants";
import { isViewMode } from "../helpers";
import type { ViewMode } from "../types";

/**
 * The grid/list preference, persisted per browser.
 *
 * The stored value is read AFTER mount, not in the initializer: localStorage is
 * unreadable during the server render, so seeding from it would make the first
 * client render disagree with the SSR markup. Blocked storage (private mode)
 * degrades to the default rather than breaking the toggle.
 */
export function useProjectViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (isViewMode(stored)) setViewMode(stored);
    } catch {
      // Private mode / blocked storage: keep the default.
    }
  }, []);

  const pickViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // The preference is a convenience; losing it must not break the toggle.
    }
  };

  return [viewMode, pickViewMode];
}
