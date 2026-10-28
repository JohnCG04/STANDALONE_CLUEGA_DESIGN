/**
 * How the attribution platforms are presented on screen.
 *
 * The API answers in wire values — codes like APPSFLYER, credential keys like
 * `api_token`. Both are right for a payload and wrong for a form: PRD §6.2's
 * mockup uses brand casing, and `api_token` is the platform's word for the
 * thing, not the operator's. This module is the one place that translates,
 * so the authorization section and the accounts dialog cannot drift apart.
 */

export type AttributionPlatformMeta = {
  /** Brand casing, per §6.2's mockup. */
  label: string;
  /** Local file: two of the five are not on the icon CDN this app uses. */
  icon: string;
  /**
   * Where the operator goes to fetch the credential.
   *
   * The dashboard root rather than the token page itself: neither AppsFlyer nor
   * Adjust publishes a stable URL for that page, and a deep link that 404s
   * strands the person worse than no link at all. The vendor doc in docsUrl is
   * what carries them the last step.
   */
  consoleUrl?: string;
  /** Vendor documentation, for when the console has moved the menu again. */
  docsUrl?: string;
};

export const ATTRIBUTION_PLATFORM_META: Record<string, AttributionPlatformMeta> = {
  APPSFLYER: {
    label: "AppsFlyer",
    icon: "/Image/AppsFlyer.png",
    consoleUrl: "https://hq1.appsflyer.com/",
    docsUrl:
      "https://support.appsflyer.com/hc/en-us/articles/360004562377-Managing-AppsFlyer-tokens",
  },
  ADJUST: {
    label: "Adjust",
    icon: "/Image/adjust-icon-filled-256.png",
    consoleUrl: "https://dash.adjust.com/",
    docsUrl: "https://dev.adjust.com/en/api/rs-api/authentication",
  },
  REYUN: { label: "Reyun", icon: "/Image/Reyun.png" },
  SINGULAR: { label: "Singular", icon: "/Image/Singular.png" },
  TENJIN: { label: "Tenjin", icon: "/Image/Tenjin.png" },
};

/**
 * The platform code behind a catalog service id.
 *
 * Which platforms appear, and in what order, is a catalog row in
 * `mcp_connection_catalog` — the same table every other connector is
 * administered from. This map only carries the last step of that: the catalog
 * speaks service ids (`appsflyer`), the attribution API speaks platform codes
 * (`APPSFLYER`), and something has to join the two.
 *
 * Written out rather than derived with toUpperCase so a future platform whose
 * code is not simply its id in capitals cannot silently resolve to a code the
 * API has never heard of.
 */
const ATTRIBUTION_CODE_BY_SERVICE_ID: Record<string, string> = {
  appsflyer: "APPSFLYER",
  adjust: "ADJUST",
  reyun: "REYUN",
  singular: "SINGULAR",
  tenjin: "TENJIN",
};

export function attributionCodeFromServiceId(id: string): string | undefined {
  // Own keys only: the id can come straight from `?service=`, and a plain
  // lookup would answer "toString" with Object.prototype's function.
  return Object.hasOwn(ATTRIBUTION_CODE_BY_SERVICE_ID, id)
    ? ATTRIBUTION_CODE_BY_SERVICE_ID[id]
    : undefined;
}

/** The catalog service id a platform code is listed under, e.g. ADJUST → adjust. */
export function attributionServiceIdFromCode(code: string): string | undefined {
  return Object.keys(ATTRIBUTION_CODE_BY_SERVICE_ID).find(
    (id) => ATTRIBUTION_CODE_BY_SERVICE_ID[id] === code,
  );
}

/** Brand casing when known, the raw code otherwise — never an empty cell. */
export function attributionPlatformLabel(code: string): string {
  return ATTRIBUTION_PLATFORM_META[code]?.label ?? code;
}

/**
 * Credential keys the UI has a human name for, keyed to
 * `attributionAccounts.fields.*`.
 *
 * A key absent from here still renders — see `humanizeCredentialField` — because
 * the server may add a field before this file learns its name, and a form that
 * hides an input it does not recognise cannot be submitted at all.
 */
const CREDENTIAL_FIELD_KEYS: Record<string, string> = {
  api_token: "apiToken",
};

export function credentialFieldMessageKey(field: string): string | null {
  return CREDENTIAL_FIELD_KEYS[field] ?? null;
}

/** Last resort for an unrecognised key: `api_token` → `Api token`. */
export function humanizeCredentialField(field: string): string {
  const spaced = field.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** ACTIVE | BROKEN | REVOKED, per domain.AttributionAccountStatus. */
export function attributionStatusMessageKey(status: string): string {
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "broken" || normalized === "revoked"
    ? normalized
    : "unknown";
}
