/**
 * The rail's folded/unfolded state, remembered per device (LIB-015).
 *
 * Its own module so the reader and the writer sit next to the key they share,
 * and so a test can exercise them without mounting the sidebar.
 *
 * Every access is guarded: `localStorage` throws in a private window, when site
 * data is blocked, and when the quota is full. A sidebar that refuses to render
 * because it could not read a preference would be a far worse bug than one that
 * opens expanded.
 */

export const SIDEBAR_COLLAPSED_KEY = "sidebar.collapsed.v1";

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    // "0" rather than removing the key: an explicit "I expanded it" is a
    // different fact from "never chose", and only the former should survive a
    // future default that starts collapsed.
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Nothing to do and nothing to say: the preference is a convenience.
  }
}
