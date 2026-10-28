"use client";

import { CdpApiError, cdpFetch, cdpFetchPaginated, cdpFetchRaw } from "@/lib/cdp";
import { getChatLocale } from "@/lib/ai-agent/cluega-session-auth";
import type { CdpPageMeta } from "@/lib/cdp/types";
import { isSnapshotFresh } from "@/lib/query/cachedSnapshot";
import {
  parseCatalogCategories,
  parseCatalogResponse,
} from "@/lib/integrations/catalog";
import {
  COMPOSIO_CONNECT_PATH_BY_SERVICE,
  COMPOSIO_CONNECTIONS_PATH_BY_SERVICE,
} from "@/lib/integrations/composio.generated";
import {
  OPENAI_ADS_SERVICE_ID,
  bindOpenAIAdsAccount,
  listOpenAIAdsAccounts,
  openAIAdsAccountToConnection,
  openAIAdsBindInputFrom,
  removeOpenAIAdsAccount,
  visibleOpenAIAdsAccounts,
} from "@/lib/integrations/openaiAds";
import type {
  TikTokCreatorInfo,
  TikTokPublishMode,
} from "@/lib/social-posts/tiktokRules";
import type {
  ConnectStartResponse,
  IntegrationCatalogCategory,
  IntegrationConnection,
  IntegrationService,
  IntegrationServiceID,
} from "@/lib/integrations/types";

// Fallback only. The authority is the catalog row's own routes.connect_url,
// which startConnect prefers (see lib/integrations/connect-lane.ts) — an entry
// here restates a route the backend owns, and a WRONG one is not inert: CDP
// mounts the Composio integration routes on the "/integrations/:slug" wildcard,
// so a request to a route it never registered lands on the Composio handler and
// comes back 502 "Upstream service unavailable". Google Analytics hit that (see
// the note below), then so did Telegram, Lark and six others.
//
// RULE: only add a key here for a route that exists in BACKEND_CLUEGA_CDP's
// router.go. Nothing else belongs in this map.
const CDP_CONNECT_PATH_BY_SERVICE: Partial<Record<IntegrationServiceID, string>> = {
  ...COMPOSIO_CONNECT_PATH_BY_SERVICE,
  tiktokAds:       "/api/v1/integrations/tiktok/connect",
  tiktokOne:       "/api/v1/integrations/tiktok-one/connect",
  tiktokAccount:   "/api/v1/integrations/tiktok-account/connect",
  meta:            "/api/v1/integrations/facebook/connect",
  googleAds:       "/api/v1/integrations/google-ads/connect",
  // googleAnalytics is deliberately absent: GA is a Composio toolkit, so its
  // route is /google_analytics/ (underscore, from the spread above). The old
  // first-party /google-analytics/ literal outlived the first-party handler and
  // shadowed the spread, so every Connect click 502'd on an unknown slug.
  instagram:       "/api/v1/integrations/instagram/connect",
  gmail:           "/api/v1/integrations/gmail/connect",
  googleSheets:    "/api/v1/integrations/google-sheets/connect",
  shopify:         "/api/v1/integrations/shopify/connect",
  tiktokShop:      "/api/v1/integrations/tiktok-shop/connect",
};

// Same rule as CDP_CONNECT_PATH_BY_SERVICE above: every key must name a
// /connections route that BACKEND_CLUEGA_CDP actually registers. `telegram` is
// here because its GET /connections is real (it returns the one platform-wide
// bot); it has no DELETE, which is why disconnect is decided by the catalog
// instead (lib/integrations/disconnect.ts).
const CDP_CONNECTIONS_PATH_BY_SERVICE: Partial<Record<IntegrationServiceID, string>> = {
  ...COMPOSIO_CONNECTIONS_PATH_BY_SERVICE,
  tiktokAds:       "/api/v1/integrations/tiktok/connections",
  tiktokOne:       "/api/v1/integrations/tiktok-one/connections",
  tiktokAccount:   "/api/v1/integrations/tiktok-account/connections",
  meta:            "/api/v1/integrations/facebook/connections",
  googleAds:       "/api/v1/integrations/google-ads/connections",
  instagram:       "/api/v1/integrations/instagram/connections",
  gmail:           "/api/v1/integrations/gmail/connections",
  googleSheets:    "/api/v1/integrations/google-sheets/connections",
  shopify:         "/api/v1/integrations/shopify/connections",
  tiktokShop:      "/api/v1/integrations/tiktok-shop/connections",
  telegram:        "/api/v1/integrations/telegram/connections",
};

type ConnectionDTO = {
  id: string;
  account_label?: string;
  display_name?: string;
  connected_at?: string;
  created_at?: string;
  status?: string;
  tcm_account_count?: number;
  tcm_account_sync_status?: string;
  tcm_account_sync_error?: string;
};

type ConnectStartDTO = {
  auth_url: string;
};

export type TikTokOneLabel = {
  labelID: string;
  labelName: string;
  labelGroup: string;
  labelType: string;
};

export type TikTokOneLabelsPage = {
  labels: TikTokOneLabel[];
  pagination: CdpPageMeta;
};

export type TikTokOneCountry = {
  code: string;
  name: string;
};

export type TikTokOneCountryGroup = {
  id: string;
  name: string;
  countries: TikTokOneCountry[];
};

export type TikTokOneAdVideo = {
  videoID: string;
  handleName: string;
  displayName: string;
  thumbnailURL: string;
  embedURL: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  videoViews: number;
  durationSeconds: number;
  performanceScore: number;
  trendScore: number;
  rankingReasons: string[];
  createTime: string;
  captionHashtags: string[];
  mentionedAccounts: string[];
  collaborationStatus: string;
  analysis?: TikTokOneAdVideoAnalysis;
  syncedAt: string;
};

export type TikTokOneAdVideoAnalysis = {
  summary: string;
  detailedDescription: string;
  contentSignals: string[];
  hashtagTopics: string[];
  mentionedAccounts: string[];
  metrics: TikTokOneAdVideoAnalysisMetrics;
  interpretation: TikTokOneAdVideoAnalysisInterpretation;
};

export type TikTokOneAdVideoAnalysisMetrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  engagementRate: number;
  performanceScore: number;
  trendScore: number;
  durationSeconds: number;
};

export type TikTokOneAdVideoAnalysisInterpretation = {
  likelyObjective: string;
  commercialIntent: string;
  viralitySignals: string[];
  rankingReasons: string[];
  collaborationMode: string;
};

export type TikTokOneAdVideoStatus =
  | "pending"
  | "syncing"
  | "completed"
  | "failed"
  | "rate_limited"
  | (string & {});

export type TikTokOneTrendObjective =
  | "ALL"
  | "AWARENESS"
  | "TRAFFIC"
  | "ENGAGEMENT"
  | "LEAD_GENERATION"
  | "CONVERSION"
  | "APP_PROMOTION"
  | "SALES";

export type TikTokOneAdVideosResult = {
  status: TikTokOneAdVideoStatus;
  videos: TikTokOneAdVideo[];
  lastError?: string;
  pagination: CdpPageMeta;
};

type TikTokOneLabelDTO = {
  label_id: string;
  label_name: string;
  label_group: string;
  label_type: string;
};

type TikTokOneTrendCategoryDTO = {
  label_id: string;
  label_name: string;
};

type TikTokOneTrendCategoriesDTO = {
  items: TikTokOneTrendCategoryDTO[];
};

type TikTokOneCountryDTO = {
  code: string;
  name: string;
};

type TikTokOneCountryGroupDTO = {
  id: string;
  name: string;
  countries: TikTokOneCountryDTO[];
};

type TikTokOneAdVideoDTO = {
  video_id: string;
  handle_name: string;
  display_name: string;
  thumbnail_url: string;
  embed_url: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  video_views: number;
  duration_seconds: number;
  performance_score: number;
  trend_score: number;
  ranking_reasons?: string[];
  create_time: string;
  caption_hashtags: string[];
  mentioned_accounts: string[];
  collaboration_status: string;
  analysis?: {
    summary?: string;
    detailed_description?: string;
    content_signals?: string[];
    hashtag_topics?: string[];
    mentioned_accounts?: string[];
    metrics?: {
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      favorites?: number;
      engagement_rate?: number;
      performance_score?: number;
      trend_score?: number;
      duration_seconds?: number;
    };
    interpretation?: {
      likely_objective?: string;
      commercial_intent?: string;
      virality_signals?: string[];
      ranking_reasons?: string[];
      collaboration_mode?: string;
    };
  };
  synced_at: string;
};

type TikTokOneAdVideosDTO = {
  status: TikTokOneAdVideoStatus;
  videos: TikTokOneAdVideoDTO[];
  last_error?: string;
};

function mapConnection(
  serviceID: IntegrationServiceID,
  dto: ConnectionDTO,
): IntegrationConnection {
  const tcmAccountCount = dto.tcm_account_count;
  const tcmAccountSyncStatus =
    tcmAccountCount !== undefined && tcmAccountCount > 0
      ? "completed"
      : dto.tcm_account_sync_status;
  return {
    id: dto.id,
    serviceID,
    accountLabel: dto.account_label ?? dto.display_name,
    connectedAt: dto.connected_at ?? dto.created_at ?? new Date().toISOString(),
    status: dto.status ?? "active",
    tcmAccountCount,
    tcmAccountSyncStatus,
    tcmAccountSyncError: dto.tcm_account_sync_error,
  };
}

function mapTikTokOneLabel(dto: TikTokOneLabelDTO): TikTokOneLabel {
  return {
    labelID: dto.label_id,
    labelName: dto.label_name,
    labelGroup: dto.label_group,
    labelType: dto.label_type,
  };
}

function mapTikTokOneAdVideo(dto: TikTokOneAdVideoDTO): TikTokOneAdVideo {
  return {
    videoID: dto.video_id,
    handleName: dto.handle_name,
    displayName: dto.display_name,
    thumbnailURL: dto.thumbnail_url,
    embedURL: dto.embed_url,
    caption: dto.caption,
    likes: dto.likes,
    comments: dto.comments,
    shares: dto.shares,
    favorites: dto.favorites,
    videoViews: dto.video_views,
    durationSeconds: dto.duration_seconds,
    performanceScore: dto.performance_score,
    trendScore: dto.trend_score,
    rankingReasons: dto.ranking_reasons ?? [],
    createTime: dto.create_time,
    captionHashtags: dto.caption_hashtags ?? [],
    mentionedAccounts: dto.mentioned_accounts ?? [],
    collaborationStatus: dto.collaboration_status,
    analysis: dto.analysis
      ? {
          summary: dto.analysis.summary ?? "",
          detailedDescription: dto.analysis.detailed_description ?? "",
          contentSignals: dto.analysis.content_signals ?? [],
          hashtagTopics: dto.analysis.hashtag_topics ?? [],
          mentionedAccounts: dto.analysis.mentioned_accounts ?? [],
          metrics: {
            views: dto.analysis.metrics?.views ?? 0,
            likes: dto.analysis.metrics?.likes ?? 0,
            comments: dto.analysis.metrics?.comments ?? 0,
            shares: dto.analysis.metrics?.shares ?? 0,
            favorites: dto.analysis.metrics?.favorites ?? 0,
            engagementRate: dto.analysis.metrics?.engagement_rate ?? 0,
            performanceScore: dto.analysis.metrics?.performance_score ?? 0,
            trendScore: dto.analysis.metrics?.trend_score ?? 0,
            durationSeconds: dto.analysis.metrics?.duration_seconds ?? 0,
          },
          interpretation: {
            likelyObjective: dto.analysis.interpretation?.likely_objective ?? "",
            commercialIntent: dto.analysis.interpretation?.commercial_intent ?? "",
            viralitySignals: dto.analysis.interpretation?.virality_signals ?? [],
            rankingReasons: dto.analysis.interpretation?.ranking_reasons ?? [],
            collaborationMode: dto.analysis.interpretation?.collaboration_mode ?? "",
          },
        }
      : undefined,
    syncedAt: dto.synced_at,
  };
}

