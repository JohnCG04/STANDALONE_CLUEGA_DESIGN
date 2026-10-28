export const DEFAULT_LANGUAGE = "zh";
export const LANGUAGE_COOKIE_KEY = "cluega-language";
export const LANGUAGE_STORAGE_KEY = LANGUAGE_COOKIE_KEY;

export const languages = [
  { code: "zh", label: "繁體中文", htmlLang: "zh-Hant" },
  { code: "vn", label: "Tiếng Việt", htmlLang: "vi" },
  { code: "en", label: "English", htmlLang: "en" },
  { code: "th", label: "ไทย", htmlLang: "th" },
] as const;

export type LanguageCode = (typeof languages)[number]["code"];

const htmlLangByCode = new Map<LanguageCode, string>(
  languages.map((language) => [language.code, language.htmlLang]),
);

export function getHtmlLang(lang: LanguageCode) {
  return htmlLangByCode.get(lang) ?? "zh-Hant";
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && languages.some((language) => language.code === value);
}

/* ---------- URL-based locales ----------
 * Public pages carry the language in the path:
 *   /contact-sales      → English (no prefix — the site default)
 *   /cn/contact-sales   → 繁體中文
 *   /vn/contact-sales   → Tiếng Việt
 *   /th/contact-sales   → ไทย
 * `proxy.ts` strips the prefix, rewrites to the unprefixed route, and passes the
 * resolved language to the layouts through LANGUAGE_HEADER. Note the Chinese URL
 * segment is "cn" while the internal language code stays "zh".
 */

/** Language served by public URLs that carry no locale prefix. */
export const DEFAULT_PUBLIC_LANGUAGE: LanguageCode = "en";

/** Request header `proxy.ts` uses to hand the resolved language to the layouts. */
export const LANGUAGE_HEADER = "x-cluega-language";

const urlSegmentByLanguage: Record<LanguageCode, string | null> = {
  en: null,
  zh: "cn",
  vn: "vn",
  th: "th",
};

const languageByUrlSegment = new Map<string, LanguageCode>(
  (Object.entries(urlSegmentByLanguage) as [LanguageCode, string | null][])
    .filter((entry): entry is [LanguageCode, string] => entry[1] !== null)
    .map(([code, segment]) => [segment, code]),
);

/** URL prefix for a language, or null for the unprefixed default (English). */
export function getLanguageUrlSegment(lang: LanguageCode): string | null {
  return urlSegmentByLanguage[lang];
}

/** Language a leading path segment selects, or null when it isn't a locale segment. */
export function getLanguageForUrlSegment(segment: string): LanguageCode | null {
  return languageByUrlSegment.get(segment) ?? null;
}

/**
 * Split a locale prefix off a pathname.
 * `/cn/pricing` → `{ lang: "zh", pathname: "/pricing" }`
 * `/pricing`    → `{ lang: "en", pathname: "/pricing" }`
 */
export function splitLanguageFromPathname(pathname: string): {
  lang: LanguageCode;
  pathname: string;
} {
  const [, firstSegment = "", ...rest] = pathname.split("/");
  const lang = getLanguageForUrlSegment(firstSegment);

  if (!lang) {
    return { lang: DEFAULT_PUBLIC_LANGUAGE, pathname };
  }

  const stripped = `/${rest.join("/")}`;

  return { lang, pathname: stripped === "/" ? "/" : stripped.replace(/\/+$/, "") };
}

/** Re-prefix a pathname for a language (idempotent — an existing prefix is replaced). */
export function localizePathname(pathname: string, lang: LanguageCode): string {
  const { pathname: base } = splitLanguageFromPathname(pathname);
  const segment = getLanguageUrlSegment(lang);

  if (!segment) {
    return base;
  }

  return base === "/" ? `/${segment}` : `/${segment}${base}`;
}

/**
 * Localize an href. Only site-relative paths are touched — external URLs,
 * `mailto:`/`tel:`, protocol-relative URLs and bare `#hash` links pass through,
 * and any query string or hash is preserved.
 */
export function localizeHref(href: string, lang: LanguageCode): string {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return href;
  }

  const suffixStart = href.search(/[?#]/);
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : href.slice(suffixStart);

  return `${localizePathname(pathname, lang)}${suffix}`;
}

/**
 * Route prefixes that are NOT part of the localized public site: the product app,
 * auth flows, internal tools and API routes. These keep their bare paths and fall
 * back to the cookie for language.
 */
const NON_LOCALIZED_PATH_PREFIXES = [
  "/api",
  "/app",
  // The Design workspace (Flow, the workflow editor, the policy page): the
  // product app, bare paths like /app.
  "/flow",
  "/workflow",
  "/policy",
  "/login",
  "/setup-password",
  "/my-browser",
  "/my-computer",
  "/preview",
  "/test",
  "/tip-editor-host",
  // Public shared-chat link. Kept bare rather than localized: it is a
  // capability URL handed out one-off (chat, social post), not a page a
  // visitor navigates to by language — same treatment as /login.
  "/share",
  // Public shared-report link (PRD §4.5), share.cluega.com/r/<code>. Same
  // reasoning as /share, and one more: the link is PERMANENT, so a locale
  // segment would be baked into it forever and the reader could never be moved
  // off whatever language the owner happened to be using when they shared.
  "/r",
  // Published artifact page, /p/<tenant-id>/<token>. A permanent capability
  // link like /r, so the same reasoning keeps a locale segment out of it.
  "/p",
  // 自定義郵箱 confirmation page. Opened from a link in a mail by somebody who
  // has no Cluega account and no stored language, so there is no locale to
  // resolve and nothing to remember — and the URL is one-shot, so a redirect to
  // a locale segment would only be a hop that can fail between a mail client
  // and a browser. The page reads its own language from the browser instead.
  "/email-identity",
  // A live dashboard's short link, cluega.ai/d/<id> (SH13-027): handed around in chat like
  // /share, and it redirects into /app, which signs the reader in.
  "/d",
  // The event QR's short link. Same "permanent link" reasoning as /r, taken one
  // step further: this one is PRINTED. It resolves to a redirect and renders no
  // page at all, so there is no language to pick — and a locale segment on a
  // card cannot be corrected after the cards come back from the printer.
  "/q",
  // Telegram Mini App sandbox view: opened inside Telegram, language from the cookie.
  "/telegram-sandbox",
] as const;

export function isLocalizedPath(pathname: string): boolean {
  return !NON_LOCALIZED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
