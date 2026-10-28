/**
 * Cloudflare Turnstile — the bot check on the login form.
 *
 * The site key is public by design (it ships inside the widget markup), so it
 * lives in a `NEXT_PUBLIC_` variable. The matching secret key is read only by
 * `lib/turnstile.ts` on the server and never reaches the browser.
 *
 * Both keys are optional: with no site key the widget is skipped and sign-in is
 * not gated, so local dev, previews and E2E runs keep working without
 * Cloudflare credentials.
 */
export const turnstileConfig = {
  siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
} as const;

/** True when a site key is configured and the widget should render. */
export function isTurnstileEnabled(): boolean {
  return turnstileConfig.siteKey.length > 0;
}
