/**
 * Blank-aware environment reads.
 *
 * `process.env.X ?? default` is the wrong guard for anything that arrives as a
 * Docker build arg. The Dockerfile does `ARG X` / `ENV X=$X` for every
 * `NEXT_PUBLIC_*` value, so an unset CI secret does not leave the variable
 * undefined — it defines it as an EMPTY STRING, which `??` happily keeps.
 *
 * That is how a missing `NEXT_PUBLIC_SITE_URL` took down the production
 * image build: `siteConfig.url` became `""` and `new URL("")` threw while Next
 * evaluated the root layout, reported only as "Failed to collect page data for
 * /_not-found" with no mention of the variable at fault.
 *
 * Use this helper for values where blank means "not configured". Do NOT use it
 * where blank is meaningful — `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
 * `NEXT_PUBLIC_MY_BROWSER_ENABLED` both treat empty as "feature off".
 */

/** First non-blank value, else `fallback`. Whitespace-only counts as blank. */
export function envOrDefault(
  ...valuesThenFallback: [...(string | undefined)[], string]
): string {
  const fallback = valuesThenFallback[valuesThenFallback.length - 1] as string;
  const candidates = valuesThenFallback.slice(0, -1) as (string | undefined)[];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

export function envPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim());
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
