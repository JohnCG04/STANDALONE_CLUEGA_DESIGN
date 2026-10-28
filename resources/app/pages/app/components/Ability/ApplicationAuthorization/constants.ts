import { ATTRIBUTION_PLATFORM_META } from "@/lib/cdp/attributionPlatformMeta";
import { faviconUrlForService } from "@/lib/integrations/brandDomains";
import type { IntegrationServiceID } from "@/lib/integrations/types";

const simpleIconBaseUrl = "https://cdn.simpleicons.org";
const applicationIconBaseUrl = "/Image";
// The colour brand marks already shipped for the settings connectors list.
// Preferred over a flat single-colour CDN glyph for the same brand, so both
// surfaces show the same mark and neither depends on a third-party host.
const brandIconBaseUrl = "/images";

export const MARKETING_SERVICE_IDS = new Set<IntegrationServiceID>([
  "tiktokAds",
  "tiktokOne",
  "meta",
  "googleAds",
  "openaiAds",
  "googleAnalytics",
  "instagram",
  "searchConsole",
]);

export const integrationIcons = {
  amazon: `${applicationIconBaseUrl}/amazon-icon.svg`,
  dogClaw: `${applicationIconBaseUrl}/integration-icon-dogclaw.png`,
  // First-party, like dogClaw: Cluega's own square mark, the one the artifacts
  // panel already uses. The wordmark in cluegaai.png is 1077x227 and would sit
  // squashed next to the square brand marks around it.
  cluegaMedia: `${brandIconBaseUrl}/logo_64_64.png`,
  cluegaIm: `${applicationIconBaseUrl}/integration-icon-cluega-im.svg`,
  gmail: `${applicationIconBaseUrl}/google-gmail-svgrepo-com.svg`,
  googleAds: `${applicationIconBaseUrl}/google-ads-svgrepo-com.svg`,
  openaiAds: `${applicationIconBaseUrl}/integration-icon-openai.svg`,
  googleAnalytics: `${applicationIconBaseUrl}/google-analytics-svgrepo-com.svg`,
  googleSheets: `${brandIconBaseUrl}/google-sheets.svg`,
  instagram: `${brandIconBaseUrl}/instagram.svg`,
  lark: `${brandIconBaseUrl}/lark.svg`,
  line: `${brandIconBaseUrl}/line-circle.svg`,
  messenger: `${brandIconBaseUrl}/messenger-circle.svg`,
  meta: `${applicationIconBaseUrl}/meta-color.svg`,
  searchConsole: `${applicationIconBaseUrl}/google-search-console-icon-seeklogo.svg`,
  shopify: `${brandIconBaseUrl}/shopify.svg`,
  shopline: `${applicationIconBaseUrl}/integration-icon-shopline.png`,
  telegram: `${brandIconBaseUrl}/telegram.svg`,
  tiktok: `${applicationIconBaseUrl}/tiktok-svgrepo-com.svg`,
  whatsapp: `${brandIconBaseUrl}/whatsapp.svg`,
  tiktokShop: `${applicationIconBaseUrl}/integration-icon-tiktok-shop.png`,
  zalo: `${applicationIconBaseUrl}/integration-icon-zalo.png`,
  // Composio managed long-tail toolkits (brand marks via the Simple Icons CDN).
  reddit: `${simpleIconBaseUrl}/reddit/FF4500`,
  // Composio social publishing. facebookPages/tiktokContent need explicit marks:
  // the id-derived Simple Icons slug ("facebookpages") does not exist.
  facebookPages: `${simpleIconBaseUrl}/facebook/0866FF`,
  tiktokContent: `${applicationIconBaseUrl}/tiktok-svgrepo-com.svg`,
  slack: `${applicationIconBaseUrl}/integration-icon-slack.svg`,
  discord: `${simpleIconBaseUrl}/discord/5865F2`,
  linkedin: `${applicationIconBaseUrl}/integration-icon-linkedin.svg`,
  youtube: `${simpleIconBaseUrl}/youtube/FF0000`,
  zoho: `${simpleIconBaseUrl}/zoho/C8202B`,
  zendesk: `${simpleIconBaseUrl}/zendesk/03363D`,
  salesforce: `${applicationIconBaseUrl}/integration-icon-salesforce.svg`,
  intercom: `${simpleIconBaseUrl}/intercom/6AFDEF`,
  hubspot: `${simpleIconBaseUrl}/hubspot/FF7A59`,
  googleSearchConsole: `${simpleIconBaseUrl}/googlesearchconsole/458CF5`,
  omnisend: `${applicationIconBaseUrl}/integration-icon-omnisend.png`,
  mailchimp: `${simpleIconBaseUrl}/mailchimp/FFE01B`,
  klaviyo: `${applicationIconBaseUrl}/integration-icon-klaviyo.svg`,
  notion: `${simpleIconBaseUrl}/notion/000000`,
  googledocs: `${simpleIconBaseUrl}/googledocs/4285F4`,
  googlecalendar: `${simpleIconBaseUrl}/googlecalendar/4285F4`,
  figma: `${simpleIconBaseUrl}/figma/F24E1E`,
  contentful: `${simpleIconBaseUrl}/contentful/2478CC`,
  canva: `${applicationIconBaseUrl}/integration-icon-canva.svg`,
  airtable: `${simpleIconBaseUrl}/airtable/18BFFF`,
  typeform: `${simpleIconBaseUrl}/typeform/262627`,
  stripe: `${simpleIconBaseUrl}/stripe/635BFF`,
  calendly: `${simpleIconBaseUrl}/calendly/006BFF`,
  asana: `${simpleIconBaseUrl}/asana/F06A6A`,
  googledrive: `${simpleIconBaseUrl}/googledrive/4285F4`,
  jira: `${simpleIconBaseUrl}/jira/0052CC`,
  // Composio credential-paste toolkits (API key / BASIC). Self-hosted because
  // the icon CDN carries none of these brands - see brandDomains.ts for the
  // favicon layer that catches any mark it drops in future.
  close: `${applicationIconBaseUrl}/integration-icon-close.png`,
  moz: `${applicationIconBaseUrl}/integration-icon-moz.png`,
  semrush: `${simpleIconBaseUrl}/semrush`,
  posthog: `${simpleIconBaseUrl}/posthog/1D4AFF`,
  amplitude: `${applicationIconBaseUrl}/integration-icon-amplitude.png`,
  ahrefs: `${applicationIconBaseUrl}/integration-icon-ahrefs.svg`,
  mixpanel: `${simpleIconBaseUrl}/mixpanel/7856FF`,
  sendgrid: `${applicationIconBaseUrl}/integration-icon-sendgrid.png`,
  mailerlite: `${applicationIconBaseUrl}/integration-icon-mailerlite.png`,
  activeCampaign: `${applicationIconBaseUrl}/integration-icon-activecampaign.png`,
  // Attribution platforms. Local files because the icon CDN carries none of the
  // five. Read from ATTRIBUTION_PLATFORM_META rather than copied, so the catalog
  // card and the attribution section cannot end up showing different marks for
  // the same platform.
  appsflyer: ATTRIBUTION_PLATFORM_META.APPSFLYER.icon,
  adjust: ATTRIBUTION_PLATFORM_META.ADJUST.icon,
  reyun: ATTRIBUTION_PLATFORM_META.REYUN.icon,
  singular: ATTRIBUTION_PLATFORM_META.SINGULAR.icon,
  tenjin: ATTRIBUTION_PLATFORM_META.TENJIN.icon,
};

