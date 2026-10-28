"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getCdpAccessToken, getCdpDisplayName, getCdpEmail } from "@/lib/cdp/session";
import {
  getCurrentPlatformProfile,
  PLATFORM_PROFILE_QUERY_KEY,
  type PlatformTenant,
} from "@/lib/platform/profile";

export interface CurrentUser {
  displayName: string;
  email: string;
  initials: string;
  /**
   * Null until the platform profile arrives, and for the login-seeded values —
   * localStorage holds an email and a name, never a workspace. Callers must
   * render nothing rather than a placeholder, or the panel will flash a fake
   * workspace on every mount.
   */
  tenant: PlatformTenant | null;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || "U").toUpperCase();
}

const EMPTY: CurrentUser = { displayName: "", email: "", initials: "U", tenant: null };

function toCurrentUser(
  displayName: string,
  email: string,
  tenant: PlatformTenant | null = null,
): CurrentUser {
  return {
    displayName,
    email,
    initials: displayName ? deriveInitials(displayName) : "U",
    tenant,
  };
}

/**
 * Returns the signed-in user's identity.
 *
 * Two sources, in order: the values stored at login (localStorage) render
 * immediately and SSR-safely, then the platform profile replaces them once it
 * arrives. The localStorage read stays in an effect rather than an initializer so
 * the server and the first client render agree.
 *
 * The profile itself is cached rather than refetched per mount. A display name is
 * not realtime data, and this hook is mounted by several surfaces (settings
 * sidebar, profile tab, workflow editor, flow page) — each of which used to cost
 * its own request. Anything that changes the profile must invalidate
 * PLATFORM_PROFILE_QUERY_KEY, which is why the key lives beside the fetcher.
 */
export function useCurrentUser(): CurrentUser {
  const [stored, setStored] = useState<CurrentUser>(EMPTY);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const email = (getCdpEmail() ?? "").trim();
    const name = (getCdpDisplayName() ?? "").trim() || email.split("@")[0] || "";
    setStored(toCurrentUser(name, email));
    setHasToken(Boolean(getCdpAccessToken()));
  }, []);

  const { data: profile } = useQuery({
    queryKey: PLATFORM_PROFILE_QUERY_KEY,
    queryFn: getCurrentPlatformProfile,
    // Only ask once the login token is known to exist — an anonymous call would
    // 401 and, with retries, do so more than once.
    enabled: hasToken,
    // Generous on purpose: a name or email changes about as often as never, and
    // the update path invalidates this key explicitly.
    staleTime: 5 * 60_000,
    // A failed profile call must not blank the header: the caller falls back to
    // the login-seeded values below, matching the previous silent `.catch`.
    retry: false,
  });

  if (!profile) return stored;
  return toCurrentUser(profile.displayName, profile.email, profile.tenant);
}
