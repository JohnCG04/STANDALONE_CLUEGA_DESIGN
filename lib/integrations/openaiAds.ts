import { CdpApiError, cdpFetch } from "@/lib/cdp";
import type {
  CredentialField,
  IntegrationConnection,
} from "@/lib/integrations/types";

/**
 * OpenAI Ads (ChatGPT ads) accounts, contract C1 of the OpenAI Ads master plan
 * (docs/superpowers/plans/2026-10-12-openai-ads-00-master.md).
 *
 * Not the generic connections API: each pasted key IS one ad account, verified
 * against OpenAI by the backend before it is stored, and the key never comes
 * back — only `key_hint`.
 *
 * Every answer is the backend's standard envelope — `{"data": …}` on success,
 * `{"error": {"code", "message", "details"}}` on failure — which `cdpFetch`
 * already unwraps into a value or a CdpApiError, exactly as attributionClient.ts
 * relies on for the same F-A1 credential pattern.
 */
export const OPENAI_ADS_SERVICE_ID = "openaiAds" as const;
/** The platform key the AI, the manifests and `/api/v1/ad_accounts` use. */
export const OPENAI_ADS_PLATFORM_ID = "openai";
export const OPENAI_ADS_ACCOUNTS_PATH = "/api/v1/integrations/openai-ads/accounts";
/**
 * Where a key is created: the API Keys section of Ads Manager › Settings ›
 * General (master plan R13, opened live 2026-10-12).
 */
export const OPENAI_ADS_SETTINGS_URL = "https://ads.openai.com/settings";

/**
 * The "create a key" link. `act` selects the ad account, so a row whose key
 * stopped working lands on that account's own settings. With no account known
 * — the empty add-key form — Ads Manager opens on the account last used there.
 */
export function openAIAdsKeyHelpUrl(adAccountId?: string | null): string {
  const id = adAccountId?.trim();
  return id
    ? `${OPENAI_ADS_SETTINGS_URL}?act=${encodeURIComponent(id)}`
    : OPENAI_ADS_SETTINGS_URL;
}

/** App Authorization, the one page where an OpenAI Ads key may be typed (spec D3). */
export const OPENAI_ADS_KEY_PAGE_PATH = "/app/integrations";

/**
 * Whether a credential sheet opened at `pathname` may draw the key field.
 * Anywhere else — the composer's connector directory, a Pulse bot — it hands
 * off to App Authorization instead (master plan, P04 Q4). Fails closed: with no
 * page to read (`undefined`, no window) the field is not drawn.
 */
export function openAIAdsKeyEntryAllowedAt(pathname: string | undefined): boolean {
  if (pathname === undefined) return false;
  return (
    pathname === OPENAI_ADS_KEY_PAGE_PATH ||
    pathname.startsWith(`${OPENAI_ADS_KEY_PAGE_PATH}/`)
  );
}

/** Used when the catalog row arrives without `config_schema.credential_fields`. */
export const OPENAI_ADS_FALLBACK_CREDENTIAL_FIELDS: CredentialField[] = [
  { key: "api_key", label: "API key", secret: true, required: true },
];

export type OpenAIAdsAccountStatus = "ACTIVE" | "BROKEN" | "REVOKED";

/** C1 `Account`. Never carries the key. */
export type OpenAIAdsAccount = {
  id: string;
  ad_account_id: string;
  account_name: string;
  display_name: string | null;
  currency_code: string;
  timezone: string;
  review_status: string;
  status: OpenAIAdsAccountStatus | (string & {});
  key_hint: string;
  capabilities: Record<string, boolean>;
  created_at: string;
  last_verified_at: string;
};

export type OpenAIAdsBindInput = { apiKey: string; displayName?: string };

function isAccount(value: unknown): value is OpenAIAdsAccount {
  if (typeof value !== "object" || value === null) return false;
  const row = value as { id?: unknown; ad_account_id?: unknown };
  return typeof row.id === "string" && typeof row.ad_account_id === "string";
}

/**
 * The unwrapped `data` of a bind or verify, checked to BE an Account. A `data`
 * that is something else would otherwise flow on as if a key had been saved.
 */
export function requireOpenAIAdsAccount(data: unknown): OpenAIAdsAccount {
  if (isAccount(data)) return data;
  throw new CdpApiError({
    status: 200,
    code: "invalid_response",
    message: "openai ads account missing from response",
  });
}

export async function listOpenAIAdsAccounts(
  signal?: AbortSignal,
): Promise<OpenAIAdsAccount[]> {
  const rows = await cdpFetch<unknown[] | null>(OPENAI_ADS_ACCOUNTS_PATH, {
    signal,
  });
  return (rows ?? []).filter(isAccount);
}

export async function bindOpenAIAdsAccount(
  input: OpenAIAdsBindInput,
): Promise<OpenAIAdsAccount> {
  // Refused here rather than sent: an empty key can only come back 400, and the
  // form already stops it — this guards the other callers.
  if (!input.apiKey) {
    throw new CdpApiError({
      status: 400,
      code: "invalid_argument",
      message: "api_key is required",
    });
  }
  const body: { api_key: string; display_name?: string } = {
    api_key: input.apiKey,
  };
  if (input.displayName) body.display_name = input.displayName;
  // POST is never retried by the client (gateway-retry.ts), so a 502 here is
  // one attempt — and C1 makes a repeat of the same key idempotent anyway.
  const data = await cdpFetch<unknown>(OPENAI_ADS_ACCOUNTS_PATH, {
    method: "POST",
    body,
  });
  return requireOpenAIAdsAccount(data);
}