/**
 * Ordered icon candidates for a catalog service, best first.
 *
 * BrandImage walks the list and drops to the next entry whenever one fails to
 * load, then renders initials once the list runs out. The layers:
 *   1. `apiIconUrl` - the catalog row's own icon_url, so a platform added
 *      backend-side needs no frontend deploy.
 *   2. the local/CDN mark in `integrationIcons`.
 *   3. the brand's favicon, for a CDN that drops a slug without notice.
 *
 * The single resolver for every surface that lists platforms from the catalog
 * (this page, the settings connectors list, the composer popover, the
 * new-project connector picker), so one platform cannot show two different
 * marks. Coverage is pinned by lib/integrations/serviceIcons.test.ts.
 */
export function iconSourcesForService(
  serviceID: IntegrationServiceID,
  apiIconUrl?: string,
): string[] {
  const iconKey = ICON_KEY_BY_SERVICE_ID[serviceID];
  const candidates = [
    // Trimmed here as well as in parseCatalogResponse: this is the public seam,
    // and a whitespace-only value is truthy enough to shadow a working mark.
    apiIconUrl?.trim() ?? "",
    iconKey ? integrationIcons[iconKey] : "",
    faviconUrlForService(serviceID),
  ];
  return [...new Set(candidates.filter(Boolean))];
}

/** First icon candidate, for the surfaces that hold a single string. */
export function iconSrcForService(
  serviceID: IntegrationServiceID,
  apiIconUrl?: string,
): string {
  return iconSourcesForService(serviceID, apiIconUrl)[0] ?? "";
}

