/**
 * One resolution for the cdp_backend origin, shared by every server-side proxy.
 *
 * Two proxies pointing at the same backend must never disagree. They did: the
 * /api/v1 proxy carried this fallback chain inline while the Rakazo proxy
 * required CDP_BACKEND_URL outright, so when the variable did not reach the
 * runtime the first silently used the default and the second returned 503. The
 * discrepancy, not the missing variable, is what made it hard to see.
 *
 * The environment always wins. It was once commented out in favour of a fixed
 * staging host (d994d555e), and every local checkout then sent its chat to
 * staging while the local AI sat idle — a whole QC round (TT-G-26 L10) measured
 * code that was not on the machine and filed it as a regression. Staging is the
 * fallback only for a runtime that names no backend at all.
 */
export const FALLBACK_CDP_BACKEND_URL = "https://cdp-stg-core-api.cluega.com";

let warnedAboutFallback = false;

export function resolveCdpBackendUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const configured =
    // `||`, not `??`: TT-G-43 independently fixed this same incident with `??`,
    // which keeps an explicitly-set-but-EMPTY `CDP_BACKEND_URL=""` as the
    // resolved origin — `resolveCdpBackendUrl` then returns `""`, a request to
    // no origin at all. `backend-url.test.ts`'s "an empty variable is not a
    // backend" case is what this choice is pinned against.
    env.CDP_BACKEND_URL ||
    env.NEXT_PUBLIC_CDP_API_URL;
  // Dev only, so production is unchanged. A silent fallback is what hid this
  // locally (QA M1, 2026-10-10): `next dev` runs in apps/app and reads only
  // apps/app/.env*, so a backend set in the monorepo root's .env never arrives.
  if (!configured && env.NODE_ENV === "development" && !warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      `[cdp-backend] Neither CDP_BACKEND_URL nor NEXT_PUBLIC_CDP_API_URL is set, so every CDP call goes to staging (${FALLBACK_CDP_BACKEND_URL}). ` +
        "Set CDP_BACKEND_URL in .env.local (see .env.example) and restart the dev server.",
    );
  }
  return (configured || FALLBACK_CDP_BACKEND_URL).replace(/\/+$/, "");
}
