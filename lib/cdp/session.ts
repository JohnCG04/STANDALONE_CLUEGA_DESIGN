"use client";

import { cdpApiConfig, cdpApiUrl } from "@/config/cdp-api";

// SINGLE SOURCE OF TRUTH for the CDP session tokens.
//
// Previously two independent stores existed — sessionStorage ("cdp_access_token")
// used by lib/cdp/fetch.ts, and localStorage ("cdp_token") used by the chat /
// ai-agent layer. Both were seeded at login with the SAME refresh token and both
// refreshed independently. Because the backend rotates refresh tokens (the old one
// is revoked the instant it is used), whichever store refreshed second sent an
// already-revoked token, got "invalid refresh token", and kicked the user to
// /login — the ~15-minute logout bug.
//
// Everything now reads and writes ONE place: localStorage, keys "cdp_token" +
// "cdp_refresh_token" (the keys the chat layer and login already use, so the many
// raw localStorage.getItem("cdp_token") readers keep working untouched).
const ACCESS_KEY = "cdp_token";
const REFRESH_KEY = "cdp_refresh_token";
const EMAIL_KEY = "cdp_email";
const DISPLAY_NAME_KEY = "cdp_display_name";

// Legacy sessionStorage keys from the old System A store. Cleared on logout so no
// stale token lingers after this consolidation ships.
const LEGACY_SESSION_ACCESS_KEY = "cdp_access_token";
const LEGACY_SESSION_REFRESH_KEY = "cdp_refresh_token";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function setCdpSessionTokens(tokens: {
  accessToken: string;
  refreshToken?: string;
}): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(ACCESS_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    storage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
}

export function getCdpAccessToken(): string | null {
  return getStorage()?.getItem(ACCESS_KEY) ?? null;
}

export function getCdpRefreshToken(): string | null {
  return getStorage()?.getItem(REFRESH_KEY) ?? null;
}

/** Display name stored at login (localStorage); null until the user signs in. */
export function getCdpDisplayName(): string | null {
  return getStorage()?.getItem(DISPLAY_NAME_KEY) ?? null;
}

/** Email stored at login (localStorage); null until the user signs in. */
export function getCdpEmail(): string | null {
  return getStorage()?.getItem(EMAIL_KEY) ?? null;
}

export function setCdpIdentity(identity: {
  email?: string | null;
  displayName?: string | null;
}): void {
  const storage = getStorage();
  if (!storage) return;
  if (typeof identity.email === "string") {
    storage.setItem(EMAIL_KEY, identity.email);
  }
  if (typeof identity.displayName === "string") {
    storage.setItem(DISPLAY_NAME_KEY, identity.displayName);
  }
}

/** User ID decoded from the current JWT `sub` claim. Returns null when no token exists. */
export function getCdpUserId(): string | null {
  const token = getCdpAccessToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    const claims = JSON.parse(atob(padded)) as { sub?: string };
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

/** Why the session was cleared. "sign_out": the person signed out or switched
 *  account (the sign-out dialog, signOut()). "expired": the tokens were lost
 *  while nobody signed out (a failed refresh, a 401, no token at the gate).
 *  Cleanups that forget what belongs to the person (local folder handles,
 *  LF3b-11) run on "sign_out" only. */
export type CdpSessionClearReason = "sign_out" | "expired";

const sessionClearedCallbacks = new Set<(reason: CdpSessionClearReason) => void>();

/** Run `cb` whenever the CDP session is cleared (explicit sign-out or a 401 forced logout),
 *  with the reason. Callbacks are synchronous fire-and-forget: the caller usually
 *  hard-navigates right after. */
export function onCdpSessionCleared(cb: (reason: CdpSessionClearReason) => void): () => void {
  sessionClearedCallbacks.add(cb);
  return () => {
    sessionClearedCallbacks.delete(cb);
  };
}

/** Prefix of the per-person memos (apps/app lib/onboarding/user-memo.ts). They answer
 *  for one signed-in person, so sign-out drops them all. */
export const USER_MEMO_PREFIX = "cdp_memo:";

function clearUserMemos(storage: Storage): void {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(USER_MEMO_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // a storage that cannot be enumerated keeps its memos; they are keyed by person anyway
  }
}

export function clearCdpSessionTokens(reason: CdpSessionClearReason = "sign_out"): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(EMAIL_KEY);
    storage.removeItem(DISPLAY_NAME_KEY);
    clearUserMemos(storage);
  }
  // Best-effort sweep of the retired sessionStorage store.
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(LEGACY_SESSION_ACCESS_KEY);
      window.sessionStorage.removeItem(LEGACY_SESSION_REFRESH_KEY);
    } catch {
      // sessionStorage may be unavailable; ignore.
    }
  }
  for (const cb of Array.from(sessionClearedCallbacks)) {
    try {
      cb(reason);
    } catch {
      // one cleanup must not block the others or the sign-out
    }
  }
}

// The ONE refresh path. A module-level singleton promise means concurrent 401s —
// whether they come from lib/cdp/fetch.ts or the ai-agent layer — all await the
// same in-flight refresh, so the rotating refresh token is spent exactly once.
let activeRefresh: Promise<boolean> | null = null;

export function refreshCdpAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const refreshToken = getCdpRefreshToken();
  const demo = getStorage()?.getItem("cluega_demo_session") === "1";
  if (!refreshToken && !demo) return Promise.resolve(false);

  if (!activeRefresh) {
    activeRefresh = (async (): Promise<boolean> => {
      try {
        const res = await fetch(demo ? "/api/demo-auth" : cdpApiUrl(cdpApiConfig.refreshPath), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(demo ? { mode: "refresh" } : { refresh_token: refreshToken }),
        });
        if (!res.ok) return false;

        const envelope = (await res.json().catch(() => undefined)) as
          | { data?: { access_token?: string; refresh_token?: string }; accessToken?: string; refreshToken?: string }
          | undefined;
        const newAccess = envelope?.data?.access_token?.trim() ?? envelope?.accessToken?.trim();
        if (!newAccess) return false;

        setCdpSessionTokens({
          accessToken: newAccess,
          refreshToken: envelope?.data?.refresh_token?.trim() ?? envelope?.refreshToken?.trim(),
        });
        return true;
      } catch {
        return false;
      } finally {
        activeRefresh = null;
      }
    })();
  }

  return activeRefresh;
}