export async function verifyOpenAIAdsAccount(
  id: string,
): Promise<OpenAIAdsAccount> {
  const data = await cdpFetch<unknown>(
    `${OPENAI_ADS_ACCOUNTS_PATH}/${encodeURIComponent(id)}/verify`,
    { method: "POST" },
  );
  return requireOpenAIAdsAccount(data);
}

export async function removeOpenAIAdsAccount(id: string): Promise<void> {
  await cdpFetch<void>(
    `${OPENAI_ADS_ACCOUNTS_PATH}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/**
 * The C1 request body out of CredentialForm's submit.
 *
 * Every whitespace character is dropped from the key, not just the ends: a key
 * copied out of a wrapped line or a text file arrives with a newline inside it,
 * and an OpenAI key never contains whitespace of its own.
 */
export function openAIAdsBindInputFrom(input: {
  values: Record<string, string>;
  displayName?: string;
}): OpenAIAdsBindInput {
  const apiKey = (input.values.api_key ?? "").replace(/\s+/g, "");
  const displayName = (input.displayName ?? input.values.display_name ?? "").trim();
  return displayName ? { apiKey, displayName } : { apiKey };
}

/** Removed accounts hold no key and cannot be managed; the list leaves them out. */
export function visibleOpenAIAdsAccounts(
  accounts: readonly OpenAIAdsAccount[],
): OpenAIAdsAccount[] {
  return accounts.filter((account) => account.status !== "REVOKED");
}

export function openAIAdsAccountTitle(
  account: Pick<OpenAIAdsAccount, "display_name" | "account_name" | "ad_account_id">,
): string {
  return (
    account.display_name?.trim() ||
    account.account_name?.trim() ||
    account.ad_account_id
  );
}

/** Anything that is not ACTIVE needs a new key: BROKEN is the only other state on screen. */
export function openAIAdsStatusKey(status: string): "active" | "broken" {
  return status === "ACTIVE" ? "active" : "broken";
}

/** The shape the generic connect paths (index.tsx, ConnectServiceDialog) resolve with. */
export function openAIAdsAccountToConnection(
  account: OpenAIAdsAccount,
): IntegrationConnection {
  return {
    id: account.id,
    serviceID: OPENAI_ADS_SERVICE_ID,
    accountLabel: openAIAdsAccountTitle(account),
    connectedAt: account.created_at,
    status:
      account.status === "ACTIVE"
        ? "active"
        : account.status === "BROKEN"
          ? "error"
          : "revoked",
  };
}

export type OpenAIAdsErrorKind =
  | "key_invalid"
  | "unreachable"
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "revoked";

export const OPENAI_ADS_ERROR_MESSAGE_KEY: Record<OpenAIAdsErrorKind, string> = {
  key_invalid: "appChat.integrations.openaiAds.errors.keyInvalid",
  unreachable: "appChat.integrations.openaiAds.errors.unreachable",
  bad_request: "appChat.integrations.openaiAds.errors.badRequest",
  forbidden: "appChat.integrations.openaiAds.errors.forbidden",
  not_found: "appChat.integrations.openaiAds.errors.notFound",
  revoked: "appChat.integrations.openaiAds.errors.revoked",
};

export const OPENAI_ADS_GENERIC_ERROR_KEY =
  "appChat.integrations.openaiAds.errors.generic";

/**
 * Which refusal this is.
 *
 * C1's own two codes are read first, and only by CODE: a 502 from the proxy in
 * front of the backend is not OpenAI being down, and a Cloudflare 1010 block is
 * reported by the backend as `openai_ads_unreachable`, never as a bad key
 * (master plan, Review Focus #2). The route's other refusals — 400 body, 403
 * not a tenant admin, 410 account already REVOKED — are read by status, which
 * is all C1 promises about them. A 403 `feature_disabled` is the app-wide
 * module gate (fetch.ts announces it), not the admin check, so it is left to
 * the generic message.
 *
 * A 404 is "no such account" only when it carries the backend's `not_found`
 * code. A bare router 404 (`http_404`) means the backend does not serve these
 * routes at all — it has no key to encrypt with — and blaming the account for
 * that would send the user hunting for something that is not missing.
 */
export function openAIAdsErrorKind(error: unknown): OpenAIAdsErrorKind | null {
  if (!(error instanceof CdpApiError)) return null;
  if (error.code === "openai_ads_key_invalid") return "key_invalid";
  if (error.code === "openai_ads_unreachable") return "unreachable";
  if (error.status === 400) return "bad_request";
  if (error.status === 403 && error.code !== "feature_disabled") return "forbidden";
  if (error.status === 404 && error.code === "not_found") return "not_found";
  if (error.status === 410) return "revoked";
  return null;
}

/** The account the action was aimed at is no longer there to act on. */
export function openAIAdsAccountIsGone(error: unknown): boolean {
  const kind = openAIAdsErrorKind(error);
  return kind === "not_found" || kind === "revoked";
}

type Translate = (key: string) => string;

/** For the OpenAI Ads screens: their own words for every failure. */
export function openAIAdsFailureMessage(error: unknown, t: Translate): string {
  const kind = openAIAdsErrorKind(error);
  return t(kind ? OPENAI_ADS_ERROR_MESSAGE_KEY[kind] : OPENAI_ADS_GENERIC_ERROR_KEY);
}

/**
 * For the generic credential sheet (index.tsx, ConnectServiceDialog): OpenAI
 * Ads gets its own sentences, and every other service keeps exactly what it
 * showed before — the server's message, or `unexpected_error`.
 */
export function credentialConnectErrorMessage(
  serviceId: string,
  error: unknown,
  t: Translate,
): string {
  if (serviceId === OPENAI_ADS_SERVICE_ID) return openAIAdsFailureMessage(error, t);
  return error instanceof CdpApiError ? error.message : "unexpected_error";
}