export async function fetchCatalog(): Promise<{
  services: IntegrationService[];
  categories: IntegrationCatalogCategory[];
}> {
  const data = await cdpFetch<unknown>("/api/v1/integrations/catalog", {
    auth: { kind: "auto" },
    // Without locale the backend resolves category names and service
    // descriptions to English, which is what left the "/" palette's Services
    // rows in English next to fully localized chrome.
    searchParams: { locale: getChatLocale() },
  });
  const services = parseCatalogResponse({ data });
  const categories = parseCatalogCategories({ data });
  return { services, categories };
}

export async function startConnect(
  serviceID: IntegrationServiceID,
  returnURL: string,
  // The catalog row's own connect route, when it declares one. Preferred over
  // the map below, which restated routes the backend owns and so could claim a
  // route CDP never registered — see lib/integrations/connect-lane.ts.
  declaredPath?: string,
  // Extra query the connect route reads — e.g. Meta's `profile=publishing`,
  // which asks for posting to Pages instead of the ads permissions.
  extraParams?: Record<string, string>,
): Promise<ConnectStartResponse> {
  const path = declaredPath ?? CDP_CONNECT_PATH_BY_SERVICE[serviceID];
  if (!path) {
    throw new CdpApiError({
      status: 400,
      code: "unsupported_connect_flow",
      message: "This integration does not use OAuth connect",
    });
  }
  const { json } = await cdpFetchRaw(path, {
    method: "GET",
    searchParams: { ...extraParams, return_url: returnURL },
    auth: { kind: "auto" },
  });
  const raw = json as { data?: Partial<ConnectStartDTO>; auth_url?: unknown } | undefined;
  const authURL = raw?.data?.auth_url ?? raw?.auth_url;
  if (typeof authURL !== "string" || !authURL) {
    throw new CdpApiError({
      status: 502,
      code: "invalid_response",
      message: "CDP did not return auth_url",
    });
  }
  return { authorizationURL: authURL };
}

export type TiktokOneFromAdsResult = { connectionID: string; status: string };

// `POST /integrations/tiktok-one/connect-from-ads`: creates the TikTok One
// connection from the tenant's TikTok Ads authorization, so the user signs in to
// TikTok once. The call has no redirect — it answers with the connection.
// Rejected with 404 when the tenant has no active Ads connection, 403 when the
// Ads token lacks the TikTok One permission, and `tiktok_token_expired` (401)
// when that token ran out; callers fall back to the authorize flow for all three.
export async function connectTiktokOneFromAds(): Promise<TiktokOneFromAdsResult> {
  const dto = await cdpFetch<{ connection_id: string; status: string }>(
    "/api/v1/integrations/tiktok-one/connect-from-ads",
    { method: "POST", auth: { kind: "auto" } },
  );
  return { connectionID: dto.connection_id, status: dto.status };
}

// Credential-paste connect for api_key toolkits (Composio managed). POSTs the
// user-entered credential values to the service's connections route and returns
// the created connection — no auth_url, no redirect. The field set is dynamic,
// driven by the catalog's config_schema.
export async function connectWithCredentials(
  serviceID: IntegrationServiceID,
  body: { values: Record<string, string>; displayName?: string },
): Promise<IntegrationConnection> {
  // OpenAI Ads has no connections endpoint: each key IS one ad account, bound
  // through its own account API (contract C1, see ./openaiAds.ts). Branched
  // here, the one seam both credential sheets submit through.
  if (serviceID === OPENAI_ADS_SERVICE_ID) {
    const account = await bindOpenAIAdsAccount(openAIAdsBindInputFrom(body));
    return openAIAdsAccountToConnection(account);
  }
  const path = CDP_CONNECTIONS_PATH_BY_SERVICE[serviceID];
  if (!path) {
    throw new CdpApiError({
      status: 400,
      code: "unsupported_connect_flow",
      message: "This integration does not expose a connections endpoint",
    });
  }
  const dto = await cdpFetch<ConnectionDTO>(path, {
    method: "POST",
    auth: { kind: "auto" },
    body: {
      values: body.values,
      display_name: body.displayName?.trim() || undefined,
    },
  });
  return mapConnection(serviceID, dto);
}

export async function listConnections(
  serviceID: IntegrationServiceID,
  signal?: AbortSignal,
): Promise<IntegrationConnection[]> {
  // The generic readers (Pulse bot's plugin dialog) list through here; for
  // OpenAI Ads the rows are its accounts, minus the removed ones.
  if (serviceID === OPENAI_ADS_SERVICE_ID) {
    const accounts = await listOpenAIAdsAccounts(signal);
    return visibleOpenAIAdsAccounts(accounts).map(openAIAdsAccountToConnection);
  }
  const path = CDP_CONNECTIONS_PATH_BY_SERVICE[serviceID];
  if (!path) {
    throw new CdpApiError({
      status: 400,
      code: "unsupported_connect_flow",
      message: "This integration does not expose a connections endpoint",
    });
  }
  const dtos = await cdpFetch<ConnectionDTO[]>(path, {
    auth: { kind: "auto" },
    signal,
  });
  return (dtos ?? []).map((dto) => mapConnection(serviceID, dto));
}

// One advertiser as returned by CDP
// `GET /api/v1/integrations/tiktok/connections/{id}/advertisers`. Identity-only
// today — balance/spend land later once the CDP backend exposes them.
export type TiktokAdvertiserDTO = {
  id: string;
  advertiser_id: string;
  advertiser_name: string;
  currency?: string;
  timezone?: string;
  status?: string;
  role?: string;
  auth_binding_status?: string;
};

function tiktokAdvertisersPath(connectionID: string, suffix = ""): string {
  return `/api/v1/integrations/tiktok/connections/${encodeURIComponent(connectionID)}/advertisers${suffix}`;
}

// Resolves the active TikTok connection id (or the newest one). The bound
// account list and bind/unbind all scope to this single connection.
export async function resolveActiveTiktokConnectionId(
  signal?: AbortSignal,
): Promise<string | null> {
  const connections = await listConnections("tiktokAds", signal);
  const active =
    connections.find((c) => c.status === "active") ?? connections[0];
  return active?.id ?? null;
}

