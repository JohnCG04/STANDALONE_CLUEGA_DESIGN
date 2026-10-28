export const CDP_MODULE = "cdp";

export type ModuleAccessState = "active" | "inactive" | "unknown";

type ModuleClaims = {
  active_modules?: unknown;
};

function decodeJwtPayload(token: string): ModuleClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const padded = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as ModuleClaims;
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Reads the module entitlement embedded in the signed Core JWT.
 *
 * This is only the early UI gate. The CDP API independently enforces the same
 * claim, so changing browser storage can never grant backend access.
 */
export function getModuleAccessState(
  token: string | null | undefined,
  requiredModule = CDP_MODULE,
): ModuleAccessState {
  if (!token) return "unknown";

  const claims = decodeJwtPayload(token);
  if (!claims || !Array.isArray(claims.active_modules)) return "unknown";

  const normalizedRequiredModule = requiredModule.trim().toLowerCase();
  const active = claims.active_modules.some(
    (module) =>
      typeof module === "string" &&
      module.trim().toLowerCase() === normalizedRequiredModule,
  );
  return active ? "active" : "inactive";
}
