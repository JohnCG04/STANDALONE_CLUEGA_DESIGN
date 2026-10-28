import { envOrDefault } from "@/lib/env";

export const siteConfig = {
  name: "Cluega",
  // Blank-aware on purpose: this feeds `new URL()` in constants/home.ts, and an
  // empty build arg used to crash the whole production build there.
  url: envOrDefault(process.env.NEXT_PUBLIC_SITE_URL, "https://dev.cluega.com"),
  // The Meta app the site belongs to, published as fb:app_id. Meta's Sharing
  // Debugger flags its absence, and App Review reads the privacy page through
  // that tool. An app id is public — it rides in every share link — so the
  // default can live here; the env var only exists to point a fork elsewhere.
  facebookAppId: envOrDefault(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID, "2794754377576092"),
  description:
    "Cluega packages insight, creative, distribution, and attribution into a full-lifecycle AI workflow, helping brands automate cross-platform marketing through conversation.",
  nav: {
    products: [
      { labelKey: "nav.products.ai", href: "/#platform" },
      { labelKey: "nav.products.im", href: "/#im" },
      { labelKey: "nav.products.art", href: "/#art" },
      { labelKey: "nav.products.cdp", href: "/#cdp" },
    ],
    utility: [
      { labelKey: "nav.utility.resources", href: "/#resources" },
      { labelKey: "nav.utility.solutions", href: "/#solutions" },
      { labelKey: "nav.utility.login", href: "/login" },
    ],
  },
};
