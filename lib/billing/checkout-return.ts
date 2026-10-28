/**
 * What the confirming page needs to know after Stripe sends the browser back.
 *
 * Stripe returns to a FIXED success URL that Core configures once, so the
 * redirect itself cannot say which module was bought. The module is stashed here
 * on the way out and read on the way back.
 *
 * sessionStorage, not a query parameter: a value in the URL is one the customer
 * can edit, and this decides which subscription the page waits for. It is also
 * per-tab and dies with the tab, which is exactly the lifetime of one checkout.
 *
 * Every access is guarded. Private windows, blocked site data and the artifact
 * thumbnailer all make these throw rather than return null, and a billing page
 * that crashes after a successful payment is far worse than one that shows a
 * slightly vaguer confirmation.
 */

const KEY = "cluega.checkout.module";

export function rememberCheckoutModule(moduleCode: string): void {
  try {
    window.sessionStorage.setItem(KEY, moduleCode);
  } catch {
    // Falling back to "confirm any live subscription" is a small loss of
    // precision, not a broken flow.
  }
}

export function readCheckoutModule(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function forgetCheckoutModule(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if the store was never readable.
  }
}
