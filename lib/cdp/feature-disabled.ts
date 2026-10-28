// Per-tenant feature switches: cdp_backend answers 403 with error code
// "feature_disabled" when the tenant's feature was switched off by staff. Every
// fetch wrapper raises this one window event, and the app's features store
// reloads on it, so menus follow the change on the user's next action.

export const FEATURE_DISABLED_EVENT = "cluega:feature-disabled";

export function isFeatureDisabledBody(body: unknown): boolean {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "feature_disabled";
}

export function announceFeatureDisabled(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FEATURE_DISABLED_EVENT));
}

/** Checks a raw Response without consuming it: the caller still reads the body. */
export function notifyIfFeatureDisabled(res: Response): void {
  if (res.status !== 403) return;
  void res
    .clone()
    .json()
    .then((body) => {
      if (isFeatureDisabledBody(body)) announceFeatureDisabled();
    })
    .catch(() => {});
}
