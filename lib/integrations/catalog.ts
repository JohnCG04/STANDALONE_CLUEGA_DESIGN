import { COMPOSIO_SERVICE_ID_BY_KEY } from "@/lib/integrations/composio.generated";
import {
  type CredentialField,
  type IntegrationAuthType,
  type IntegrationCatalogCategory,
  type IntegrationCategory,
  type IntegrationService,
  type IntegrationServiceID,
} from "@/lib/integrations/types";

const SERVICE_ID_BY_KEY: Record<string, IntegrationServiceID> = {
  tiktok_ads: "tiktokAds",
  tiktok_one: "tiktokOne",
  tiktok_account: "tiktokAccount",
  meta: "meta",
  google_ads: "googleAds",
  openai_ads: "openaiAds",
  google_analytics: "googleAnalytics",
  instagram: "instagram",
  search_console: "searchConsole",
  gmail: "gmail",
  lark: "lark",
  google_sheets: "googleSheets",
  shopify: "shopify",
  tiktok_shop: "tiktokShop",
  amazon: "amazon",
  whatsapp: "whatsapp",
  line: "line",
  telegram: "telegram",
  messenger: "messenger",
  tiktok_messenger: "tiktokMessenger",
  zalo: "zalo",
  // Attribution platforms (MMPs). Listed here so the catalog response survives
  // this whitelist; the section itself is rendered by AttributionPlatformSection,
  // which connects them through the attribution API rather than the generic flow.
  appsflyer: "appsflyer",
  adjust: "adjust",
  reyun: "reyun",
  singular: "singular",
  tenjin: "tenjin",
  // The user's own browser through the DogClaw extension.
  dogclaw: "dogclaw",
  // Cluega's own media generation pipeline, granted to bots as an MCP ability.
  cluega_media: "cluegaMedia",
  // Cluega IM, the social inbox, granted to bots and the AI Agent from its page.
  cluega_im: "cluegaIm",
  // Composio managed long-tail toolkits (generated from the marketing SSOT).
  ...COMPOSIO_SERVICE_ID_BY_KEY,
};

const CATEGORY_BY_KEY: Record<string, IntegrationCategory> = {
  marketing_advertising: "marketing",
  attribution_analytics: "attribution",
  work_collaboration: "collaboration",
  ecommerce_operations: "ecommerce",
  communication: "communication",
  // Composio long-tail categories.
  crm_sales: "crm",
  analytics_seo: "analytics",
  email_marketing: "email",
  content_design: "content",
  marketing_tools: "tools",
};

export function serviceIdFromKey(key: string): IntegrationServiceID | undefined {
  return SERVICE_ID_BY_KEY[key];
}

// Derived from SERVICE_ID_BY_KEY rather than written out again, so adding a
// toolkit stays a one-place edit and the two directions cannot drift.
const KEY_BY_SERVICE_ID: Partial<Record<IntegrationServiceID, string>> =
  Object.fromEntries(
    Object.entries(SERVICE_ID_BY_KEY).map(([key, id]) => [id, key]),
  );

/**
 * The backend catalog key (`tiktok_ads`) for a UI service id (`tiktokAds`).
 *
 * `parseCatalogResponse` keeps only the camelCase id, so anything that has to
 * name a service to the BACKEND — the chat request's pinned services, for
 * instance — needs this to get back to the key the catalog and the CDP prefix
 * registry both use. Returns undefined for an id with no catalog row.
 */
export function catalogKeyFromServiceId(
  id: IntegrationServiceID,
): string | undefined {
  return KEY_BY_SERVICE_ID[id];
}

export function categoryFromKey(key: string): IntegrationCategory | undefined {
  return CATEGORY_BY_KEY[key];
}

/**
 * Catalog category key -> the slug both UI i18n namespaces use for it
 * (`settings.connectors.categories.*` and
 * `suggestionPills.composer.integrationCategories.*`).
 *
 * Identical to categoryFromKey except for communication, which both namespaces
 * label "messaging". Shared so the settings Connectors list and the composer
 * popover cannot drift into labelling the same catalog category differently.
 * Returns undefined for an unmapped key so callers can fall back to the
 * catalog's own display_name.
 */
export function categoryI18nSlug(key: string): string | undefined {
  const category = categoryFromKey(key);
  return category === "communication" ? "messaging" : category;
}


