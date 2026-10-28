import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { APP_AUTH_COOKIE, verifyAppAuthToken } from "@/lib/app-auth";
import { isAppPrivatePath } from "@/lib/app-auth-paths";
import { SUPPORT_ACCESS_COOKIE } from "@/lib/cdp/support-session";
import { withResolvedLanguage } from "@/i18n/proxy-language";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAppPrivatePath(pathname)) {
    // The support cookie is client-settable (unsigned, no HttpOnly, forgeable
    // via document.cookie) — only an acceptable gate for the Design pages, which
    // are backed by a CDP API that authenticates separately, so the cookie only
    // chooses what UI to show. Never let it decide that a request carrying data
    // is authenticated.
    if (request.cookies.get(SUPPORT_ACCESS_COOKIE)?.value === "1") {
      return NextResponse.next();
    }

    const appToken = request.cookies.get(APP_AUTH_COOKIE)?.value;
    if (await verifyAppAuthToken(appToken)) {
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("from", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return withResolvedLanguage(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
