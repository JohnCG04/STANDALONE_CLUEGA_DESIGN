import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Roboto } from "next/font/google";

import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { HOME_VIEWPORT } from "@/constants";
import { siteConfig } from "@/config/site";
import { ThemeInitializer } from "@/components/theme/ThemeInitializer";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ScrollbarReveal } from "@/components/layout/ScrollbarReveal";
import { DEFAULT_LANGUAGE, getHtmlLang, isLanguageCode, LANGUAGE_COOKIE_KEY } from "@/i18n/config";
import { THEME_COOKIE_KEY } from "@/lib/cookie-consent";
import { resolveThemeCookieClass } from "@/lib/theme-preference";

import "@dogclaw-ad/workflow-agent/styles.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// Inter is loaded without its `vietnamese` subset, so tone-marked glyphs (ộ, ữ,
// ằ…) fell through to whatever the OS offered — mismatched shapes mid-word.
// Roboto carries that subset and takes over the whole tree when lang is vi
// (see the `body:lang(vi)` rule in globals.css).
const roboto = Roboto({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-roboto",
  display: "swap",
});

// The Design app sits behind auth; marketing SEO lives in the landing site.
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Cluega Design",
    template: "%s | Cluega",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  alternates: {
    canonical: "/flow",
  },
  openGraph: { 
    type: "website",
    locale: "en_US",
    url: "/flow",
    siteName: siteConfig.name,
    title: "Cluega Design",
    description: siteConfig.description,
    images: [
      {
        url: "/images/cluegaai.png",
        width: 1077,
        height: 227,
        alt: "Cluega AI work assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cluega Design",
    description: siteConfig.description,
    images: ["/images/cluegaai.png"],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = HOME_VIEWPORT;

const googleTagManagerId = process.env.NEXT_PUBLIC_GTM_ID || "GTM-5CZ56P99";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedLang = cookieStore.get(LANGUAGE_COOKIE_KEY)?.value;
  const initialLang = isLanguageCode(storedLang) ? storedLang : DEFAULT_LANGUAGE;
  const initialThemeClass = resolveThemeCookieClass(
    cookieStore.get(THEME_COOKIE_KEY)?.value,
  );

  return (
    <html
      className={`${inter.variable} ${roboto.variable} ${initialThemeClass}`}
      lang={getHtmlLang(initialLang)}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <head>
        <ThemeScript />
        <GoogleTagManager containerId={googleTagManagerId} />
      </head>
      {/* Browser extensions inject attrs (bis_register, __processed_*) into <body>
          before hydration; suppressHydrationWarning on <html> doesn't cascade here. */}
      <body suppressHydrationWarning>
        <ThemeInitializer />
        <ScrollbarReveal />
        {children}
      </body>
    </html>
  );
}
