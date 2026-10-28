/** The Access & Permissions tab's two sub-tabs. */
export type AccessSubTab = "adAccounts" | "companyRoles";

let requested: AccessSubTab | null = null;

/**
 * Asks the Access & Permissions tab to open on a given sub-tab the next time it
 * mounts — the Team Directory's "Change role" lands on Company roles, not on the
 * ad-account panel that is the tab's default.
 *
 * A module value rather than a settings-context field: one caller, one
 * consumer, and the settings route stays a plain tab id.
 */
export function requestAccessSubTab(tab: AccessSubTab): void {
  requested = tab;
}

/** Read without consuming, so a double-invoked initializer reads the same value. */
export function peekRequestedAccessSubTab(): AccessSubTab | null {
  return requested;
}

/** Called once the tab has mounted on the requested sub-tab. */
export function clearRequestedAccessSubTab(): void {
  requested = null;
}
