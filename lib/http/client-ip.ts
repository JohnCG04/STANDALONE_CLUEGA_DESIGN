/**
 * The reader's own address, for CDP's anonymous share limiter (QA SBC12-29).
 *
 * Browser reads of /api/v1/public/* reach CDP through this app's proxy, and the
 * proxy used to send no forwarding header — so CDP's per-address budgets saw the
 * app server's address for every visitor. One budget for the whole world: twenty
 * failed lookups a minute from anyone locked every share page for everyone, and
 * the per-link password lock was global rather than per reader.
 *
 * Cloudflare's CF-Connecting-IP first: Cloudflare overwrites it, so a client
 * cannot choose it. X-Real-IP and the first X-Forwarded-For hop are fallbacks
 * for hosts without Cloudflare (local dev). Empty when none is present.
 */
export function readerClientIp(headers: Pick<Headers, "get">): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

/**
 * The /api/v1 routes the proxy sends the reader's address on.
 *
 * public: CDP rate-limits the anonymous share routes per address.
 * pulse: the bot service writes every Pulse change to the audit log with the
 * caller's address, and CDP passes on the address it was given — without this,
 * every change from every user is recorded as this server.
 *
 * Not every route: CDP's per-address limiters elsewhere treat all browser
 * traffic as this server's single bucket today, and forwarding there would
 * split those budgets per reader.
 */
export function forwardsReaderIp(pathSegments: readonly string[]): boolean {
  return pathSegments[0] === "public" || pathSegments[0] === "pulse";
}

/**
 * The reader's country as Cloudflare saw it, upper-case ISO, or "" when unknown.
 * Only Cloudflare's header (it overwrites any the client sends); "XX" is unknown
 * and "T1" is Tor, neither of which is a place.
 */
export function readerCountry(headers: Pick<Headers, "get">): string {
  const value = headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : "";
}
