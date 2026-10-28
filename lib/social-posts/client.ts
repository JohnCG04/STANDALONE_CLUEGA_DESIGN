import { cdpFetch } from "@/lib/cdp";

import type { AssetRef } from "@/lib/creative/assetRef";

// Client for the CDP social-posting flow (PRD chapter V):
//   POST /api/v1/social-posts          — create (publish now or schedule)
//   GET  /api/v1/social-posts/:id      — poll one post
//   GET  /api/v1/social-posts?conversation_id= — hydrate a conversation
// TikTok publishes for real through the tenant's TikTok Account connection
// (Login Kit + Content Posting API); send each generated asset's artifact id in
// `assets[].id` — the backend swaps the short-lived signed URL for its
// permanent proxy link only when that id resolves, and TikTok pulls the media
// itself, long after a signed R2 link would have expired.

export type SocialPlatform = "tiktok" | "instagram" | "facebook";

// preparing → uploading → processing are the publish stages; `posting` is the
// pre-stage name older records still carry, read as "in progress".
export type SocialPostStatus =
  | "scheduled"
  | "preparing"
  | "uploading"
  | "processing"
  | "posting"
  | "posted"
  | "failed";

export type SocialPostDraft = {
  caption: string;
  hashtags: string[];
  /** Platform-specific settings (privacy, placement, CTA…), PRD 5.2-5.4. The
   *  backend keeps this free-form and each adapter reads the keys it knows;
   *  TikTok's are typed in `./tiktokRules` (TikTokPostSettings). */
  settings?: Record<string, unknown>;
};

export type SocialPostTarget = {
  platform: SocialPlatform;
  /** Which account this row is about. Two accounts of the same platform can
   *  share a post, so the platform name alone no longer identifies a row.
   *  Absent on posts published before accounts were selectable. */
  accountKey?: string;
  /** The account's display name as it was AT PUBLISH TIME — denormalized by
   *  the backend, so the history still reads correctly after the account is
   *  disconnected. */
  accountName?: string;
  status: SocialPostStatus;
  /** Permalink once posted (mock link in V1). */
  link?: string;
  error?: string;
  /** Draft mode: the media sits in the creator's TikTok inbox, so there is no link. */
  sentToInbox?: boolean;
};

export type SocialPostRecord = {
  id: string;
  conversationId?: string;
  taskId?: string;
  scheduleAt?: string | null;
  /** The media as stored — 1 video or up to 35 photos, with the URLs the
   *  backend rewrote to its permanent proxy. The status card previews the
   *  first one, so a reload shows the post it is reporting on. */
  assets: AssetRef[];
  targets: SocialPostTarget[];
  /** What was submitted, per platform — the backend persists and echoes it
   *  (`drafts` on the wire), which is what lets the posting history show a
   *  post's own description after a reload. */
  drafts?: Partial<Record<SocialPlatform, SocialPostDraft>>;
  createdAt?: string;
};

/** One account a post publishes to. `platform` may be omitted server-side when
 *  `accountKey` is given, but it is sent anyway: it makes a payload readable in
 *  a network log without decoding the key. */
export type CreateSocialPostTarget = {
  platform: SocialPlatform;
  accountKey: string;
  /** Overrides the shared draft for this target only, FIELD BY FIELD. What it
   *  is for: `settings.privacy_level` cannot be shared between two accounts —
   *  a private TikTok account has no PUBLIC_TO_EVERYONE to offer. Unused by the
   *  compose UI today, which only offers privacy levels every selected account
   *  allows; the field exists so a per-account control needs no contract change. */
  draft?: Partial<SocialPostDraft>;
};

export type CreateSocialPostPayload = {
  /** 1..10 accounts, from `listSocialAccounts`. Several may share a platform. */
  targets: CreateSocialPostTarget[];
  /** The shared caption / hashtags / settings — one post, one description,
   *  every account. */
  draft: SocialPostDraft;
  /** 1..35 media items. A TikTok target takes one video OR a photo carousel,
   *  never a mix — `tiktokMediaShape` is the gate the card applies first. */
  assets: AssetRef[];
  scheduleAt?: string | null;
  conversationId?: string;
  taskId?: string;
};

type SocialPostTargetWire = {
  platform?: string;
  account_key?: string;
  account_name?: string;
  status?: string;
  link?: string;
  error?: string;
  sent_to_inbox?: boolean;
};

