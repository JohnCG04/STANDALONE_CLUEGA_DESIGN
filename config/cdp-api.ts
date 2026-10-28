import { envOrDefault } from "@/lib/env";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const cdpApiConfig = {
  enabled: true,
  get baseUrl(): string {
    return resolveCdpBaseUrl();
  },
  artifactPublicBaseUrl: trimTrailingSlash(
    process.env.NEXT_PUBLIC_ARTIFACT_PUBLIC_BASE_URL ?? "",
  ),
  /**
   * Origin of the product zone, for links that must land a SIGNED-IN user in
   * the app — currently the "sign in to view" step of a team-scoped report
   * share.
   *
   * Empty means "same origin", which is right whenever the page is served from
   * a host that rewrites /app/* to the product zone (the landing app does, in
   * dev and prod alike). Set it when the two are on DIFFERENT hosts —
   * share.cluega.com vs cluega.com — because the session lives in localStorage,
   * which is origin-scoped: a relative link would drop the reader on a host
   * where they are not logged in and make them sign in a second time.
   */
  appPublicBaseUrl: trimTrailingSlash(
    process.env.NEXT_PUBLIC_APP_PUBLIC_BASE_URL ?? "",
  ),
  loginPath: "/api/v1/auth/login",
  refreshPath: "/api/v1/auth/refresh",
  inviteSetupPath: "/api/v1/auth/invite/setup",
  inviteStatusPath: "/api/v1/auth/invite/status",
  activePoliciesPath: "/api/v1/active-policies",
};

function resolveCdpBackendUrl(): string {
  return trimTrailingSlash(
    envOrDefault(
      process.env.CDP_BACKEND_URL,
      process.env.NEXT_PUBLIC_CDP_API_URL,
      "http://localhost:8080",
    ),
  );
}

function resolveCdpBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return resolveCdpBackendUrl();
}

export function getCdpBackendUrl(): string {
  return resolveCdpBackendUrl();
}

export function cdpApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") {
    return `${resolveCdpBackendUrl()}${normalized}`;
  }
  return normalized;
}

export function getCdpClientOrigin(): string {
  if (typeof window === "undefined") {
    return resolveCdpBackendUrl();
  }
  return window.location.origin;
}

export function normalizeCdpClientUrl(input: string): string {
  if (typeof window === "undefined") return input;
  try {
    const parsed = input.startsWith("/")
      ? new URL(input, window.location.origin)
      : new URL(input);
    if (parsed.pathname.startsWith("/api/v1/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return input;
  } catch {
    return input;
  }
}

export function isCrossOriginClientUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  if (url.startsWith("/")) return false;
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}