// ── TikTok Account (Login Kit) — the organic publishing grant ───────────────
// Distinct from tiktokAds above: publishing runs on the creator's own
// video.publish grant, and the Content Posting API demands a LIVE creator-info
// read before every direct post — never a cached one.

type TikTokCreatorInfoDTO = {
  username?: string;
  nickname?: string;
  avatar_url?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
  unaudited?: boolean;
  publish_mode?: string;
};

const PUBLISH_MODES: readonly string[] = ["live", "draft", "mock"];

/**
 * `GET /integrations/tiktok-account/connections/{id}/creator-info` — whose
 * account the post lands on, which privacy levels it may carry, and which
 * interactions the creator has switched off. TikTok requires this read
 * immediately before the compose UI is shown, so it is never cached.
 *
 * Throws CdpApiError: `410` when the connection is no longer active, `401`
 * when TikTok rejected the token (the row is flipped to `expired` server-side),
 * `403 tiktok_creator_cannot_post` / `429 rate_limited` when TikTok holds the creator back.
 */
export async function getTikTokCreatorInfo(
  connectionID: string,
  signal?: AbortSignal,
): Promise<TikTokCreatorInfo> {
  const dto = await cdpFetch<TikTokCreatorInfoDTO>(
    `/api/v1/integrations/tiktok-account/connections/${encodeURIComponent(connectionID)}/creator-info`,
    { auth: { kind: "auto" }, signal },
  );
  return {
    username: dto?.username ?? "",
    nickname: dto?.nickname ?? "",
    avatarUrl: dto?.avatar_url || undefined,
    privacyLevelOptions: dto?.privacy_level_options ?? [],
    commentDisabled: dto?.comment_disabled === true,
    duetDisabled: dto?.duet_disabled === true,
    stitchDisabled: dto?.stitch_disabled === true,
    maxVideoPostDurationSec: dto?.max_video_post_duration_sec ?? 0,
    unaudited: dto?.unaudited === true,
    // An unknown mode is left out, so the card falls back to its generic caveat.
    ...(dto?.publish_mode && PUBLISH_MODES.includes(dto.publish_mode)
      ? { publishMode: dto.publish_mode as TikTokPublishMode }
      : {}),
  };
}

// Bound advertisers (the tenant actively manages) — the main account list.
export async function listTiktokAdvertisers(
  connectionID: string,
  signal?: AbortSignal,
): Promise<TiktokAdvertiserDTO[]> {
  const dtos = await cdpFetch<TiktokAdvertiserDTO[]>(
    tiktokAdvertisersPath(connectionID),
    { auth: { kind: "auto" }, signal },
  );
  return dtos ?? [];
}

// One Business Center as returned by CDP
// `GET .../tiktok/connections/{id}/business-centers`.
export type TiktokBusinessCenterDTO = {
  id: string;
  bc_id: string;
  bc_name: string;
  role?: string;
};

export async function listTiktokBusinessCenters(
  connectionID: string,
  signal?: AbortSignal,
): Promise<TiktokBusinessCenterDTO[]> {
  const dtos = await cdpFetch<TiktokBusinessCenterDTO[]>(
    `/api/v1/integrations/tiktok/connections/${encodeURIComponent(connectionID)}/business-centers`,
    { auth: { kind: "auto" }, signal },
  );
  return dtos ?? [];
}

// Advertisers under one Business Center (live from TikTok) — the bind modal list.
// Items already bound carry auth_binding_status = "AUTHORIZED".
export async function listTiktokBcAdvertisers(
  connectionID: string,
  bcID: string,
  signal?: AbortSignal,
): Promise<TiktokAdvertiserDTO[]> {
  const dtos = await cdpFetch<TiktokAdvertiserDTO[]>(
    `/api/v1/integrations/tiktok/connections/${encodeURIComponent(connectionID)}/business-centers/${encodeURIComponent(bcID)}/advertisers`,
    { auth: { kind: "auto" }, signal },
  );
  return dtos ?? [];
}

export type BindAdvertiserItem = { advertiser_id: string; advertiser_name: string };

export async function bindTiktokAdvertisers(
  connectionID: string,
  bcID: string,
  advertisers: BindAdvertiserItem[],
): Promise<void> {
  await cdpFetch<unknown>(tiktokAdvertisersPath(connectionID, "/bind"), {
    method: "POST",
    auth: { kind: "auto" },
    body: { bc_id: bcID, advertisers },
  });
}

export async function unbindTiktokAdvertisers(
  connectionID: string,
  advertiserIDs: string[],
): Promise<void> {
  await cdpFetch<unknown>(tiktokAdvertisersPath(connectionID, "/unbind"), {
    method: "POST",
    auth: { kind: "auto" },
    body: { advertiser_ids: advertiserIDs },
  });
}

// Re-fetches advertisers + Business Centers from TikTok and upserts them.
export async function syncTiktokConnection(connectionID: string): Promise<void> {
  await cdpFetch<unknown>(tiktokAdvertisersPath(connectionID, "/sync"), {
    method: "POST",
    auth: { kind: "auto" },
  });
}

// --- Google Ads: account selection ---
// Connecting the Google account only discovers which ad accounts the grant can
// reach; the user then selects which of them Cluega may manage. The selection is
// saved wholesale (see saveGoogleAdsAdvertiserSelection), and only selected
// accounts reach the AI.

function googleAdsConnectionsPath(connectionID: string, suffix = ""): string {
  return `/api/v1/integrations/google-ads/connections/${encodeURIComponent(connectionID)}${suffix}`;
}

// Resolves the active Google Ads connection id (or the newest one).
export async function resolveActiveGoogleAdsConnectionId(
  signal?: AbortSignal,
): Promise<string | null> {
  const connections = await listConnections("googleAds", signal);
  const active =
    connections.find((c) => c.status === "active") ?? connections[0];
  return active?.id ?? null;
}