type SocialAssetWire = {
  source?: string;
  id?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

type SocialPostDraftWire = {
  caption?: string;
  hashtags?: string[];
  settings?: Record<string, unknown>;
};

type SocialPostWire = {
  id?: string;
  conversation_id?: string;
  task_id?: string;
  schedule_at?: string | null;
  asset_ref?: SocialAssetWire;
  assets?: SocialAssetWire[];
  targets?: SocialPostTargetWire[];
  drafts?: Record<string, SocialPostDraftWire>;
  created_at?: string;
};

type SocialPostListWire = {
  items?: SocialPostWire[];
};

const PLATFORMS: readonly SocialPlatform[] = ["tiktok", "instagram", "facebook"];
/** Every status the wire can carry. Exported so the i18n test can assert the
 *  catalog covers exactly these — a status with no copy renders its key path. */
export const SOCIAL_POST_STATUSES: readonly SocialPostStatus[] = [
  "scheduled",
  "preparing",
  "uploading",
  "processing",
  "posting",
  "posted",
  "failed",
];

/** Wire asset → AssetRef. `source` is a closed union on our side and an open
 *  string on the wire, so an unrecognised one lands as "generated" rather than
 *  widening the type for every consumer. */
function toAssetRef(wire: SocialAssetWire): AssetRef | null {
  if (!wire.url) return null;
  return {
    source: (wire.source as AssetRef["source"]) || "generated",
    ...(wire.id ? { id: wire.id } : {}),
    url: wire.url,
    ...(wire.meta ? { meta: wire.meta as AssetRef["meta"] } : {}),
  };
}

function toRecord(row: SocialPostWire): SocialPostRecord {
  const targets: SocialPostTarget[] = (row.targets ?? [])
    .filter((t): t is SocialPostTargetWire & { platform: string } =>
      Boolean(t.platform && (PLATFORMS as readonly string[]).includes(t.platform)),
    )
    .map((t) => ({
      platform: t.platform as SocialPlatform,
      accountKey: t.account_key || undefined,
      accountName: t.account_name || undefined,
      status: (SOCIAL_POST_STATUSES as readonly string[]).includes(t.status ?? "")
        ? (t.status as SocialPostStatus)
        : "posting",
      link: t.link || undefined,
      error: t.error || undefined,
      ...(t.sent_to_inbox ? { sentToInbox: true } : {}),
    }));

  // `assets` is the current shape; `asset_ref` is what a post created before
  // carousels carries, and what a backend older than them still answers with.
  const wireAssets =
    row.assets && row.assets.length > 0
      ? row.assets
      : row.asset_ref
        ? [row.asset_ref]
        : [];

  // Only the platforms we know, and only where something was actually written:
  // `drafts` is omitempty on the wire and absent from posts created before the
  // backend echoed it back.
  const drafts: Partial<Record<SocialPlatform, SocialPostDraft>> = {};
  for (const [platform, draft] of Object.entries(row.drafts ?? {})) {
    if (!(PLATFORMS as readonly string[]).includes(platform)) continue;
    drafts[platform as SocialPlatform] = {
      caption: draft.caption ?? "",
      hashtags: draft.hashtags ?? [],
      ...(draft.settings ? { settings: draft.settings } : {}),
    };
  }

  return {
    id: row.id ?? "",
    conversationId: row.conversation_id || undefined,
    taskId: row.task_id || undefined,
    scheduleAt: row.schedule_at ?? null,
    assets: wireAssets
      .map(toAssetRef)
      .filter((asset): asset is AssetRef => asset !== null),
    targets,
    ...(Object.keys(drafts).length > 0 ? { drafts } : {}),
    createdAt: row.created_at || undefined,
  };
}

export function isTerminalSocialPost(record: SocialPostRecord): boolean {
  return record.targets.every(
    (t) => t.status === "posted" || t.status === "failed",
  );
}

function toAssetWire(asset: AssetRef): SocialAssetWire {
  return {
    source: asset.source,
    id: asset.id,
    url: asset.url,
    meta: asset.meta as Record<string, unknown> | undefined,
  };
}

export async function createSocialPost(
  payload: CreateSocialPostPayload,
): Promise<SocialPostRecord> {
  const result = await cdpFetch<SocialPostWire>("/api/v1/social-posts", {
    method: "POST",
    auth: { kind: "auto" },
    body: {
      targets: payload.targets.map((target) => ({
        platform: target.platform,
        account_key: target.accountKey,
        draft: target.draft,
      })),
      draft: payload.draft,
      // `platforms` and `drafts` are the pre-accounts shape. Sent alongside
      // `targets` (which wins server-side) so a backend deployed before
      // account selection still publishes — through each platform's default
      // account, which is the only thing it could ever do.
      platforms: [...new Set(payload.targets.map((target) => target.platform))],
      drafts: Object.fromEntries(
        [...new Set(payload.targets.map((target) => target.platform))].map(
          (platform) => [platform, payload.draft],
        ),
      ),
      assets: payload.assets.map(toAssetWire),
      // The single-asset shape every earlier client sent. Kept beside `assets`
      // (which wins server-side) so a backend deployed before carousels still
      // publishes the first item instead of rejecting the post outright.
      asset_ref: payload.assets[0] ? toAssetWire(payload.assets[0]) : undefined,
      schedule_at: payload.scheduleAt ?? null,
      conversation_id: payload.conversationId,
      task_id: payload.taskId,
    },
  });
  return toRecord(result);
}

export async function getSocialPost(
  id: string,
  signal?: AbortSignal,
): Promise<SocialPostRecord> {
  const result = await cdpFetch<SocialPostWire>(
    `/api/v1/social-posts/${encodeURIComponent(id)}`,
    { auth: { kind: "auto" }, signal },
  );
  return toRecord(result);
}

export async function listSocialPosts(
  conversationId: string,
  signal?: AbortSignal,
): Promise<SocialPostRecord[]> {
  const result = await cdpFetch<SocialPostListWire>("/api/v1/social-posts", {
    searchParams: { conversation_id: conversationId },
    auth: { kind: "auto" },
    signal,
  });
  return (result.items ?? []).map(toRecord).filter((r) => r.id);
}
