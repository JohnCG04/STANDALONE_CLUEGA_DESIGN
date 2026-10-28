import { platformApiConfig } from "@/config/platform-api";
import { cdpFetchRaw } from "@/lib/cdp";
import { setCdpIdentity } from "@/lib/cdp/session";

/**
 * The workspace the signed-in user belongs to.
 *
 * /v1/me has always carried this; the DTO simply dropped it. The id is kept for
 * support: it is the one value that names a workspace unambiguously when someone
 * reports a problem, and nobody can read it off the screen today.
 */
export type PlatformTenant = {
  id: string;
  name: string;
};

export type PlatformProfile = {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  /** Null when the response carried no usable tenant block, never a half-filled one. */
  tenant: PlatformTenant | null;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * An id with no name is not a workspace anyone can recognise, and a name with no
 * id is useless to support — so the block is taken whole or not at all, rather
 * than rendering a card that is half blank.
 */
function toTenant(raw: unknown): PlatformTenant | null {
  if (!raw || typeof raw !== "object") return null;
  const dto = raw as Record<string, unknown>;
  const id = readString(dto.id);
  const name = readString(dto.name);
  if (!id || !name) return null;
  return { id, name };
}

function toProfile(raw: unknown): PlatformProfile {
  const dto = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const email = readString(dto.email);
  const firstName = readString(dto.first_name);
  const lastName = readString(dto.last_name);
  const fullName = readString(dto.full_name);
  const displayName =
    fullName || [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || "User";
  return { email, displayName, firstName, lastName, tenant: toTenant(dto.tenant) };
}

/**
 * Query key for the signed-in user's profile. Exported so the fetch and every
 * invalidation of it name the same key — a display-name change that forgets to
 * invalidate would leave a stale name in the header until a full reload.
 */
export const PLATFORM_PROFILE_QUERY_KEY = ["platform", "profile", "me"] as const;

export async function getCurrentPlatformProfile(): Promise<PlatformProfile> {
  const { json } = await cdpFetchRaw(platformApiConfig.mePath, {
    auth: { kind: "auto" },
    baseUrl: platformApiConfig.baseUrl,
    // No `cache: "no-store"`. Freshness is now governed by the query cache's
    // staleTime, not by defeating the browser cache on every call — and the
    // platform sends no Cache-Control on this endpoint anyway, so the flag was
    // buying nothing while guaranteeing a network round-trip per mount.
  });
  const profile = toProfile(json);
  setCdpIdentity({ email: profile.email, displayName: profile.displayName });
  return profile;
}

export async function updateCurrentPlatformProfileDisplayName(
  displayName: string,
): Promise<PlatformProfile> {
  const normalized = displayName.trim();
  const { firstName, lastName } = splitDisplayName(normalized);
  await cdpFetchRaw(platformApiConfig.mePath, {
    method: "PATCH",
    auth: { kind: "auto" },
    baseUrl: platformApiConfig.baseUrl,
    headers: { "Content-Type": "application/json" },
    body: {
      first_name: firstName,
      last_name: lastName,
    },
  });
  return getCurrentPlatformProfile();
}
