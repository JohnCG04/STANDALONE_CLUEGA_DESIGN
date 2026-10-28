import { create } from "zustand";

import {
  COOKIE_CONSENT_CHANGE_EVENT,
  hasFunctionalityConsent,
  THEME_COOKIE_KEY,
} from "@/lib/cookie-consent";
import {
  DEFAULT_THEME_MODE,
  isThemeMode,
  type ThemeMode,
} from "@/lib/theme-preference";

export type { ThemeMode };

const STORAGE_KEY = THEME_COOKIE_KEY;

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyDarkClass(isDark: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light", !isDark);
}

/**
 * Remembering the theme is a "Functionality" cookie under the Cookie Policy, so
 * it needs consent. Declined means the chosen theme still applies for this visit
 * (`applyDarkClass` runs either way) but is not carried to the next one.
 *
 * localStorage keeps the user's choice (may be `system`); the cookie carries the
 * RESOLVED color only, because the server reads it to class `<html>` on first
 * paint and cannot evaluate `prefers-color-scheme` itself.
 */
function persistThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  if (!hasFunctionalityConsent()) return;

  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures from private browsing or disabled storage.
  }

  const resolved = resolveIsDark(mode) ? "dark" : "light";
  document.cookie = `${STORAGE_KEY}=${resolved}; path=/; max-age=31536000; SameSite=Lax`;
}

function readStoredThemeMode(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // Ignore storage failures from private browsing or disabled storage.
  }

  return null;
}

/**
 * Fallback when localStorage is empty but the cookie survived: adopting the
 * cookie's resolved color (or a legacy `system` value) keeps the client on the
 * theme the server just painted, instead of stripping the class after
 * hydration — a visible theme flip.
 */
function readCookieThemeMode(): ThemeMode | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]*)`),
  );
  const value = match?.[1];

  return isThemeMode(value) ? value : null;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemPrefersDark();
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  init: () => void;
}

let mediaListenerAttached = false;

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Pre-hydration value, and the one the settings picker highlights until
  // `init()` has read storage — so it has to be the same default `init()` falls
  // back to, or the picker briefly marks a mode nobody is on.
  mode: DEFAULT_THEME_MODE,
  setMode: (mode) => {
    persistThemeMode(mode);
    applyDarkClass(resolveIsDark(mode));
    set({ mode });
  },
  init: () => {
    if (typeof window === "undefined") return;
    const stored = readStoredThemeMode() ?? readCookieThemeMode();
    const mode: ThemeMode = stored ?? DEFAULT_THEME_MODE;
    applyDarkClass(resolveIsDark(mode));
    set({ mode });

    // Re-persist only what was already stored: heals localStorage/cookie drift
    // and migrates legacy `system` cookies to the resolved format, without ever
    // writing a preference the visitor never expressed.
    if (stored) {
      persistThemeMode(mode);
    }

    if (!mediaListenerAttached) {
      mediaListenerAttached = true;
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", () => {
        if (get().mode === "system") {
          applyDarkClass(systemPrefersDark());
          persistThemeMode("system");
        }
      });

      // Consent granted after the theme was chosen: persist what is in effect now.
      window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, () => {
        persistThemeMode(get().mode);
      });
    }
  },
}));
