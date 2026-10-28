import {
  cdpApiConfig,
  isCrossOriginClientUrl,
  normalizeCdpClientUrl,
} from "@/config/cdp-api";
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGE_STORAGE_KEY } from "@/i18n/config";
import { currentLanguage } from "@/i18n/language-state";
import {
  clearCdpSessionTokens,
  getCdpAccessToken,
  refreshCdpAccessToken,
  type CdpSessionClearReason,
} from "@/lib/cdp/session";
import { redirectToLogin as redirectToLoginPage } from "@/lib/cdp/auth-redirect";
import { notifyIfFeatureDisabled } from "../cdp/feature-disabled";
import { getCdpSupportSession, hasCdpSupportSession } from "@/lib/cdp/support-session";

export class CluegaUnauthorizedError extends Error {
  constructor() {
    super("Phiên đăng nhập đã hết hạn");
    this.name = "CluegaUnauthorizedError";
  }
}

/** Thrown when a chat is rejected up-front (HTTP 402) because the tenant's
 *  token wallet is empty. The store maps this to a "top up" banner. */
export class CluegaInsufficientTokensError extends Error {
  readonly code: string;
  constructor(message: string, code = "insufficient_tokens") {
    super(message);
    this.name = "CluegaInsufficientTokensError";
    this.code = code;
  }
}

/** Thrown when the backend refuses a turn up-front (HTTP 409 `quota_exceeded`)
 *  because company storage refuses writes (LIB2-030): past the grace limit with
 *  no credits, no job starts. Terminal — retrying cannot help until storage is
 *  freed or credits are bought. `details` carries the storage figures. */
export class CluegaStorageQuotaError extends Error {
  readonly details: unknown;
  constructor(details?: unknown) {
    super("Company storage refuses writes");
    this.name = "CluegaStorageQuotaError";
    this.details = details;
  }
}

/** Thrown when the backend rejects a turn (HTTP 409 `session_busy`) because the
 *  same session is already running a turn elsewhere (another tab/device, or a
 *  prior turn not yet idle). Retryable — the caller backs off and retries. */
export class CluegaSessionBusyError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs = 800) {
    // English-neutral developer message; the user-facing copy is resolved from
    // i18n via the store's errorKey, never from this string.
    super("Session is busy on another client");
    this.name = "CluegaSessionBusyError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown when the backend drops a turn (HTTP 409 `duplicate_request`) because
 *  the same idempotency key was already processed. Terminal — do NOT retry. */
export class CluegaDuplicateRequestError extends Error {
  constructor() {
    super("Duplicate request already processed");
    this.name = "CluegaDuplicateRequestError";
  }
}

export class CluegaCdpDisabledError extends Error {
  constructor() {
    super("CDP backend is disabled");
    this.name = "CluegaCdpDisabledError";
  }
}

// All token storage is owned by lib/cdp/session.ts (single source of truth).
// These wrappers keep the existing ai-agent import surface but delegate.
export function getCdpToken(): string | null {
  return getCdpAccessToken();
}

/** `reason`: "sign_out" (the default, an explicit sign-out) or "expired"
 *  (tokens lost with no sign-out; see CdpSessionClearReason). */
export function clearCdpSession(reason: CdpSessionClearReason = "sign_out"): void {
  clearCdpSessionTokens(reason);
}

export async function signOut(): Promise<void> {
  // Revoke the current login session at the source of truth (Mid via CDP
  // backend) so it disappears from "active devices" and instant-revocation
  // kicks in. Best-effort + no retry: never block local logout.
  try {
    await cdpFetch(
      `${cdpApiConfig.baseUrl}/api/v1/auth/logout`,
      { method: "POST" },
      false,
    );
  } catch {
    // ignore — clear local state regardless
  }
  try {
    await fetch("/api/app-auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // Ignore network errors — clear the client session and redirect regardless.
  }
  clearCdpSession();
  if (typeof window !== "undefined") {
    window.location.href = `/login?from=${encodeURIComponent("/flow")}`;
  }
}

export function redirectToLogin(): void {
  redirectToLoginPage();
}

export function buildCdpHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  const support = getCdpSupportSession();
  if (support) {
    headers["X-Remote-Support-Token"] = support.token;
    headers["X-Remote-Support-Tenant-ID"] = support.tenantId;
    return headers;
  }
  const token = getCdpToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const team = getActiveTeamId();
  if (team) headers["X-Team-Id"] = team;
  return headers;
}

/** 请求tiktok广告数据的headers */
/** Headers for requesting TikTok ad data.  */
export function buildCdpAdHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  const support = getCdpSupportSession();
  if (support) {
    headers["X-Remote-Support-Token"] = support.token;
    headers["X-Remote-Support-Tenant-ID"] = support.tenantId;
    return headers;
  }
  const token = getCdpToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** getActiveTeamId reads the persisted active team id (set by the team switcher).
 *  Sent as X-Team-Id so the backend scopes content to the active team. */
export function getActiveTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cdp_active_team");
}

export async function refreshCdpToken(): Promise<boolean> {
  return refreshCdpAccessToken();
}

export async function cdpFetch(
  input: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<Response> {
  if (!cdpApiConfig.enabled) {
    throw new CluegaCdpDisabledError();
  }

  const url = normalizeCdpClientUrl(input);
  const callerHeaders = (init.headers as Record<string, string> | undefined) ?? {};
  const headers = isCrossOriginClientUrl(url)
    ? buildCdpAdHeaders(callerHeaders)
    : buildCdpHeaders(callerHeaders);
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && allowRetry) {
    if (hasCdpSupportSession()) return res;
    const refreshed = await refreshCdpToken();
    if (refreshed) return cdpFetch(url, init, false);
    clearCdpSession("expired");
    redirectToLogin();
    throw new CluegaUnauthorizedError();
  }

  notifyIfFeatureDisabled(res);
  return res;
}


function readCookieLanguageValue(): string | null {
  const target = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LANGUAGE_STORAGE_KEY}=`));
  const value = target?.split("=")[1];
  return isLanguageCode(value) ? value : null;
}

/** Maps the app's internal language code (vn/zh/en) to the code the CDP
 * backend expects (vi/zh/en).
 *
 * The DOM language is written by the mounted `I18nProvider`, so it is the live
 * UI source of truth. It must beat localStorage: an old `cluega-language=zh`
 * can survive while the current SSR/request language is Vietnamese. If the
 * provider has not mounted yet, retain the cookie fallback used by SSR.
 */
/**
 * The app's internal language code (vn/zh/en) as the code the CDP backend
 * expects (vi/zh/en), or "" when the caller does not know.
 *
 * "" is a real answer and must stay distinct from a code: it tells the caller to
 * fall back to `getChatLocale()`, which GUESSES `DEFAULT_LANGUAGE` when nothing
 * has told it otherwise. Returning "zh" for an unknown language is how a request
 * ends up asserting a choice the user never made — and the server cannot tell
 * that apart from a real one.
 */
export function toBackendLocale(lang: string | null | undefined): string {
  const code = (lang || "").trim();
  if (!code) return "";
  return code === "vn" ? "vi" : code;
}

export function getChatLocale(): string {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  const htmlLang = document.documentElement?.lang;
  const code =
    htmlLang === "vi"
      ? "vi"
      : htmlLang === "en"
        ? "en"
        : htmlLang === "zh-Hant"
          ? "zh"
          : readCookieLanguageValue() ?? currentLanguage();
  return code === "vn" ? "vi" : code;
}
