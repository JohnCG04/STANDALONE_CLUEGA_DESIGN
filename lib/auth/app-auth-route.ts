import { NextResponse } from "next/server";

import {
  APP_AUTH_COOKIE,
  createAppAuthToken,
  getAppAuthMaxAgeSeconds,
} from "@/lib/app-auth";
import { CdpApiError } from "@/lib/cdp";
import {
  CdpTenantChoiceRequiredError,
  loginWithPasswordViaCdp,
} from "@/lib/cdp-auth-client";
import { readClientIp, verifyTurnstileToken } from "@/lib/turnstile";

const ORG_CHALLENGE_COOKIE = "cluega_org_challenge";
const ORG_CHALLENGE_MAX_AGE = 5 * 60;

function getCookie(request: Request, name: string) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function setChallengeCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(ORG_CHALLENGE_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/app-auth",
    maxAge,
  });
}

/**
 * Body of the `/api/app-auth` route, mounted by the product zone.
 *
 * Route handlers must live physically inside each app's `app/` tree, so
 * `apps/app/app/api/app-auth/route.ts` is a one-line re-export of this handler.
 *
 * The landing zone forwards `/api/app-auth` to the product zone (see
 * APP_ZONE_API_PREFIXES in apps/landing/next.config.ts), so the product zone
 * owns both CDP login and the app_auth cookie.
 */
export async function POST(request: Request) {
  let email = "";
  let password = "";
  let turnstileToken = "";
  let tenantId = "";
  let challengeToken = "";

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      turnstileToken?: string;
      tenantId?: string;
    };
    email = body.email ?? "";
    password = body.password ?? "";
    turnstileToken = body.turnstileToken ?? "";
    tenantId = body.tenantId ?? "";
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // A stale picker cookie must not hijack a fresh credential login (for
  // example after “use a different account”). Only redeem it with a choice.
  challengeToken = tenantId ? getCookie(request, ORG_CHALLENGE_COOKIE) : "";
  // A choice sent with the password again is an ordinary credential login: the
  // form asks for it when the picker carried no challenge (an API that predates
  // challenges). Only a passwordless choice needs the cookie.
  if (tenantId && !challengeToken && !password) {
    return NextResponse.json(
      { error: "organizationChallengeExpired" },
      { status: 409 },
    );
  }

  // Bot check before any credential work. No-op when TURNSTILE_SECRET_KEY is unset.
  const isHuman =
    Boolean(challengeToken) ||
    (await verifyTurnstileToken(turnstileToken, readClientIp(request)));
  if (!isHuman) {
    return NextResponse.json({ error: "captchaFailed" }, { status: 400 });
  }

  try {
    const account = await loginWithPasswordViaCdp(
      email,
      password,
      {
        userAgent: request.headers.get("user-agent"),
        clientIp:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip"),
      },
      tenantId,
      challengeToken,
    );
    const token = await createAppAuthToken({
      email: account.email,
      displayName: account.displayName,
    });
    const response = NextResponse.json({
      ok: true,
      token: account.token,
      accessToken: account.token,
      refreshToken: account.refreshToken,
      email: account.email,
      displayName: account.displayName,
    });

    response.cookies.set(APP_AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: getAppAuthMaxAgeSeconds(),
    });
    setChallengeCookie(response, "", 0);

    return response;
  } catch (error) {
    // The picker is not a failure: the credentials were right. Answer 200 with
    // the list and set no session cookie -- nobody is signed in until they choose.
    if (error instanceof CdpTenantChoiceRequiredError) {
      const response = NextResponse.json({
        next: "select_tenant",
        accountId: error.accountId,
        memberships: error.memberships,
        challengeReady: Boolean(error.challengeToken),
      });
      setChallengeCookie(
        response,
        error.challengeToken,
        error.challengeToken ? ORG_CHALLENGE_MAX_AGE : 0,
      );
      return response;
    }

    if (error instanceof CdpApiError && error.code === "invalid_credentials") {
      const response = NextResponse.json({ error: "invalid" }, { status: 401 });
      if (challengeToken) setChallengeCookie(response, "", 0);
      return response;
    }

    if (error instanceof CdpApiError) {
      console.error("[app-auth] CDP login failed", {
        status: error.status,
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      });

      if (error.status === 0 || error.code === "invalid_response") {
        return NextResponse.json({ error: "loginUnavailable" }, { status: 502 });
      }
      if (challengeToken && (error.status === 400 || error.status === 403)) {
        return NextResponse.json({ error: "loginFailed" }, { status: error.status });
      }
    } else {
      console.error("[app-auth] Login failed", error);
    }

    return NextResponse.json({ error: "loginFailed" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(APP_AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
