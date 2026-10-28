/**
 * Tell every proxy between here and the browser to leave a live stream alone.
 *
 * `X-Accel-Buffering: no` has been on these responses for a long time. It is an
 * nginx instruction and it says nothing about compression, so it did not cover
 * the case that actually bit us: the landing zone proxies `/api/v1/*` with a
 * Next `rewrites()` entry, Next gzips what it proxies, and a gzip stream holds
 * its bytes until it closes. Measured in a real browser on 2026-08-27, a chat
 * turn's events all arrived at once at the very end — while the identical
 * stream read one frame per second from curl, which sends no `Accept-Encoding`
 * and so was never given the compressed variant.
 *
 * `no-transform` is the standard way to say it (RFC 9111 §5.2.2.6: an
 * intermediary must not re-encode the payload) and Next honours it.
 *
 * Applied only to `text/event-stream`. Everything else on this proxy is an
 * ordinary response that SHOULD be compressed.
 */
const NO_TRANSFORM = "no-transform";

export function markStreamUntransformable(headers: Headers): void {
  if (!headers.get("content-type")?.includes("text/event-stream")) return;

  headers.set("x-accel-buffering", "no");

  const existing = headers.get("cache-control");
  if (!existing) {
    headers.set("cache-control", `no-cache, ${NO_TRANSFORM}`);
    return;
  }
  const alreadySaid = existing
    .split(",")
    .some((directive) => directive.trim().toLowerCase() === NO_TRANSFORM);
  if (alreadySaid) return;

  headers.set("cache-control", `${existing}, ${NO_TRANSFORM}`);
}
