/**
 * Server-side Turnstile verification. Import this from route handlers only — it
 * reads `TURNSTILE_SECRET_KEY`, which must never be bundled for the browser.
 *
 * Verification is skipped when no secret is configured so local dev without
 * Cloudflare credentials still logs in; `isTurnstileVerificationRequired()`
 * tells callers which mode they are in.
 */

const SITEVERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getTurnstileSecretKey(): string {
  return process.env.TURNSTILE_SECRET_KEY ?? "";
}

/** True when a secret key is configured and tokens must be verified. */
export function isTurnstileVerificationRequired(): boolean {
  return getTurnstileSecretKey().length > 0;
}

/**
 * Verify a Turnstile response token with Cloudflare. Tokens are single-use, so
 * call this exactly once per token — a second call for the same token fails.
 * Returns true when verification is not required (no secret configured).
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  clientIp?: string | null,
): Promise<boolean> {
  const secret = getTurnstileSecretKey();
  if (!secret) {
    return true;
  }

  if (!token) {
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (clientIp) {
    body.set("remoteip", clientIp);
  }

  try {
    const response = await fetch(SITEVERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as { success?: boolean };

    return result.success === true;
  } catch {
    return false;
  }
}

/** Caller IP as Cloudflare/our proxy chain reports it, for `remoteip`. */
export function readClientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")
  );
}
