import { notifyAssetLibraryChanged } from "@/lib/assets/assetLibraryChannel";
import { ATTEMPT_DELAYS_MS } from "./constants";

/** One schedule at a time: several nodes landing together share these reads. */
let pending = false;

/** A generation landed: nudge every asset-library reader; nothing else fires for AI output. */
export function notifyGeneratedAssets(): void {
  if (typeof window === "undefined" || pending) return;
  pending = true;

  let left = ATTEMPT_DELAYS_MS.length;
  for (const delay of ATTEMPT_DELAYS_MS) {
    window.setTimeout(() => {
      // Listener re-reads are idempotent: an extra attempt costs a query, a missed one the asset.
      notifyAssetLibraryChanged("asset.generated");
      left -= 1;
      if (left === 0) pending = false;
    }, delay);
  }
}
