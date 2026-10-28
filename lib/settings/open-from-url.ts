import type { SettingsTab } from "@/lib/settings/types";

/**
 * Which settings tab a URL asks for, if any.
 *
 * The settings modal had no address: it opened from a click or a window event
 * only. That was invisible until a payment flow needed it -- Stripe's hosted card
 * page sends the customer back to a URL, and with nothing reading the URL they
 * landed on the bare app with no sign their card had been saved.
 *
 * Only a tab this build actually has is honoured. An unknown value opens nothing
 * rather than a default panel, because a link is usually a link to a SPECIFIC
 * thing and the wrong panel is a worse answer than none.
 */

const TABS: readonly SettingsTab[] = [
  "profile",
  "general",
  "billing",
  "sessions",
  "team",
  "permissions",
  "autonomy",
  "publishApprovals",
  "managed-tasks",
  "model-selection",
  "mail",
  "data-control",
  "my-computer",
  "local-folders",
  "cloud-browse",
  "skills",
  "connectors",
  "integrations",
];

export function settingsTabFromSearch(search: string): SettingsTab | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const raw = params.get("settings")?.trim();
  if (!raw) return null;
  return TABS.includes(raw as SettingsTab) ? (raw as SettingsTab) : null;
}

/** What Stripe's redirect says about the checkout: only its two known values count. */
export function billingReturnFromSearch(search: string): "success" | "cancelled" | null {
  try {
    const value = new URLSearchParams(search).get("billing_return");
    return value === "success" || value === "cancelled" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The same search string with the opener removed, for replacing the history
 * entry once the modal is open.
 *
 * Left in place, a refresh or a back-navigation would re-open the modal the
 * customer had just closed. `billing_return` goes with it: it is the marker
 * Stripe's redirect carries, and it has been read by the time this runs.
 */
export function searchWithoutSettingsOpener(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("settings");
  params.delete("billing_return");
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

/**
 * One folder's Log in Settings › Local folders is addressed by two parameters,
 * `folder=<id>&view=log`. The panel reads them once on mount and then removes
 * them, so they only ever describe "open it there", never the current state.
 */
const LOG_FOLDER = "folder";
const LOG_VIEW = "view";
const LOG_VIEW_VALUE = "log";

/** The folder whose Log the URL asks for, or null unless BOTH parameters say so. */
export function folderLogFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get(LOG_FOLDER)?.trim();
  return id && params.get(LOG_VIEW) === LOG_VIEW_VALUE ? id : null;
}

/**
 * `search` with the Log parameters set and everything else kept. Never adds the
 * `settings` opener: opening from inside the app is done by event, and an
 * opener left in the address would reopen Settings on the next refresh.
 */
export function searchWithFolderLog(search: string, folderId: string): string {
  const params = new URLSearchParams(search);
  params.set(LOG_FOLDER, folderId);
  params.set(LOG_VIEW, LOG_VIEW_VALUE);
  return `?${params.toString()}`;
}

/** `search` without the Log parameters, for replacing the history entry once the panel has read them. */
export function searchWithoutFolderLog(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(LOG_FOLDER);
  params.delete(LOG_VIEW);
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

/**
 * The search string that opens Settings › Local folders on one folder's Log
 * from a cold load: `?settings=local-folders&folder=<id>&view=log`.
 */
export function localFolderLogSearch(folderId: string): string {
  return searchWithFolderLog("?settings=local-folders", folderId);
}
