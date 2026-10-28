const TOKEN_KEY = "cdp_support_session";
const TENANT_KEY = "cdp_support_tenant_id";
export const SUPPORT_ACCESS_COOKIE = "cdp_support_access";

export type CdpSupportSession = {
  token: string;
  tenantId: string;
};

export function setCdpSupportSession(session: CdpSupportSession): void {
  window.sessionStorage.setItem(TOKEN_KEY, session.token);
  window.sessionStorage.setItem(TENANT_KEY, session.tenantId);
  document.cookie = `${SUPPORT_ACCESS_COOKIE}=1; Path=/; SameSite=Lax`;
}

export function getCdpSupportSession(): CdpSupportSession | null {
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  const tenantId = window.sessionStorage.getItem(TENANT_KEY);
  return token && tenantId ? { token, tenantId } : null;
}

export function hasCdpSupportSession(): boolean {
  return getCdpSupportSession() !== null;
}

export function clearCdpSupportSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TENANT_KEY);
  document.cookie = `${SUPPORT_ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