// One selectable ad account. managerCustomerID is the MCC it sits under (empty =
// directly accessible) and doubles as the group key in the selection UI; it must
// be echoed back on save so the binding keeps the right login-customer-id.
export type GoogleAdsBindableAdvertiser = {
  customerID: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  status: string;
  managerCustomerID: string;
  managerName: string;
  bound: boolean;
};

type GoogleAdsBindableAdvertiserDTO = {
  customer_id: string;
  descriptive_name?: string;
  currency_code?: string;
  time_zone?: string;
  status?: string;
  manager_customer_id?: string;
  manager_name?: string;
  bound?: boolean;
};

// Every ad account the connection can operate, grouped-ready and flagged with the
// current selection — the account-selection list (no MCC has to be picked first).
export async function listGoogleAdsBindableAdvertisers(
  connectionID: string,
  signal?: AbortSignal,
): Promise<GoogleAdsBindableAdvertiser[]> {
  const dtos = await cdpFetch<GoogleAdsBindableAdvertiserDTO[]>(
    googleAdsConnectionsPath(connectionID, "/bindable-advertisers"),
    { auth: { kind: "auto" }, signal },
  );
  return (dtos ?? []).map((d) => ({
    customerID: d.customer_id,
    descriptiveName: d.descriptive_name ?? "",
    currencyCode: d.currency_code ?? "",
    timeZone: d.time_zone ?? "",
    status: d.status ?? "",
    managerCustomerID: d.manager_customer_id ?? "",
    managerName: d.manager_name ?? "",
    bound: d.bound ?? false,
  }));
}

// Can this ad account actually run ads? Classified server-side from a live
// account read (one of its inputs is a 403, not a field), so the client renders
// it rather than inferring it. Mirrors domain.GoogleAdsAdvertiserReadiness.
//   NOT_APPLICABLE — a manager account (MCC); it never serves ads itself
//   TEST           — Google test account: API-usable, no billing, no real traffic
//   READY          — enabled production account
//   NEEDS_BILLING  — production account Google refuses until its setup is finished
//   UNAVAILABLE    — canceled / suspended / closed production account
//   UNKNOWN        — Google returned nothing usable for it
export type GoogleAdsAdvertiserReadiness =
  | "NOT_APPLICABLE"
  | "TEST"
  | "READY"
  | "NEEDS_BILLING"
  | "UNAVAILABLE"
  | "UNKNOWN";

// One account in the connection's discovered inventory — every account the grant
// can reach, managers included, regardless of whether it is bound. Distinct from
// GoogleAdsBindableAdvertiser, which deliberately excludes managers because you
// bind an MCC's children, never the MCC.
export type GoogleAdsInventoryAdvertiser = {
  customerID: string;
  descriptiveName: string;
  currencyCode: string;
  manager: boolean;
};

type GoogleAdsInventoryAdvertiserDTO = {
  customer_id: string;
  descriptive_name?: string;
  currency_code?: string;
  manager?: boolean;
};

const GOOGLE_ADS_READINESS_VALUES: readonly GoogleAdsAdvertiserReadiness[] = [
  "NOT_APPLICABLE",
  "TEST",
  "READY",
  "NEEDS_BILLING",
  "UNAVAILABLE",
  "UNKNOWN",
];

// An unrecognised value (older backend, or a state added server-side first)
// degrades to UNKNOWN instead of leaking a raw enum into the table.
export function toGoogleAdsReadiness(
  raw: string | undefined,
): GoogleAdsAdvertiserReadiness {
  const found = GOOGLE_ADS_READINESS_VALUES.find((v) => v === raw);
  return found ?? "UNKNOWN";
}

// The connection's full discovered account inventory (cached server-side at OAuth
// callback / resync — no live Google call).
export async function listGoogleAdsAdvertisers(
  connectionID: string,
  signal?: AbortSignal,
): Promise<GoogleAdsInventoryAdvertiser[]> {
  const dtos = await cdpFetch<GoogleAdsInventoryAdvertiserDTO[]>(
    googleAdsConnectionsPath(connectionID, "/advertisers"),
    { auth: { kind: "auto" }, signal },
  );
  return (dtos ?? []).map((d) => ({
    customerID: d.customer_id,
    descriptiveName: d.descriptive_name ?? "",
    currencyCode: d.currency_code ?? "",
    manager: d.manager ?? false,
  }));
}

export type GoogleAdsSelectionItem = {
  customer_id: string;
  descriptive_name: string;
  manager_customer_id: string;
};

// Replaces the selection wholesale: accounts sent become authorized, accounts
// left out are unbound. An empty array clears the selection.
export async function saveGoogleAdsAdvertiserSelection(
  connectionID: string,
  advertisers: GoogleAdsSelectionItem[],
  // Tags the accounts this save newly authorizes. The server requires it only
  // when the selection adds at least one account, and decides that from stored
  // state — sending it for a remove-only save is harmless but pointless.
  sourceCompanyID?: string,
): Promise<void> {
  await cdpFetch<unknown>(
    googleAdsConnectionsPath(connectionID, "/advertisers/selection"),
    {
      method: "PUT",
      auth: { kind: "auto" },
      body: sourceCompanyID
        ? { advertisers, source_company_id: sourceCompanyID }
        : { advertisers },
    },
  );
}

export type GoogleAdsBoundAdvertiser = {
  customerID: string;
  descriptiveName: string;
  managerCustomerID: string;
  // ISO timestamp of when management over the account was granted. Empty for
  // bindings written before the backend surfaced it.
  authorizedAt: string;
};

export type FacebookBoundAdAccount = {
  accountID: string;
  name: string;
  businessID: string;
  currency: string;
  accountStatus: number;
  authorizedAt: string;
};

export type FacebookPage = {
  id: string;
  pageID: string;
  name: string;
  category: string;
  tasks: string[];
  pictureURL: string;
};

export type FacebookPageLinkedAdAccount = {
  accountID: string;
  name: string;
  currency: string;
  accountStatus: number;
  linkSource: string;
  firstSeenAt: string;
  lastSeenAt: string;
  periodSpend: number | null;
  reportAvailable: boolean;
};

