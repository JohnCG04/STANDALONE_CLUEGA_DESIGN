import { NextResponse } from "next/server";

import { readClientIp, verifyTurnstileToken } from "@/lib/turnstile";

/**
 * Verify a Turnstile token on its own. The web login verifies inline inside
 * `/api/app-auth`; the native (desktop/mobile) login talks to CDP straight from
 * the client, so it checks the captcha here first.
 *
 * Body of the `/api/turnstile` route, mounted by both zones.
 */
export async function POST(request: Request) {
  let token = "";

  try {
    const body = (await request.json()) as { token?: string };
    token = body.token ?? "";
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const isValid = await verifyTurnstileToken(token, readClientIp(request));
  if (!isValid) {
    return NextResponse.json({ error: "captchaFailed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