type CatalogServiceDTO = {
  key: string;
  category_key?: string;
  display_name: string;
  description?: string;
  auth_type?: string;
  connect_enabled?: boolean;
  // The catalog row's own brand mark. `icon_key` is the backend's own icon
  // vocabulary and is deliberately unused - the frontend keys icons through
  // ICON_KEY_BY_SERVICE_ID - but it is declared so the wire contract is visible.
  icon_key?: string;
  icon_url?: string;
  // Present for api_key toolkits: the credential inputs and the scheme they
  // belong to. Absent for OAuth and channel_credentials services.
  config_schema?: {
    auth_scheme?: string;
    credential_fields?: {
      key: string;
      label: string;
      secret?: boolean;
      required?: boolean;
    }[];
  };
  routes?: {
    connect_url?: string;
    callback_url?: string;
    connections_url?: string;
    disconnect_url?: string;
    // Channel-forwarding rows (telegram, and lark next) declare this pair
    // instead of the OAuth quartet — see IntegrationServiceRoutes.
    routes_url?: string;
    issue_url?: string;
  };
  status?: string;
  /**
   * How many CONNECTIONS the tenant holds for this service — `status` is
   * derived from it server-side (see lib/integrations/disconnect.ts).
   *
   * Declared so the wire contract is visible, and deliberately NOT parsed: it
   * is not the number any screen wants. One connection is one Business Center
   * or OAuth grant and carries many ad accounts, so printing it under "N
   * accounts" said 4 where the account list showed 9. The count the design
   * asks for is the bound-ad-account count, which lives behind a request per
   * platform.
   */
  connection_count?: number;
};

type CatalogCategoryDTO = {
  key: string;
  display_name?: string;
  services: CatalogServiceDTO[];
};

type CatalogEnvelope = {
  data?: CatalogCategoryDTO[];
};

// The API value outranks every local asset, so a bad row must not be able to
// blank out a working icon without a frontend deploy. Only an absolute https URL
// or a root-relative path is accepted.
function sanitizeIconUrl(raw: string | undefined): string | undefined {
  const url = raw?.trim();
  if (!url) return undefined;
  return url.startsWith("https://") || url.startsWith("/") ? url : undefined;
}

function mapAuthType(raw: string | undefined): IntegrationAuthType {
  if (raw === "channel_credentials") return "channel_credentials";
  if (raw === "api_key") return "api_key";
  // Not folded into the oauth default: an extension platform has no
  // authorization endpoint, and defaulting it to oauth is what would make the
  // connect sheet offer a redirect that goes nowhere.
  if (raw === "extension") return "extension";
  // Built-in platform services have nothing to connect at all; defaulting them
  // to oauth would offer a redirect that goes nowhere.
  if (raw === "builtin") return "builtin";
  // Another Cluega product: no authorization endpoint either, and the oauth
  // default would send the connect sheet to one that does not exist.
  if (raw === "first_party") return "first_party";
  return "oauth";
}

// Reads the credential inputs from config_schema, defaulting the two booleans so
// a field the backend omits `required`/`secret` on still renders sanely.
function mapCredentialFields(
  schema: CatalogServiceDTO["config_schema"],
): CredentialField[] | undefined {
  const fields = schema?.credential_fields;
  if (!fields || fields.length === 0) return undefined;
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    secret: f.secret === true,
    required: f.required !== false,
  }));
}

function mapAuthScheme(
  schema: CatalogServiceDTO["config_schema"],
): "API_KEY" | "BASIC" | undefined {
  return schema?.auth_scheme === "BASIC"
    ? "BASIC"
    : schema?.auth_scheme === "API_KEY"
      ? "API_KEY"
      : undefined;
}

export function parseCatalogResponse(json: unknown): IntegrationService[] {
  const envelope = json as CatalogEnvelope;
  const categories = envelope?.data ?? [];
  const out: IntegrationService[] = [];

  for (const category of categories) {
    for (const dto of category.services ?? []) {
      const id = serviceIdFromKey(dto.key);
      const cat = categoryFromKey(dto.category_key ?? category.key);
      if (!id || !cat) continue;
      out.push({
        id,
        name: dto.display_name,
        description: dto.description,
        category: cat,
        iconUrl: sanitizeIconUrl(dto.icon_url),
        connectEnabled: dto.connect_enabled === true,
        authType: mapAuthType(dto.auth_type),
        credentialFields: mapCredentialFields(dto.config_schema),
        authScheme: mapAuthScheme(dto.config_schema),
        routes: {
          connectURL: dto.routes?.connect_url,
          callbackURL: dto.routes?.callback_url,
          connectionsURL: dto.routes?.connections_url,
          disconnectURL: dto.routes?.disconnect_url,
          routesURL: dto.routes?.routes_url,
          issueURL: dto.routes?.issue_url,
        },
        status: dto.status === "connected" ? "connected" : "disconnected",
      });
    }
  }

  return out;
}

export function parseCatalogCategories(json: unknown): IntegrationCatalogCategory[] {
  const envelope = json as CatalogEnvelope;
  const categories = envelope?.data ?? [];
  const out: IntegrationCatalogCategory[] = [];

  for (const category of categories) {
    const serviceIds: IntegrationServiceID[] = [];
    for (const dto of category.services ?? []) {
      const id = serviceIdFromKey(dto.key);
      if (id) serviceIds.push(id);
    }
    if (serviceIds.length === 0) continue;
    out.push({
      key: category.key,
      displayName: category.display_name ?? category.key,
      serviceIds,
    });
  }
  return out;
}


