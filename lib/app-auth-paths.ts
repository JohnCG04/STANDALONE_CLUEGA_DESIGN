import { envOrDefault } from "@/lib/env";

/** The signed-in surfaces: the Flow workspace, the workflow editor and the policy page. */
export const APP_PRIVATE_PATHS = ["/flow", "/workflow", "/policy"] as const;

/** Where a sign-in lands when it was not sent from a page. */
export const APP_HOME_PATH = "/flow";

// Blank-aware: an empty build arg would otherwise make this "", and `new URL()`
// with an empty base throws for every relative return path.
const APP_RETURN_URL_PARSE_BASE = envOrDefault(
  process.env.NEXT_PUBLIC_SITE_URL,
  "http://localhost",
);

export function isAppPrivatePath(pathname: string): boolean {
  return APP_PRIVATE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function getSafeAppReturnPath(value: string | null): string | null {
  if (!value || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, APP_RETURN_URL_PARSE_BASE);
    const pathWithSearch = `${url.pathname}${url.search}`;
    return isAppPrivatePath(url.pathname) ? pathWithSearch : null;
  } catch {
    return isAppPrivatePath(value) ? value : null;
  }
}
