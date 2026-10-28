import { LANGUAGE_COOKIE_KEY } from "@/i18n/config";

/**
 * Cookie-consent state, and the inventory it governs.
 *
 * Stored in the `cluega-cookie-consent` cookie for one year — the Cookie Policy
 * documents it as a strictly-necessary cookie with a 1-year duration, so this is
 * the record that has to match. localStorage is written alongside it purely as a
 * fallback read for browsers that block cookies but allow storage.
 *
 * Strictly-necessary cookies (`app_auth`, the dev gate, this cookie itself) are
 * always on and are not represented here. Only the optional categories carry a
 * stored decision.
 *
 * This module is imported by `proxy.ts`, so it must stay dependency-free and
 * must not touch `document`/`window` at module scope.
 */

export const COOKIE_CONSENT_COOKIE = "cluega-cookie-consent";
const COOKIE_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
// Bumped to 2 when the Analytics category was added. A stored v1 decision is
// treated as no decision and the banner asks again — deliberately, because
// nobody who answered v1 was ever asked about analytics, and carrying their
// "yes" across to a purpose that did not exist would be consent we never got.
const CONSENT_VERSION = 2;

/**
 * Canonical name of the theme-preference cookie. Lives here rather than next to
 * the theme store because this module owns the consent classification below, and
 * `app/layout.tsx` needs the name too.
 */
export const THEME_COOKIE_KEY = "cluega-theme";

/**
 * Cookies and storage keys whose only job is to remember a preference — the
 * "Functionality" category in the Cookie Policy. Nothing here may be written
 * without consent, and everything here is purged the moment consent is
 * withdrawn.
 *
 * Keep in sync with the cookie table in each `legalDocs.json` locale file.
 */
export const FUNCTIONALITY_STORAGE_KEYS = [LANGUAGE_COOKIE_KEY, THEME_COOKIE_KEY] as const;

/**
 * Cookie name PREFIXES written by Google Tag Manager and whatever it loads —
 * the "Analytics" category in the Cookie Policy.
 *
 * Prefixes rather than exact names because GA mints one per property
 * (`_ga_<ID>`), so an exact list would go stale the day a property is added.
 * Nothing here may be written before consent — the tag itself is not loaded
 * until then — and everything matching is purged the moment consent is
 * withdrawn.
 */
// `_tt` covers the TikTok pixel the container loads (`_ttp`, `_tt_enable_cookie`).
export const ANALYTICS_COOKIE_PREFIXES = ["_ga", "_gid", "_gat", "_gcl", "_tt"] as const;

/** Dispatch on `window` to open the preference center from anywhere (e.g. the footer). */
export const OPEN_COOKIE_PREFERENCES_EVENT = "cluega-open-cookie-preferences";

/**
 * Fired on `window` after a decision is stored, so anything that persists a
 * preference can start or stop doing so without a reload.
 */
export const COOKIE_CONSENT_CHANGE_EVENT = "cluega-cookie-consent-change";

export type CookieConsent = {
  /** Functionality cookies — remember preferences such as language and theme. */
  functionality: boolean;
  /** Analytics — Google Tag Manager and the measurement tags it loads. */
  analytics: boolean;
};

type StoredConsent = CookieConsent & { v: number };

export const DEFAULT_COOKIE_CONSENT: CookieConsent = { functionality: false, analytics: false };

/**
 * Parse a stored consent value. Pure, and safe on the edge — the proxy calls it
 * with the raw cookie. Handles both the percent-encoded form written by
 * `document.cookie` and an already-decoded value.
 */
export function parseCookieConsent(raw: string | undefined | null): CookieConsent | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<StoredConsent>;

    if (
      parsed?.v !== CONSENT_VERSION ||
      typeof parsed.functionality !== "boolean" ||
      typeof parsed.analytics !== "boolean"
    ) {
      return null;
    }

    return { functionality: parsed.functionality, analytics: parsed.analytics };
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));

  return match ? match[1] : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/** Stored decision, or null when the visitor has not chosen yet. */
export function readCookieConsent(): CookieConsent | null {
  if (typeof document === "undefined") {
    return null;
  }

  const fromCookie = parseCookieConsent(readCookie(COOKIE_CONSENT_COOKIE));

  if (fromCookie) {
    return fromCookie;
  }

  try {
    return parseCookieConsent(window.localStorage.getItem(COOKIE_CONSENT_COOKIE));
  } catch {
    return null;
  }
}

export function writeCookieConsent(consent: CookieConsent) {
  const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ...consent }));

  document.cookie = `${COOKIE_CONSENT_COOKIE}=${value}; path=/; max-age=${COOKIE_CONSENT_MAX_AGE}; samesite=lax`;

  try {
    window.localStorage.setItem(COOKIE_CONSENT_COOKIE, decodeURIComponent(value));
  } catch {
    // Ignore storage failures from private browsing or disabled storage.
  }

  // Withdrawal has to take effect immediately, not on the next visit: drop every
  // functionality cookie and storage key we may have set while consent was given.
  if (!consent.functionality) {
    clearFunctionalityStorage();
  }

  if (!consent.analytics) {
    clearAnalyticsStorage();
  }

  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: consent }));
}

/** Remove everything in the Functionality category. */
export function clearFunctionalityStorage() {
  if (typeof document === "undefined") {
    return;
  }

  for (const key of FUNCTIONALITY_STORAGE_KEYS) {
    deleteCookie(key);

    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures from private browsing or disabled storage.
    }
  }
}

/**
 * Has the visitor allowed functionality cookies? False until they opt in, so a
 * preference is never persisted before a decision is made.
 */
export function hasFunctionalityConsent(): boolean {
  return readCookieConsent()?.functionality ?? false;
}

/**
 * Whether measurement may run. FALSE until the visitor says otherwise —
 * no decision is a no, which is what "off by default" has to mean.
 */
export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.analytics ?? false;
}

/**
 * Remove everything in the Analytics category.
 *
 * Cookies are dropped on the bare host AND on the registrable domain: GA sets
 * them on `.cluega.com`, and deleting only the host-scoped copy leaves the
 * visitor tracked after they asked not to be.
 */
export function clearAnalyticsStorage() {
  if (typeof document === "undefined") {
    return;
  }

  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = [undefined, host, parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`];

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || !ANALYTICS_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      continue;
    }

    for (const domain of domains) {
      document.cookie = `${name}=; path=/; max-age=0; samesite=lax${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

export function openCookiePreferences() {
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}
