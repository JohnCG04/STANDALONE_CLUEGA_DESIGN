import { hasCdpSupportSession } from "./support-session";

export function redirectToLogin(from?: string): void {
  if (typeof window === "undefined" || hasCdpSupportSession()) return;
  const target = from ?? window.location.pathname + window.location.search;
  window.location.href = `/login?from=${encodeURIComponent(target)}`;
}