export type FacebookPageLinkedAdAccounts = {
  pageID: string;
  name: string;
  category: string;
  pictureURL: string;
  adAccounts: FacebookPageLinkedAdAccount[];
};

export type FacebookPageLinkedAdAccountsResult = {
  pages: FacebookPageLinkedAdAccounts[];
  listingComplete?: boolean;
  reportStatus: string;
  message: string;
};

type FacebookPageDTO = {
  id?: string;
  facebook_page_id?: string;
  name?: string;
  category?: string;
  tasks?: unknown;
  picture_url?: string;
};

export function parseFacebookPages(rows: FacebookPageDTO[] | null | undefined): FacebookPage[] {
  return (rows ?? [])
    .filter((row) => Boolean(row.facebook_page_id?.trim()))
    .map((row) => ({
      id: row.id?.trim() || row.facebook_page_id!.trim(),
      pageID: row.facebook_page_id!.trim(),
      name: row.name?.trim() ?? "",
      category: row.category?.trim() ?? "",
      tasks: Array.isArray(row.tasks)
        ? row.tasks.filter((task): task is string => typeof task === "string")
        : [],
      pictureURL: row.picture_url?.trim() ?? "",
    }));
}

// Reads the Page inventory already synchronized by the existing Meta OAuth
// connection. Page-token material is intentionally not part of this response.
export async function listFacebookPages(
  connectionID: string,
  signal?: AbortSignal,
): Promise<FacebookPage[]> {
  const data = await cdpFetch<FacebookPageDTO[]>(
    `/api/v1/integrations/facebook/connections/${encodeURIComponent(connectionID)}/pages`,
    { auth: { kind: "auto" }, signal },
  );
  return parseFacebookPages(data);
}

type FacebookPageLinkedAdAccountDTO = {
  facebook_ad_account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
  link_source?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  period_spend?: number | null;
  report_available?: boolean;
};

type FacebookPageWithLinkedAdAccountsDTO = {
  facebook_page_id?: string;
  name?: string;
  category?: string;
  picture_url?: string;
  ad_accounts?: FacebookPageLinkedAdAccountDTO[];
};

type FacebookPageLinkedAdAccountsDTO = {
  pages?: FacebookPageWithLinkedAdAccountsDTO[];
  listing_complete?: boolean;
  report_status?: string;
  message?: string;
};

export function parseFacebookPageLinkedAdAccounts(
  data: FacebookPageLinkedAdAccountsDTO | null | undefined,
): FacebookPageLinkedAdAccountsResult {
  return {
    pages: (data?.pages ?? [])
      .filter((page) => Boolean(page.facebook_page_id?.trim()))
      .map((page) => ({
        pageID: page.facebook_page_id!.trim(),
        name: page.name?.trim() ?? "",
        category: page.category?.trim() ?? "",
        pictureURL: page.picture_url?.trim() ?? "",
        adAccounts: (page.ad_accounts ?? [])
          .filter((account) =>
            Boolean(account.facebook_ad_account_id?.trim()),
          )
          .map((account) => ({
            accountID: account.facebook_ad_account_id!.trim(),
            name: account.name?.trim() ?? "",
            currency: account.currency?.trim() ?? "",
            accountStatus: account.account_status ?? 0,
            linkSource: account.link_source?.trim() ?? "",
            firstSeenAt: account.first_seen_at ?? "",
            lastSeenAt: account.last_seen_at ?? "",
            periodSpend: account.period_spend ?? null,
            reportAvailable: account.report_available ?? false,
          })),
      })),
    listingComplete: data?.listing_complete,
    reportStatus: data?.report_status?.trim() ?? "",
    message: data?.message?.trim() ?? "",
  };
}

// Reads the cached Page-to-Ad-Account relationship. This call is deliberately
// separate from listFacebookPages so a failure in the new relation endpoint
// never hides the existing Page inventory.
export async function listFacebookPageLinkedAdAccounts(
  connectionID: string,
  signal?: AbortSignal,
): Promise<FacebookPageLinkedAdAccountsResult> {
  const data = await cdpFetch<FacebookPageLinkedAdAccountsDTO>(
    `/api/v1/integrations/facebook/connections/${encodeURIComponent(connectionID)}/pages/linked-ad-accounts`,
    { auth: { kind: "auto" }, signal },
  );
  return parseFacebookPageLinkedAdAccounts(data);
}

type FacebookBoundAdAccountDTO = {
  facebook_ad_account_id?: string;
  name?: string;
  business_id?: string;
  currency?: string;
  account_status?: number;
  authorized_at?: string;
};

type FacebookBoundAdAccountsDTO = {
  ad_accounts?: FacebookBoundAdAccountDTO[];
};

// Reads the existing Meta binding inventory. This is the authorization source
// for the Meta Account List; account settings are loaded separately as a
// tenant-local overlay and never replace this list.
export async function listFacebookBoundAdAccounts(
  connectionID: string,
  signal?: AbortSignal,
): Promise<FacebookBoundAdAccount[]> {
  const data = await cdpFetch<FacebookBoundAdAccountsDTO>(
    `/api/v1/integrations/facebook/connections/${encodeURIComponent(connectionID)}/bound-ad-accounts`,
    { auth: { kind: "auto" }, signal },
  );
  return (data?.ad_accounts ?? [])
    .filter((row) => Boolean(row.facebook_ad_account_id?.trim()))
    .map((row) => ({
      accountID: row.facebook_ad_account_id!.trim(),
      name: row.name?.trim() ?? "",
      businessID: row.business_id?.trim() ?? "",
      currency: row.currency?.trim() ?? "",
      accountStatus: row.account_status ?? 0,
      authorizedAt: row.authorized_at ?? "",
    }));
}

type GoogleAdsBoundAdvertiserDTO = {
  customer_id: string;
  descriptive_name?: string;
  manager_customer_id?: string;
  authorized_at?: string;
};

