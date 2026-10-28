import type { Metadata, Viewport } from "next";
import type { LucideIcon } from "lucide-react";
import { Bell, Bot, Cloud, Inbox, Mail, MessageSquare } from "lucide-react";

import { siteConfig } from "@/config/site";

/** The site's default share card (1200×630, the size Meta and X both crop to). */
export const HOME_OG_IMAGE = {
  url: "/og-cluega.png",
  width: 1200,
  height: 630,
  alt: "Cluega — Full-Lifecycle AI Work Assistant",
};

export const HOME_METADATA: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Cluega | Full-Lifecycle AI Work Assistant",
    template: "%s | Cluega",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  facebook: { appId: siteConfig.facebookAppId },
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  // NO canonical and NO og:url here. This object is the root layout's metadata,
  // and Next hands both to every page that does not set its own — so every page
  // on the site declared itself a duplicate of the homepage. Meta's crawler
  // followed og:url and read /legal/privacy AS the homepage, which is why the
  // WhatsApp app review could not find the privacy policy. Pages state their
  // own URL through `pageMetadata` (lib/page-metadata.ts); the homepage too.
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: siteConfig.name,
    title: "Cluega | Full-Lifecycle AI Work Assistant",
    description:
      "A results-driven, full-lifecycle AI work assistant supporting large language models, social ads, messaging, and MCP automation.",
    // /hero-cluega.png never made it into apps/landing/public after the
    // monorepo split: it answered 404 as HTML, which Meta reported as an
    // invalid image content type. og-cluega.png is a 1200×630 card.
    images: [HOME_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cluega | Full-Lifecycle AI Work Assistant",
    description: "Turn brand insight, creative, distribution, and attribution from manual work into automated decisions.",
    images: [HOME_OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const HOME_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101722",
};

export const HOME_MODELS = [
   {
    src: "/images/cluega-ai.svg",
    alt: "Cluega AI",
    width: 1280,
    height: 348,
    className: "h-7",
  },
  {
    src: "/images/open-ai.svg",
    alt: "OpenAI",
    width: 1280,
    height: 348,
    className: "h-7",
  },
  {
    src: "/images/gemini.svg",
    alt: "Gemini",
    width: 1280,
    height: 348,
    className: "h-12",
  },
  {
    src: "/images/claude.svg",
    alt: "Claude",
    width: 1280,
    height: 348,
    className: "h-8",
  },
  {
    src: "/images/llama.svg",
    alt: "Llama",
    width: 1280,
    height: 348,
    className: "h-7",
  },
  {
    src: "/images/minimax.svg",
    alt: "MiniMax",
    width: 1280,
    height: 348,
    className: "h-7",
  },
  {
    src: "/images/deepseek.svg",
    alt: "DeepSeek",
    width: 1280,
    height: 348,
    className: "h-7",
  },
] as const;

export const HOME_MODEL_URLS = HOME_MODELS.map((model) => model.src);
export const HOME_MODEL_NAMES = HOME_MODELS.map((model) => model.alt);

export const HOME_SUPPORT_ICONS: LucideIcon[] = [Inbox, Bell, MessageSquare, Bot, Mail, Cloud];

export const HOME_PLATFORMS = [
  "Facebook",
  "TikTok",
  "Instagram",
  "Google Ads",
  "Amazon",
  "Shopify",
  "X Ads",
  "LinkedIn Ads",
  "Reddit Ads",
  "Shopee Ads",
];

export const HOME_MESSENGERS = ["WhatsApp", "Facebook", "TikTok", "Instagram", "Zalo", "Line"];
