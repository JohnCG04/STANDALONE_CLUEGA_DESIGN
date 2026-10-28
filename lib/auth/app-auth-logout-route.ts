import { NextResponse } from "next/server";

import { APP_AUTH_COOKIE } from "@/lib/app-auth";

/** Body of the `/api/app-auth/logout` route, mounted by the product zone. */
export async function POST() {
  const response = NextResponse.json({ ok: true });

  // `path` MUST match the value app-auth-route.ts set the cookie with ("/").
  // A cookie is keyed by (name, domain, path), so clearing at "/app" left the
  // real cookie untouched and the visitor stayed signed in.
  response.cookies.set(APP_AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