// The tenant's bound (actively-managed) ad accounts — the account-list table.
export async function listGoogleAdsBoundAdvertisers(
  connectionID: string,
  signal?: AbortSignal,
): Promise<GoogleAdsBoundAdvertiser[]> {
  const dtos = await cdpFetch<GoogleAdsBoundAdvertiserDTO[]>(
    googleAdsConnectionsPath(connectionID, "/bound-advertisers"),
    { auth: { kind: "auto" }, signal },
  );
  return (dtos ?? []).map((d) => ({
    customerID: d.customer_id,
    descriptiveName: d.descriptive_name ?? "",
    managerCustomerID: d.manager_customer_id ?? "",
    authorizedAt: d.authorized_at ?? "",
  }));
}

export type GoogleAdsAdvertiserMetrics = {
  customerID: string;
  currencyCode: string;
  /** Cost in micros as Google reports it — divide by 1e6 for the currency. */
  costMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Metrics could not be read for this account (distinct from a real zero). */
  unavailable: boolean;
  /**
   * Why the account can or cannot run ads. Read live alongside the metrics — it
   * is the explanation for `unavailable`, and the only place a not-yet-enabled
   * account is detectable (Google reports it as a 403, never as a field).
   */
  readiness: GoogleAdsAdvertiserReadiness;
};

type GoogleAdsMetricsWindowDTO = {
  from?: string;
  to?: string;
  advertisers?: {
    customer_id: string;
    currency_code?: string;
    cost_micros?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    unavailable?: boolean;
    readiness?: string;
  }[];
};

// Per-account delivery totals for a date window (YYYY-MM-DD). Omitting the window
// lets the server default to the trailing 7 days. Read live from Google Ads, so
// this is an at-a-glance figure, not a billing record.
export async function listGoogleAdsAdvertiserMetrics(
  connectionID: string,
  window: { from?: string; to?: string } = {},
  signal?: AbortSignal,
): Promise<GoogleAdsAdvertiserMetrics[]> {
  const searchParams: Record<string, string> = {};
  if (window.from) searchParams.from = window.from;
  if (window.to) searchParams.to = window.to;
  const dto = await cdpFetch<GoogleAdsMetricsWindowDTO>(
    googleAdsConnectionsPath(connectionID, "/advertisers/metrics"),
    { method: "GET", searchParams, auth: { kind: "auto" }, signal },
  );
  return (dto?.advertisers ?? []).map((a) => ({
    customerID: a.customer_id,
    currencyCode: a.currency_code ?? "",
    costMicros: a.cost_micros ?? 0,
    impressions: a.impressions ?? 0,
    clicks: a.clicks ?? 0,
    conversions: a.conversions ?? 0,
    unavailable: a.unavailable ?? false,
    readiness: toGoogleAdsReadiness(a.readiness),
  }));
}

export type GoogleAdsResyncResult = {
  total: number;
  added: string[];
  removed: string[];
  stillBound: number;
};

type GoogleAdsResyncResultDTO = {
  total?: number;
  added?: string[];
  removed?: string[];
  still_bound?: number;
};

// Re-discovers which ad accounts the existing grant can reach and refreshes the
// cached inventory — no re-authorization, and the bound selection is untouched.
export async function resyncGoogleAdsAdvertisers(
  connectionID: string,
): Promise<GoogleAdsResyncResult> {
  const dto = await cdpFetch<GoogleAdsResyncResultDTO>(
    googleAdsConnectionsPath(connectionID, "/advertisers/resync"),
    { method: "POST", auth: { kind: "auto" } },
  );
  return {
    total: dto?.total ?? 0,
    added: dto?.added ?? [],
    removed: dto?.removed ?? [],
    stillBound: dto?.still_bound ?? 0,
  };
}

// Drops a single account from the selection (the account list's row action).
// Saving the whole selection goes through saveGoogleAdsAdvertiserSelection.
export async function unbindGoogleAdsAdvertisers(
  connectionID: string,
  customerIDs: string[],
): Promise<void> {
  await cdpFetch<unknown>(
    googleAdsConnectionsPath(connectionID, "/advertisers/unbind"),
    {
      method: "POST",
      auth: { kind: "auto" },
      body: { customer_ids: customerIDs },
    },
  );
}

export async function disconnectConnection(
  serviceID: IntegrationServiceID,
  connectionID: string,
): Promise<void> {
  if (serviceID === OPENAI_ADS_SERVICE_ID) {
    await removeOpenAIAdsAccount(connectionID);
    return;
  }
  const base = CDP_CONNECTIONS_PATH_BY_SERVICE[serviceID];
  if (!base) {
    throw new CdpApiError({
      status: 400,
      code: "unsupported_connect_flow",
      message: "This integration does not expose a connections endpoint",
    });
  }
  const path = `${base}/${encodeURIComponent(connectionID)}`;
  await cdpFetch<unknown>(path, {
    method: "DELETE",
    auth: { kind: "auto" },
  });
}

export async function listTikTokOneLabels(
  connectionID: string,
): Promise<TikTokOneLabel[]> {
  const { data } = await cdpFetchPaginated<TikTokOneLabelDTO[], CdpPageMeta>(
    `/api/v1/integrations/tiktok-one/connections/${encodeURIComponent(connectionID)}/labels`,
    {
      searchParams: {
        group: "industry",
        type: "SEARCH",
        page_no: 1,
        limit: 80,
      },
      auth: { kind: "auto" },
    },
  );
  return data.map(mapTikTokOneLabel);
}

/**
 * Reference data too, and cached per requested page rather than in one bucket: the
 * filter bars ask for page 1, while `listTikTokOneGlobalLabels` below walks every
 * page to build a full list. One entry per (group, page, limit) keeps those from
 * evicting each other.
 *
 * Same terms as the countries above — success only, no team key.
 */
const LABEL_PAGE_FRESH_MS = 30 * 60_000;

const labelPageCache = new Map<string, { value: TikTokOneLabelsPage; at: number }>();

