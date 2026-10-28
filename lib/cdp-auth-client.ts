import { cdpApiConfig } from "@/config/cdp-api";
import { CdpApiError, cdpFetch } from "@/lib/cdp";

export type CdpLoginResult = {
  email: string;
  displayName: string;
  token: string;
  refreshToken: string;
};

type CdpLoginData = {
  access_token?: string;
  refresh_token?: string;
  display_name?: string;
  email?: string;
  // Present only when the address holds more than one membership. The response
  // then carries NO token at all.
  next?: string;
  account_id?: string;
  memberships?: { tenant_id?: string; tenant_name?: string }[];
  challenge_token?: string;
};

export type CdpTenantMembership = {
  tenantId: string;
  tenantName: string;
};

/**
 * Thrown when the password was correct and CDP is waiting for the person to say
 * which organization they meant.
 *
 * It is an error rather than a variant of CdpLoginResult on purpose: a result
 * type with optional token fields is one somebody eventually reads a token out
 * of. Nothing downstream can build a session from a thrown value by accident.
 */
export class CdpTenantChoiceRequiredError extends Error {
  readonly accountId: string;
  readonly memberships: CdpTenantMembership[];
  readonly challengeToken: string;

  constructor(accountId: string, memberships: CdpTenantMembership[], challengeToken: string) {
    super("Tenant choice required");
    this.name = "CdpTenantChoiceRequiredError";
    this.accountId = accountId;
    this.memberships = memberships;
    this.challengeToken = challengeToken;
  }
}

const TENANT_CHOICE_NEXT = "select_tenant";

/**
 * Reads the organization picker out of a login response, or returns null when
 * the response is not one.
 *
 * Keys on `next`, never on a missing token: a malformed response is also
 * missing a token, and answering the two the same way would turn every broken
 * login into a picker with an empty list.
 */
function readTenantChoice(
  data: CdpLoginData,
): CdpTenantChoiceRequiredError | null {
  if (data.next !== TENANT_CHOICE_NEXT) return null;

  const memberships = (data.memberships ?? [])
    .map((m) => ({
      tenantId: m.tenant_id?.trim() ?? "",
      tenantName: m.tenant_name?.trim() ?? "",
    }))
    .filter((m) => m.tenantId !== "");

  return new CdpTenantChoiceRequiredError(
    data.account_id?.trim() ?? "",
    memberships,
    data.challenge_token?.trim() ?? "",
  );
}

export async function loginWithPasswordViaCdp(
  email: string,
  password: string,
  device?: { userAgent?: string | null; clientIp?: string | null },
  tenantId?: string,
  challengeToken?: string,
): Promise<CdpLoginResult> {
  const headers: Record<string, string> = {};
  if (device?.userAgent) headers["User-Agent"] = device.userAgent;
  if (device?.clientIp) headers["X-Forwarded-For"] = device.clientIp;

  const data = await cdpFetch<CdpLoginData>(cdpApiConfig.loginPath, {
    method: "POST",
    // Only send the choice once it has been made. An empty tenant_id would be a
    // choice of "" rather than an absent one.
    body: challengeToken?.trim()
      ? {
          challenge_token: challengeToken.trim(),
          ...(tenantId?.trim() ? { tenant_id: tenantId.trim() } : {}),
        }
      : tenantId?.trim()
        ? { email, password, tenant_id: tenantId.trim() }
        : { email, password },
    headers,
    // Login runs server-side (the /api/app-auth route) and needs NO bearer. Be
    // explicit: a missing `auth` defaults to "auto" → getCdpAccessToken(), which
    // lives in a "use client" module and throws when invoked on the server.
    auth: { kind: "none" },
  });

  const choice = readTenantChoice(data);
  if (choice) throw choice;

  const token = data.access_token?.trim();
  const refreshToken = data.refresh_token?.trim();
  const resolvedEmail = data.email?.trim();
  const displayName = data.display_name?.trim();

  if (!token || !resolvedEmail || !refreshToken) {
    throw new CdpApiError({
      status: 200,
      code: "invalid_response",
      message: "Login response is missing required fields",
    });
  }

  return {
    email: resolvedEmail,
    displayName: displayName || resolvedEmail.split("@")[0] || "User",
    token,
    refreshToken,
  };
}
