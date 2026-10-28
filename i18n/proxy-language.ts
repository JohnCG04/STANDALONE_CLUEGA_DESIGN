import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isLocalizedPath,
  LANGUAGE_COOKIE_KEY,
  LANGUAGE_HEADER,
  splitLanguageFromPathname,
} from "@/i18n/config";
import { COOKIE_CONSENT_COOKIE, parseCookieConsent } from "@/lib/cookie-consent";

const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/favicon") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|css|js)$/.test(pathname)
  );
}

/**
 * Resolve the language from the URL and hand it to the app. Shared by the
 * `proxy.ts` of both zones — keep zone-specific routing out of here.
 *
 * Public pages carry the language in the path (`/` = English, `/cn/…`, `/vn/…`).
 * We strip the prefix and rewrite to the unprefixed route so a single route tree
 * serves all three languages, pass the resolved language down through
 * LANGUAGE_HEADER, and mirror a prefixed URL's language into the language
 * cookie so non-localized surfaces (the product app, auth pages) follow it. A
 * bare path is served in English but never written: it states no choice.
 *
 * The URL is authoritative: a saved cookie never overrides it, and we never
 * redirect a visitor away from the language they asked for.
 *
 * The one exception is a locale prefix on a NON-localized route, which is not a
 * language choice at all — those routes have no localized variant. Those
 * redirect to the canonical bare path, and the language the visitor asked for
 * survives in the cookie below, which is exactly where the product app reads it
 * from. So `/vn/app/dashboards` lands on `/app/dashboards` in Vietnamese.
 */
export function withResolvedLanguage(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isLocalizedPath(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const { lang, pathname: unprefixedPathname } = splitLanguageFromPathname(pathname);
  const headers = new Headers(request.headers);
  headers.set(LANGUAGE_HEADER, lang);

  let response: NextResponse;

  if (unprefixedPathname === pathname) {
    response = NextResponse.next({ request: { headers } });
  } else if (!isLocalizedPath(unprefixedPathname)) {
    // A locale prefix on a route that has no localized variant — the product
    // app, auth pages, the API, share links. `isLocalizedPath` is tested
    // against the RAW path above, so "/vn/app/…" slips past the exclusion list
    // that "/app/…" is on, and this branch is where that gets corrected.
    //
    // REDIRECT, not rewrite. Rewriting served the right page but left
    // "/vn/app/dashboards/<id>" in the address bar, and two things downstream
    // read that raw path:
    //
    //   · the app shell's own pathToView, which matches "/app/…" and so fell
    //     through to `home` — the board opened as "What can I help with?";
    //   · isAppPrivatePath in BOTH zones' proxy.ts, which runs before this
    //     function and likewise matches "/app/…", so the locale-prefixed URL
    //     skipped the login redirect entirely.
    //
    // Sending the visitor to the canonical bare path fixes both at once: the
    // second request is a plain "/app/…" that the auth gate and the shell both
    // recognise. 307 rather than 308 — nothing here is worth burning into
    // browser caches while the app's locale story may still change.
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = unprefixedPathname;
    response = NextResponse.redirect(canonicalUrl, 307);
  } else {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = unprefixedPathname;
    response = NextResponse.rewrite(rewriteUrl, { request: { headers } });
  }

  // The language cookie is a "Functionality" cookie, so mirroring the URL's
  // language into it requires consent. Without consent the localized routes still
  // work — the language comes from the path — we just don't remember it. If the
  // cookie was set while consent was given and has since been withdrawn, clear it
  // here too, so a stale preference cannot outlive the decision.
  const consent = parseCookieConsent(request.cookies.get(COOKIE_CONSENT_COOKIE)?.value);

  // Only a page the reader OPENS is a language choice. The app shell's Google tag
  // fetches "/gtag/js" and "/g/collect" on this origin; both reach here as the bare
  // English page, and mirroring that turned a 繁體中文 reader English on the next
  // load (TT-G-13, dev 2026-09-28). A client-side move to a prefixed URL is
  // remembered by I18nProvider itself. No fetch metadata at all (curl, old
  // browsers) is still treated as a visit.
  const dest = request.headers.get("sec-fetch-dest");
  const isVisit = dest === null || dest === "document";

  // And only a URL that NAMES a language. A bare path is English because that is
  // the public site's default, not because anybody picked it — and it is also
  // every route the non-localized list does not cover: /select-org, /support, a
  // 404. Mirroring "en" from those turned a Tiếng Việt reader English on the
  // next load (dev 2026-10-27). Picking English on the public site still sticks:
  // the language switcher calls `setLang`, which stores it, before navigating.
  const namesALanguage = unprefixedPathname !== pathname;

  if (consent?.functionality) {
    if (isVisit && namesALanguage && request.cookies.get(LANGUAGE_COOKIE_KEY)?.value !== lang) {
      response.cookies.set(LANGUAGE_COOKIE_KEY, lang, {
        maxAge: LANGUAGE_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
      });
    }
  } else if (request.cookies.has(LANGUAGE_COOKIE_KEY)) {
    response.cookies.set(LANGUAGE_COOKIE_KEY, "", { maxAge: 0, path: "/", sameSite: "lax" });
  }

  return response;
}