export const ICON_KEY_BY_SERVICE_ID: Partial<Record<IntegrationServiceID, keyof typeof integrationIcons>> = {
  tiktokAds:       "tiktok",
  tiktokOne:       "tiktok",
  tiktokAccount:   "tiktok",
  meta:            "meta",
  googleAds:       "googleAds",
  openaiAds:       "openaiAds",
  googleAnalytics: "googleAnalytics",
  instagram:       "instagram",
  searchConsole:   "searchConsole",
  gmail:           "gmail",
  lark:            "lark",
  googleSheets:    "googleSheets",
  shopify:         "shopify",
  tiktokShop:      "tiktokShop",
  amazon:          "amazon",
  whatsapp:        "whatsapp",
  line:            "line",
  telegram:        "telegram",
  messenger:       "messenger",
  tiktokMessenger: "tiktok",
  zalo:            "zalo",
  dogclaw:         "dogClaw",
  cluegaMedia:     "cluegaMedia",
  cluegaIm:        "cluegaIm",
  // Composio managed long-tail toolkits (icon key == service id).
  reddit:              "reddit",
  facebookPages:       "facebookPages",
  tiktokContent:       "tiktokContent",
  slack:               "slack",
  discord:             "discord",
  linkedin:            "linkedin",
  youtube:             "youtube",
  zoho:                "zoho",
  zendesk:             "zendesk",
  salesforce:          "salesforce",
  intercom:            "intercom",
  hubspot:             "hubspot",
  googleSearchConsole: "googleSearchConsole",
  omnisend:            "omnisend",
  mailchimp:           "mailchimp",
  klaviyo:             "klaviyo",
  notion:              "notion",
  googledocs:          "googledocs",
  googlecalendar:      "googlecalendar",
  figma:               "figma",
  contentful:          "contentful",
  canva:               "canva",
  airtable:            "airtable",
  typeform:            "typeform",
  stripe:              "stripe",
  calendly:            "calendly",
  asana:               "asana",
  googledrive:         "googledrive",
  jira:                "jira",
  // Composio credential-paste toolkits (icon key == service id).
  close:               "close",
  moz:                 "moz",
  semrush:             "semrush",
  posthog:             "posthog",
  amplitude:           "amplitude",
  ahrefs:              "ahrefs",
  mixpanel:            "mixpanel",
  sendgrid:            "sendgrid",
  mailerlite:          "mailerlite",
  activeCampaign:      "activeCampaign",
  appsflyer:           "appsflyer",
  adjust:              "adjust",
  reyun:               "reyun",
  singular:            "singular",
  tenjin:              "tenjin",
};

export const integrationModalContent = {
  closeLabelKey: "appChat.integrations.modal.closeLabel",
  connectLabelKey: "appChat.integrations.actions.connect",
  detailsLabelKey: "appChat.integrations.modal.detailsLabel",
  policyLinks: [
    { labelKey: "appChat.integrations.modal.policyAds", href: "#" },
    { labelKey: "appChat.integrations.modal.policyDiscrimination", href: "#" },
  ],
};

/**
 * Services the PM's home board (Cluega 應用授權.html) does not list as cards of
 * their own. They are left off the All list unless the tenant already holds a
 * connection — hiding a live authorization would strand it. The catalog rows are
 * NOT disabled: Create Bot, Settings, the attribution API and the "Add account
 * authorization" picker read them too, which is where a hidden service is still
 * reached. TikTok One folds into the "TikTok" card; TikTok Account keeps its own.
 */
export const AUTH_HOME_HIDDEN_SERVICE_IDS: ReadonlySet<IntegrationServiceID> =
  new Set<IntegrationServiceID>([
    "appsflyer",
    "reyun",
    "singular",
    "tenjin",
    "amazon",
    "whatsapp",
    "line",
    "messenger",
    "tiktokMessenger",
    "zalo",
    "searchConsole",
    "reddit",
    "linkedin",
    "instagram",
  ]);

/**
 * The Account and One gates are folded into the "TikTok" card — never listed
 * on their own on the page, connected or not — and keep their own screens,
 * service ids and entry points. (The Add account popup still lists Account.)
 */
export const AUTH_HOME_FOLDED_SERVICE_IDS: ReadonlySet<IntegrationServiceID> =
  new Set<IntegrationServiceID>(["tiktokAccount", "tiktokOne"]);

/** The board names the TikTok Ads card plain "TikTok". */
export const AUTH_HOME_NAME_OVERRIDES: Partial<Record<IntegrationServiceID, string>> = {
  tiktokAds: "TikTok",
};