export async function listTikTokOneGlobalLabelsPage(
  labelGroup: string | undefined,
  pageNo: number,
  limit: number,
): Promise<TikTokOneLabelsPage> {
  const cacheKey = JSON.stringify([labelGroup ?? null, pageNo, limit]);
  const cached = labelPageCache.get(cacheKey);
  if (cached && isSnapshotFresh(cached.at, Date.now(), LABEL_PAGE_FRESH_MS)) {
    return cached.value;
  }

  const { data, pagination } = await cdpFetchPaginated<TikTokOneLabelDTO[], CdpPageMeta>(
    "/api/v1/integrations/tiktok-one/labels",
    {
      searchParams: {
        group: labelGroup,
        type: "SEARCH",
        page_no: pageNo,
        limit,
      },
      auth: { kind: "auto" },
    },
  );
  const page = { labels: data.map(mapTikTokOneLabel), pagination };
  labelPageCache.set(cacheKey, { value: page, at: Date.now() });
  return page;
}

export async function listTikTokOneGlobalLabels(labelGroup?: string): Promise<TikTokOneLabel[]> {
  const limit = 100;
  const firstPage = await listTikTokOneGlobalLabelsPage(labelGroup, 1, limit);
  const labels = [...firstPage.labels];
  const totalPages = firstPage.pagination.total_pages;
  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    const page = await listTikTokOneGlobalLabelsPage(labelGroup, pageNo, limit);
    labels.push(...page.labels);
  }
  return labels;
}

export async function listTikTokOneRankingLabels(
  connectionID: string,
): Promise<TikTokOneLabel[]> {
  const { data } = await cdpFetchPaginated<TikTokOneLabelDTO[], CdpPageMeta>(
    `/api/v1/integrations/tiktok-one/connections/${encodeURIComponent(connectionID)}/ranking-labels`,
    {
      searchParams: {
        group: "industry",
        page_no: 1,
        limit: 80,
      },
      auth: { kind: "auto" },
    },
  );
  return data.map(mapTikTokOneLabel);
}

export async function listTikTokOneTrendCategories(): Promise<TikTokOneLabel[]> {
  const data = await cdpFetch<TikTokOneTrendCategoriesDTO>(
    "/api/v1/integrations/tiktok-one/trends/categories",
    { auth: { kind: "auto" } },
  );
  return data.items.map((item) => ({
    labelID: item.label_id,
    labelName: item.label_name,
    labelGroup: "industry",
    labelType: "SEARCH",
  }));
}

/**
 * How long the country list is reused.
 *
 * The set of countries TikTok will discover creators in is reference data — it does
 * not change while anyone is using the product. Both callers (the Insights filter
 * bar and the ad-video library) sit on pages that remount on every `/app/*`
 * navigation, so without this it was re-fetched on every visit to either.
 *
 * Long, but not forever: a page left open for an afternoon should still pick up a
 * change eventually. Only a SUCCESS is remembered, so a failed request cannot leave
 * the country dropdown empty for the rest of the session.
 *
 * No team key: this goes through `@/lib/cdp`'s fetch, which sends no X-Team-Id, so
 * the answer is not tenant-scoped.
 */
const COUNTRIES_FRESH_MS = 30 * 60_000;

let countriesCache: { value: TikTokOneCountryGroup[]; at: number } | null = null;

export async function listTikTokOneCountries(): Promise<TikTokOneCountryGroup[]> {
  if (countriesCache && isSnapshotFresh(countriesCache.at, Date.now(), COUNTRIES_FRESH_MS)) {
    return countriesCache.value;
  }

  const groups = await cdpFetch<TikTokOneCountryGroupDTO[]>(
    "/api/v1/integrations/tiktok-one/creator-discovery/countries",
    { auth: { kind: "auto" } },
  );
  const mapped = groups.map((group) => ({
    id: group.id,
    name: group.name,
    countries: group.countries.map((country) => ({
      code: country.code,
      name: country.name,
    })),
  }));
  countriesCache = { value: mapped, at: Date.now() };
  return mapped;
}

export async function listTikTokOneAdVideos({
  industryLabelID,
  countryCode,
  search,
  includeAnalysis,
  pageNo,
  limit,
}: {
  industryLabelID?: string;
  countryCode?: string;
  search?: string;
  includeAnalysis?: boolean;
  pageNo: number;
  limit: number;
}): Promise<TikTokOneAdVideosResult> {
  const { data, pagination } = await cdpFetchPaginated<
    TikTokOneAdVideosDTO,
    CdpPageMeta
  >(
    "/api/v1/integrations/tiktok-one/ad-videos",
    {
      searchParams: {
        industry_label_id: industryLabelID,
        country_code: countryCode,
        search,
        include_analysis: includeAnalysis ? "json" : undefined,
        page_no: pageNo,
        limit,
      },
      auth: { kind: "auto" },
    },
  );
  return {
    status: data.status,
    videos: data.videos.map(mapTikTokOneAdVideo),
    lastError: data.last_error,
    pagination,
  };
}

export async function listTikTokOneTrendVideos({
  industryLabelID,
  countryCode,
  objective,
  search,
  includeAnalysis,
  pageNo,
  limit,
}: {
  industryLabelID: string;
  countryCode: string;
  objective?: TikTokOneTrendObjective;
  search?: string;
  includeAnalysis?: boolean;
  pageNo: number;
  limit: number;
}): Promise<TikTokOneAdVideosResult> {
  const { data, pagination } = await cdpFetchPaginated<
    TikTokOneAdVideosDTO,
    CdpPageMeta
  >(
    "/api/v1/integrations/tiktok-one/trends/videos",
    {
      searchParams: {
        industry_label_id: industryLabelID,
        country_code: countryCode,
        objective,
        search,
        include_analysis: includeAnalysis ? "json" : undefined,
        page_no: pageNo,
        limit,
      },
      auth: { kind: "auto" },
    },
  );
  return {
    status: data.status,
    videos: data.videos.map(mapTikTokOneAdVideo),
    lastError: data.last_error,
    pagination,
  };
}

// ── Telegram & Agents — see lib/integrations/telegram.ts ──────────────────
export type {
  TelegramConnection,
  TelegramBindingToken,
  TelegramBinding,
} from "@/lib/integrations/telegram";
export {
  listTelegramConnections,
  issueTelegramBindingToken,
  listTelegramBindings,
  CLUEGA_AGENT_ID,
} from "@/lib/integrations/telegram";
