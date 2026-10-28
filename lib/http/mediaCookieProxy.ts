/**
 * What the `/api/v1/*` proxy does for the media session cookie (see lib/media/mediaSession.ts).
 *
 * The proxy forwards an allowlist of headers and drops every cookie, which is right for the API but
 * would leave the media session with nowhere to live: the cookie CDP sets on `POST /media/session` has to
 * reach the browser on the APP's origin, and has to come back on `GET /media/view/*`. So, for those two
 * paths and for that one cookie only:
 *   - (the session is started by POST /media/session and ended by DELETE /media/view/session, the one
 *     route under the cookie's own path, so the browser sends the cookie with it)
 *   - the request's `cluega_media` cookie is forwarded (nothing else from `Cookie`);
 *   - the response's `Set-Cookie` for `cluega_media` is relayed (nothing else from `Set-Cookie`);
 *   - a view is not followed: CDP answers a file with a 302 to a short-lived storage address, and that
 *     redirect must reach the browser, which then fetches the bytes from storage itself.
 */

export const MEDIA_COOKIE_NAME = "cluega_media";

/** `POST|DELETE /api/v1/media/session`: where the cookie is set and taken back. */
export function isMediaSessionPath(pathSegments: string[]): boolean {
  return pathSegments.length === 2 && pathSegments[0] === "media" && pathSegments[1] === "session";
}

/** `DELETE /api/v1/media/view/session`: ends the session; under the cookie's own path so the cookie comes along. */
export function isMediaSessionEndPath(pathSegments: string[]): boolean {
  return pathSegments.length === 3 && pathSegments[0] === "media" && pathSegments[1] === "view" && pathSegments[2] === "session";
}

/** `GET /api/v1/media/view/*`: the cookie-guarded media routes. */
export function isMediaViewPath(pathSegments: string[]): boolean {
  return pathSegments.length > 2 && pathSegments[0] === "media" && pathSegments[1] === "view" && !isMediaSessionEndPath(pathSegments);
}

/** Whether the proxy deals in the media cookie for this path at all. */
export function usesMediaCookie(pathSegments: string[]): boolean {
  return isMediaSessionPath(pathSegments) || isMediaSessionEndPath(pathSegments) || isMediaViewPath(pathSegments);
}

/** The `cluega_media=<value>` pair from a request's Cookie header, and nothing else in it. */
export function mediaCookieFrom(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const pair = part.trim();
    if (pair.startsWith(`${MEDIA_COOKIE_NAME}=`) && pair.length > MEDIA_COOKIE_NAME.length + 1) return pair;
  }
  return undefined;
}

/** The upstream response's `Set-Cookie` lines for the media cookie only. */
export function mediaSetCookies(headers: Pick<Headers, "getSetCookie">): string[] {
  return headers.getSetCookie().filter((line) => line.trimStart().startsWith(`${MEDIA_COOKIE_NAME}=`));
}

/** A redirect status whose `Location` is handed to the browser as it is. */
export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * The request headers that carry the cookie for this path, to add to the forwarded set. On the session
 * route the original scheme is passed too, so CDP marks the cookie Secure when the browser spoke https
 * (the hop from here to CDP is often plain http).
 */
export function mediaCookieRequestHeaders(
  pathSegments: string[],
  incoming: Pick<Headers, "get">,
  requestUrl: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!usesMediaCookie(pathSegments)) return headers;
  const cookie = mediaCookieFrom(incoming.get("cookie"));
  if (cookie) headers.cookie = cookie;
  if (isMediaSessionPath(pathSegments)) {
    const proto = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const scheme = proto === "https" || proto === "http" ? proto : new URL(requestUrl).protocol.replace(":", "");
    headers["x-forwarded-proto"] = scheme;
  }
  return headers;
}

/** Copies what the media cookie needs from the upstream answer onto the response headers. */
export function relayMediaCookieResponse(
  pathSegments: string[],
  upstream: Pick<Response, "headers" | "status">,
  responseHeaders: Headers,
): void {
  if (!usesMediaCookie(pathSegments)) return;
  if (isMediaSessionPath(pathSegments) || isMediaSessionEndPath(pathSegments)) {
    for (const line of mediaSetCookies(upstream.headers)) responseHeaders.append("set-cookie", line);
  }
  if (isMediaViewPath(pathSegments) && isRedirectStatus(upstream.status)) {
    const location = upstream.headers.get("location");
    if (location) responseHeaders.set("location", location);
    const referrer = upstream.headers.get("referrer-policy");
    if (referrer) responseHeaders.set("referrer-policy", referrer);
  }
}
