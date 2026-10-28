// Cluega's official business contact channels, shared by the public contact
// page and authenticated product gates.

export type ContactChannelKey =
  | "email"
  | "line"
  | "linkedin"
  | "whatsapp"
  | "phone"
  | "skype"
  | "telegram"
  | "zalo"
  | "kakao"
  | "teams"
  | "zoom";

export type ContactEntry = {
  label: string;
  href?: string;
  hintKey?: string;
  titleKey?: string;
};

export type ContactChannel = {
  key: ContactChannelKey;
  entries: ContactEntry[];
  qr?: { value: string };
};

const BUSINESS_EMAILS = ["business@cluega.com", "business@cluegavn.com"];
const WHATSAPP_HONG_KONG = "+852 4627 8108";
const WHATSAPP_VIETNAM = "+84 038 225 2874";
const ZALO_URL = "https://zalo.me/509492267818217181";
const LINE_URL = "https://lin.ee/7zasCMw";
const LINKEDIN_URL = "https://www.linkedin.com/company/cluega/";

const BUSINESS_PHONE = "";
const SKYPE_ID = "";
const TELEGRAM_BUSINESS = "";
const KAKAO_TALK = "";
const MICROSOFT_TEAMS = "";
const ZOOM = "";

function whatsappHref(number: string) {
  return `https://wa.me/${number.replace(/\D/g, "").replace(/^840/, "84")}`;
}

const ALL_CONTACT_CHANNELS: ContactChannel[] = [
  {
    key: "email",
    entries: BUSINESS_EMAILS.map((address) => ({
      label: address,
      href: `mailto:${address}`,
    })),
  },
  {
    key: "whatsapp",
    entries: [
      {
        label: WHATSAPP_HONG_KONG,
        href: whatsappHref(WHATSAPP_HONG_KONG),
        titleKey: "contactSales.contact.channels.whatsappHongKong",
      },
      {
        label: WHATSAPP_VIETNAM,
        href: whatsappHref(WHATSAPP_VIETNAM),
        titleKey: "contactSales.contact.channels.whatsappVietnam",
      },
    ],
  },
  {
    key: "zalo",
    entries: [
      {
        label: ZALO_URL,
        href: ZALO_URL,
        hintKey: "contactSales.contact.hints.zalo",
      },
    ],
  },
  {
    key: "line",
    entries: [
      {
        label: LINE_URL,
        href: LINE_URL,
        hintKey: "contactSales.contact.hints.line",
      },
    ],
    qr: { value: LINE_URL },
  },
  {
    key: "linkedin",
    entries: [
      {
        label: LINKEDIN_URL,
        href: LINKEDIN_URL,
        hintKey: "contactSales.contact.hints.linkedin",
      },
    ],
  },
  {
    key: "phone",
    entries: [
      {
        label: BUSINESS_PHONE,
        href: `tel:${BUSINESS_PHONE.replace(/\s/g, "")}`,
      },
    ],
  },
  {
    key: "skype",
    entries: [{ label: SKYPE_ID, href: `skype:${SKYPE_ID}?chat` }],
  },
  { key: "telegram", entries: [{ label: TELEGRAM_BUSINESS }] },
  { key: "kakao", entries: [{ label: KAKAO_TALK }] },
  { key: "teams", entries: [{ label: MICROSOFT_TEAMS }] },
  { key: "zoom", entries: [{ label: ZOOM }] },
];

export const CONTACT_CHANNELS: ContactChannel[] = ALL_CONTACT_CHANNELS.map(
  (channel) => ({
    ...channel,
    entries: channel.entries.filter((entry) => entry.label !== ""),
  }),
).filter((channel) => channel.entries.length > 0);
