export type IntegrationCategory =
  | "marketing"
  | "attribution"
  | "crm"
  | "analytics"
  | "email"
  | "content"
  | "collaboration"
  | "ecommerce"
  | "tools"
  | "communication";

export const INTEGRATION_CATEGORY_ORDER: IntegrationCategory[] = [
  "marketing",
  "attribution",
  "crm",
  "analytics",
  "email",
  "content",
  "collaboration",
  "ecommerce",
  "tools",
  "communication",
];

export type IntegrationServiceID =
  | "tiktokAds"
  | "tiktokOne"
  // First-party TikTok creator account (Login Kit OAuth) for organic
  // publishing — video or a photo carousel — through the Content Posting API
  // and the social-posts flow. Distinct from the ad-ops "tiktokAds" grant and
  // from Composio's "tiktokContent".
  | "tiktokAccount"
  | "meta"
  | "googleAds"
  // OpenAI Ads (ChatGPT ads): one pasted API key per ad account, bound through
  // its own account API rather than /connections — see ./openaiAds.ts.
  | "openaiAds"
  | "googleAnalytics"
  | "instagram"
  | "searchConsole"
  | "gmail"
  | "lark"
  | "googleSheets"
  | "shopify"
  | "tiktokShop"
  | "amazon"
  | "whatsapp"
  | "line"
  | "telegram"
  | "messenger"
  | "tiktokMessenger"
  | "zalo"
  // Composio managed long-tail toolkits (see composio.generated.ts)
  | "reddit"
  | "linkedin"
  | "youtube"
  // Composio social publishing. Distinct from the ad-ops "meta" / "tiktokAds"
  // cards: these publish organic content, so they carry their own catalog keys
  // (facebook_pages / tiktok_content) and route slugs.
  | "facebookPages"
  | "tiktokContent"
  | "slack"
  | "discord"
  | "asana"
  | "googledrive"
  | "jira"
  | "zoho"
  | "zendesk"
  | "salesforce"
  | "intercom"
  | "hubspot"
  | "googleSearchConsole"
  | "omnisend"
  | "mailchimp"
  | "klaviyo"
  | "notion"
  | "googledocs"
  | "googlecalendar"
  | "figma"
  | "contentful"
  | "canva"
  | "airtable"
  | "typeform"
  | "stripe"
  | "calendly"
  // Composio managed long-tail toolkits connected by credential paste
  // (API key / BASIC), not OAuth redirect. See composio.generated.ts.
  | "close"
  | "moz"
  | "semrush"
  | "posthog"
  | "amplitude"
  | "ahrefs"
  | "mixpanel"
  | "sendgrid"
  | "mailerlite"
  | "activeCampaign"
  // Mobile measurement partners. They sit in the catalog so their section is
  // administered from the same tables as everything else, but they are NOT
  // connected through the generic flow — see AttributionPlatformSection.
  | "appsflyer"
  | "adjust"
  | "reyun"
  | "singular"
  | "tenjin"
  // The user's own Chrome, driven by the DogClaw extension. Not a vendor API:
  // there is no OAuth dance and no credential to store, so it carries the
  // "extension" auth type and reports connected from a live extension
  // heartbeat rather than from a connection row.
  | "dogclaw"
  // Cluega's own media generation pipeline (images, videos, audio,
  // storyboards, avatar clips). Not a vendor and not a device: nothing to
  // connect, always available — auth type "builtin", statically connected.
  | "cluegaMedia"
  // Cluega IM, the social inbox: a first-party product on the same identity.
  // Connecting it is the workspace's consent ("first_party"), and what each
  // bot or the AI Agent may read is granted on its own page.
  | "cluegaIm";

export type IntegrationStatus = "disconnected" | "connected";

// "api_key" covers every credential-paste toolkit (Composio managed). The
// concrete scheme (single API key vs BASIC username/password) is carried by
// IntegrationService.authScheme and the fields to render by credentialFields.
// "extension" is DOGCLAW: connecting means installing the Cluega extension and
// letting it pair, so there is no authorization request to start and nothing to
// paste — the connect sheet explains the install instead of collecting anything.
export type IntegrationAuthType =
  | "oauth"
  | "channel_credentials"
  | "api_key"
  | "extension"
  // The platform's own built-in services (Cluega Media): nothing to install
  // and nothing to authorize — the card never offers a connect flow.
  | "builtin"
  // Another Cluega product on the same sign-in (Cluega IM): no provider to
  // authorize with, so connecting is one confirmation, and the grants to bots
  // and the AI Agent are managed on the product's own page.
  | "first_party";

// One input the credential form must render, mirroring the backend catalog's
// config_schema.credential_fields[]. `secret` renders a password input.
export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

export interface IntegrationServiceRoutes {
  connectURL?: string;
  callbackURL?: string;
  connectionsURL?: string;
  disconnectURL?: string;
  // The channel-forwarding pair (Telegram today, Lark next). A catalog row
  // carries EITHER this or the OAuth connect/disconnect quartet above, never
  // both: forwarding a Pulse bot to a chat is a bind-token flow with no
  // tenant-owned connection to revoke. `lib/integrations/disconnect.ts` reads
  // which one is present to decide what Disconnect means for the service.
  routesURL?: string;
  issueURL?: string;
}

export interface IntegrationService {
  id: IntegrationServiceID;
  name: string;
  description?: string;
  category: IntegrationCategory;
  // The catalog row's own brand mark, when it carries one. Outranks the local
  // icon map so a platform added backend-side needs no frontend deploy.
  iconUrl?: string;
  connectEnabled: boolean;
  authType?: IntegrationAuthType;
  // Present only for api_key toolkits: the credential inputs to render and the
  // scheme they belong to, populated from the catalog's config_schema.
  credentialFields?: CredentialField[];
  authScheme?: "API_KEY" | "BASIC";
  routes: IntegrationServiceRoutes;
  status: IntegrationStatus;
}

// Mirrors domain.TikTokConnectionStatus / domain.FacebookConnectionStatus.
// `active` is the only state the disconnect endpoint accepts; the rest mean
// the connection is dead (user revoked, token expired, error) and need a
// reconnect rather than a disconnect.
export type IntegrationConnectionStatus =
  | "active"
  | "revoked"
  | "expired"
  | "error"
  | (string & {});

export interface IntegrationConnection {
  id: string;
  serviceID: IntegrationServiceID;
  accountLabel?: string;
  connectedAt: string;
  status: IntegrationConnectionStatus;
  tcmAccountCount?: number;
  tcmAccountSyncStatus?: "syncing" | "completed" | "failed" | (string & {});
  tcmAccountSyncError?: string;
}

export interface ConnectStartResponse {
  authorizationURL: string;
}

export interface IntegrationCatalogCategory {
  key: string;
  displayName: string;
  serviceIds: IntegrationServiceID[];
}
