import { cdpFetch } from "@/lib/cdp";

import type { SocialPlatform } from "./client";

/**
 * The accounts this tenant can publish AS — `GET /api/v1/social-accounts`.
 *
 * One call for every platform, not one per integration. The publishing subject
 * is a different object on each: a TikTok Login Kit connection IS one account,
 * while one Facebook connection owns many Pages (each with its own token) and
 * an Instagram professional account hangs off a Page. So the backend hands out
 * an OPAQUE `accountKey` and takes it back on the post; this client never
 * builds one, parses one, or assumes what is inside it.
 *
 * `platforms` comes back alongside the accounts because an empty list is
 * ambiguous on its own: "Instagram publishing is not wired yet" and "you have
 * not connected an Instagram account" are different instructions to the user.
 */

export type SocialAccountCapabilities = {
  /** Largest photo carousel this platform publishes; 0 when it takes none. */
  maxImages: number;
  maxVideos: number;
  /** False for Instagram — it has no per-post privacy choice at all, so a
   *  shared "private" setting is meaningless there rather than applied. */
  supportsPrivacyLevel: boolean;
  supportsDisableComment: boolean;
  /** The account's live options must be read before composing (TikTok's
   *  Content Posting API requires it and forbids caching the answer). */
  creatorInfoRequired: boolean;
  /** Where that read lives, already addressed to this account. Given by the
   *  server so this client does not build per-platform URLs out of ids it is
   *  meant to treat as opaque. */
  creatorInfoPath?: string;
};

export type SocialAccount = {
  /** The opaque handle to send back on a post. The only id this UI passes on. */
  accountKey: string;
  platform: SocialPlatform;
  /** Platform-side id — exposed for support; addressing accounts by it means
   *  learning one id shape per platform, which `accountKey` exists to avoid. */
  accountId: string;
  displayName: string;
  avatarUrl?: string;
  /** The connection's own state: active | expired | revoked | error. */
  status: string;
  /** The only field to gate selection on: it folds together a status that is
   *  not active, a grant missing the posting scope, and a platform whose
   *  adapter is not wired. */
  canPublish: boolean;
  /** Why `canPublish` is false, in words the user can act on. */
  unavailableReason?: string;
  capabilities: SocialAccountCapabilities;
};

export type SocialPlatformAvailability = {
  platform: SocialPlatform;
  /** Whether the deployment can publish to this platform AT ALL — independent
   *  of whether the tenant has connected anything to it. */
  canPublish: boolean;
  reason?: string;
  /** How many of the tenant's accounts here can publish right now. */
  connected: number;
};

export type SocialAccountsResult = {
  accounts: SocialAccount[];
  platforms: SocialPlatformAvailability[];
};

type SocialAccountCapabilitiesWire = {
  max_images?: number;
  max_videos?: number;
  supports_privacy_level?: boolean;
  supports_disable_comment?: boolean;
  creator_info_required?: boolean;
  creator_info_path?: string;
};

type SocialAccountWire = {
  account_key?: string;
  platform?: string;
  account_id?: string;
  display_name?: string;
  avatar_url?: string;
  status?: string;
  can_publish?: boolean;
  unavailable_reason?: string;
  capabilities?: SocialAccountCapabilitiesWire;
};

type SocialAccountsWire = {
  items?: SocialAccountWire[];
  platforms?: {
    platform?: string;
    can_publish?: boolean;
    reason?: string;
    connected?: number;
  }[];
};

const PLATFORMS: readonly SocialPlatform[] = ["tiktok", "instagram", "facebook"];

function isKnownPlatform(value: string | undefined): value is SocialPlatform {
  return Boolean(value && (PLATFORMS as readonly string[]).includes(value));
}

function toCapabilities(
  wire: SocialAccountCapabilitiesWire | undefined,
): SocialAccountCapabilities {
  return {
    maxImages: wire?.max_images ?? 0,
    maxVideos: wire?.max_videos ?? 0,
    supportsPrivacyLevel: wire?.supports_privacy_level === true,
    supportsDisableComment: wire?.supports_disable_comment === true,
    creatorInfoRequired: wire?.creator_info_required === true,
    ...(wire?.creator_info_path ? { creatorInfoPath: wire.creator_info_path } : {}),
  };
}

/** Wire → account, or null for a row this build cannot address: no key to send
 *  back, or a platform it has no UI for. Dropping it beats rendering a row that
 *  cannot be selected. */
function toAccount(wire: SocialAccountWire): SocialAccount | null {
  if (!wire.account_key || !isKnownPlatform(wire.platform)) return null;
  return {
    accountKey: wire.account_key,
    platform: wire.platform,
    accountId: wire.account_id ?? "",
    displayName: wire.display_name ?? "",
    ...(wire.avatar_url ? { avatarUrl: wire.avatar_url } : {}),
    status: wire.status ?? "",
    canPublish: wire.can_publish === true,
    ...(wire.unavailable_reason
      ? { unavailableReason: wire.unavailable_reason }
      : {}),
    capabilities: toCapabilities(wire.capabilities),
  };
}

export async function listSocialAccounts(
  platforms?: readonly SocialPlatform[],
  signal?: AbortSignal,
): Promise<SocialAccountsResult> {
  const result = await cdpFetch<SocialAccountsWire>("/api/v1/social-accounts", {
    auth: { kind: "auto" },
    ...(platforms && platforms.length > 0
      ? { searchParams: { platforms: platforms.join(",") } }
      : {}),
    signal,
  });
  return {
    accounts: (result.items ?? [])
      .map(toAccount)
      .filter((account): account is SocialAccount => account !== null),
    platforms: (result.platforms ?? [])
      .filter((row): row is { platform: SocialPlatform } & typeof row =>
        isKnownPlatform(row.platform),
      )
      .map((row) => ({
        platform: row.platform,
        canPublish: row.can_publish === true,
        ...(row.reason ? { reason: row.reason } : {}),
        connected: row.connected ?? 0,
      })),
  };
}

/** The accounts of one platform, in the order the server returned them (its
 *  first publishable one is the default a post with no account would use). */
export function accountsOfPlatform(
  accounts: readonly SocialAccount[],
  platform: SocialPlatform,
): SocialAccount[] {
  return accounts.filter((account) => account.platform === platform);
}
