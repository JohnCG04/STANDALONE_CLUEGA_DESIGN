/**
 * The delivery mode a person asked Create Plan to remember (AI01-028).
 *
 * The "Confirm delivery mode" modal offers "Remember my choice for this
 * platform". With it ticked, the next click on that platform's card skips the
 * modal and goes straight to the chosen mode. One value per platform, kept in
 * this browser's `localStorage`, so Meta's choice never touches TikTok's.
 *
 * Only the two modes the modal can send somewhere are remembered: "manual"
 * (Cluega AI Manual Setup) and "mcp" (MCP Delivery). DogClaw is not one of
 * them. Anything else found in storage reads as "nothing remembered".
 *
 * Same shape as the sidebar's own preference (sidebarCollapse.ts): every access
 * is guarded, because `localStorage` throws in a private window, with blocked
 * site data and on a full quota, and there is no `window` while rendering on the
 * server. A card that fails to open over a preference would be far worse than a
 * modal that asks again.
 */

export type DeliveryModePlatform = "meta" | "google" | "tiktok";
export type RememberedDeliveryMode = "manual" | "mcp";

const PLATFORMS: readonly DeliveryModePlatform[] = ["meta", "google", "tiktok"];

export function deliveryModeStorageKey(platform: DeliveryModePlatform): string {
  return `cluega.createAdPlan.deliveryMode.${platform}`;
}

/** The storage, or null when there is none to use. Never throws. */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

export function getDeliveryMode(platform: DeliveryModePlatform): RememberedDeliveryMode | null {
  try {
    const value = storage()?.getItem(deliveryModeStorageKey(platform));
    return value === "manual" || value === "mcp" ? value : null;
  } catch {
    return null;
  }
}

export function setDeliveryMode(platform: DeliveryModePlatform, mode: RememberedDeliveryMode): void {
  try {
    storage()?.setItem(deliveryModeStorageKey(platform), mode);
  } catch {
    // The preference is a convenience; losing it is not worth a message.
  }
}

export function clearDeliveryMode(platform: DeliveryModePlatform): void {
  try {
    storage()?.removeItem(deliveryModeStorageKey(platform));
  } catch {
    // Nothing to forget, or nowhere to forget it from.
  }
}

/** Whether any platform has a remembered mode: what Settings' reset acts on. */
export function hasAnyDeliveryMode(): boolean {
  return PLATFORMS.some((platform) => getDeliveryMode(platform) !== null);
}

/** Forget every platform's mode, and only those keys. */
export function clearAll(): void {
  for (const platform of PLATFORMS) clearDeliveryMode(platform);
}
