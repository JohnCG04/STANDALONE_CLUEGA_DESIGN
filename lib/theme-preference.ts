/**
 * Pure theme-preference helpers, safe to import from server components and the
 * edge proxy (no `window`/`document` access).
 *
 * Contract: localStorage keeps the user's CHOICE (`light` | `dark` | `system`),
 * while the theme cookie carries the RESOLVED color (`light` | `dark`) — the
 * server cannot evaluate `prefers-color-scheme`, so `system` in the cookie is
 * useless to SSR. Legacy cookies written before this split may still hold
 * `system`; `resolveThemeCookieClass` treats them as "unknown" and the
 * ThemeScript resolves them on the client before first paint.
 */

export type ThemeMode = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

/**
 * What a visitor who has never chosen gets.
 *
 * `system` was the old answer and it is still one of the three the settings
 * offer — but it is the wrong DEFAULT here: the product's designed surfaces are
 * the light ones, and on a machine set to dark a first visit opened an app
 * nobody had asked to be dark.
 *
 * Declared in this module because it is the one both the pre-paint script and
 * the store can import, and those two disagreeing IS the flash-of-wrong-theme
 * bug this file exists to prevent — the script paints one answer before paint
 * and `init()` overwrites it after hydration.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "light";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

/** Class the server puts on `<html>` from the theme cookie, if it can. */
export function resolveThemeCookieClass(
  value: string | undefined | null,
): ResolvedTheme | undefined {
  return isResolvedTheme(value) ? value : undefined;
}
