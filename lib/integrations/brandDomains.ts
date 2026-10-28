import type { IntegrationServiceID } from "@/lib/integrations/types";

const faviconBaseUrl = "https://www.google.com/s2/favicons";

/**
 * Official domain per catalog service, used to build the last automatic icon
 * layer before initials.
 *
 * Every service whose primary mark is a third-party CDN URL needs an entry:
 * Simple Icons drops slugs without notice (Canva's 404 is what surfaced the
 * missing-icon bug), and a 404 there must degrade to the brand's own favicon
 * rather than to a grey "CA" box. Services whose primary mark is a local file
 * under public/ need no entry — a committed asset cannot 404, and
 * lib/integrations/serviceIcons.test.ts pins that every local path exists.
 *
 * Adding a platform: add its domain here and the fallback works with no other
 * code change.
 */
export const BRAND_DOMAIN_BY_SERVICE_ID: Partial<
  Record<IntegrationServiceID, string>
> = {
  googleSheets: "sheets.google.com",
  googledocs: "docs.google.com",
  googlecalendar: "calendar.google.com",
  openaiAds: "openai.com",
  googleSearchConsole: "search.google.com",
  reddit: "reddit.com",
  facebookPages: "facebook.com",
  slack: "slack.com",
  asana: "asana.com",
  googledrive: "drive.google.com",
  jira: "atlassian.com",
  discord: "discord.com",
  youtube: "youtube.com",
  zoho: "zoho.com",
  zendesk: "zendesk.com",
  intercom: "intercom.com",
  hubspot: "hubspot.com",
  mailchimp: "mailchimp.com",
  klaviyo: "klaviyo.com",
  notion: "notion.so",
  figma: "figma.com",
  contentful: "contentful.com",
  airtable: "airtable.com",
  typeform: "typeform.com",
  stripe: "stripe.com",
  calendly: "calendly.com",
  semrush: "semrush.com",
  posthog: "posthog.com",
  mixpanel: "mixpanel.com",
};

/** Favicon URL for a service, or "" when the service has no domain mapped. */
export function faviconUrlForService(serviceID: IntegrationServiceID): string {
  const domain = BRAND_DOMAIN_BY_SERVICE_ID[serviceID];
  return domain ? `${faviconBaseUrl}?domain=${domain}&sz=128` : "";
}
