"use client";

/**
 * "Something in the asset library changed" — one signal, any number of readers.
 *
 * WHY THIS EXISTS: the Database tab (`resources/app/pages/app/artifacts`) used to
 * be the only screen that learned about its own writes. It refreshes by calling
 * `reload()` on the hook instances mounted inside `KnowledgeBasePage`, so every
 * OTHER reader of the same data — the ⌘K palette's "files" section, the
 * composer's `@` knowledge-base menu, the Scripts/Products lists embedded in that
 * very tab — kept rendering whatever it had fetched until the browser page was
 * reloaded. The app-wide QueryClient sets `staleTime: Infinity` and disables
 * refetch on focus and reconnect (see components/providers/QueryProvider.tsx), so
 * there is no safety net underneath: without an explicit signal, stale is
 * permanent.
 *
 * WHY THE DATA LAYER EMITS IT: the alternative was a `notify` next to each of the
 * ~29 `reload()` calls in the tab. One missed call site, or one new screen that
 * writes an asset, silently reintroduces the bug. Emitting from the client
 * functions that perform the mutation means the signal cannot be forgotten —
 * every caller, present and future, gets it for free.
 *
 * WHY BOTH TRANSPORTS: the `window` event reaches listeners in this tab, and
 * BroadcastChannel reaches the app's other tabs (it deliberately does NOT echo to
 * the posting context, so nothing fires twice). Modelled on
 * lib/lead-form/tipPageIdChannel.ts, which uses the same pair for the same
 * reason.
 *
 * The mutating screen should NOT subscribe: it already reloads itself, and
 * listening as well would fetch every list twice per write.
 */

export const ASSET_LIBRARY_CHANGED_EVENT = "cluega:asset-library:changed";
export const ASSET_LIBRARY_CHANNEL = "cluega-asset-library";

/**
 * Why the library changed, as a free-form token (`"asset.deleted"`,
 * `"folder.shared"`, …).
 *
 * Deliberately `string` and not a union: adding a mutation must not mean editing
 * a type here. Readers that want everything ignore it; a reader that would
 * otherwise refetch on writes it does not care about narrows with the predicates
 * below rather than matching literals of its own.
 */
export interface AssetLibraryChange {
  reason: string;
  at: number;
}

/**
 * Reason prefixes, in one place so no reader duplicates the literals and adding
 * a family is a single edit.
 */
export const ASSET_LIBRARY_REASON = {
  asset: "asset.",
  folder: "folder.",
  trash: "trash.",
  library: "library.",
} as const;

/**
 * True for changes that can move rows in a list which shares the asset library's
 * FOLDERS or its recycle bin without owning the write — the Scripts and Products
 * lists embedded in the Database tab.
 *
 * Deleting a folder detaches the scripts inside it, the shared bin restores
 * scripts and products, and the library settings decide what is listed at all —
 * none of which goes through those pages. A write to an asset alone cannot touch
 * them, so those are filtered out rather than costing a refetch each.
 */
export function affectsFolderScopedLists(change: AssetLibraryChange): boolean {
  return !change.reason.startsWith(ASSET_LIBRARY_REASON.asset);
}

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "function"
    ? new BroadcastChannel(ASSET_LIBRARY_CHANNEL)
    : null;
}

/** `null` unless `raw` is one of our messages. */
function decode(raw: unknown): AssetLibraryChange | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Partial<AssetLibraryChange>;
  if (typeof message.reason !== "string") return null;
  return { reason: message.reason, at: typeof message.at === "number" ? message.at : 0 };
}

/**
 * Announce a write. Safe to call from anywhere, including a server render (where
 * it is a no-op) and a tab whose browser has no BroadcastChannel.
 */
export function notifyAssetLibraryChanged(reason: string): void {
  if (typeof window === "undefined") return;

  const message: AssetLibraryChange = { reason, at: Date.now() };
  window.dispatchEvent(
    new CustomEvent<AssetLibraryChange>(ASSET_LIBRARY_CHANGED_EVENT, { detail: message }),
  );

  const channel = openChannel();
  try {
    channel?.postMessage(message);
  } catch {
    // A structured-clone or quota failure must never break the mutation that
    // just succeeded. The same-tab event above has already been delivered.
  } finally {
    channel?.close();
  }
}

/**
 * Listen on both transports. Returns the unsubscribe function.
 *
 * The callback may fire more than once for a single user action — a bulk delete
 * reports one change, but a move that also refreshes folders reports two — so
 * readers must be idempotent (re-reading a list always is).
 */
export function subscribeAssetLibraryChanged(
  onChange: (change: AssetLibraryChange) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onEvent = (event: Event) => {
    const change = decode((event as CustomEvent<AssetLibraryChange>).detail);
    if (change) onChange(change);
  };
  const onMessage = (event: MessageEvent) => {
    const change = decode(event.data);
    if (change) onChange(change);
  };

  const channel = openChannel();
  window.addEventListener(ASSET_LIBRARY_CHANGED_EVENT, onEvent);
  channel?.addEventListener("message", onMessage);

  return () => {
    window.removeEventListener(ASSET_LIBRARY_CHANGED_EVENT, onEvent);
    channel?.removeEventListener("message", onMessage);
    channel?.close();
  };
}
