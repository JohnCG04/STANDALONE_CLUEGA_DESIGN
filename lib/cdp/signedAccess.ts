/**
 * Links that expire (PRD v1.6 §2.3, LIB-166): what the Library's own screens
 * load a file and its pictures from.
 *
 * Never store one or hand it to another feature — the composer, a workflow, ad
 * creation. It stops working within about an hour, and whatever kept it would
 * break with it. The stable `fileUrl` / `thumbUrl` beside it are the references
 * to keep.
 *
 * Absent when the backend has no signing secret; screens then load the stable
 * links exactly as before.
 */
export interface SignedAccess {
  fileUrl: string;
  thumbUrl: string;
  thumbUrls: Record<string, string>;
  /** Epoch ms when every link above stops working. */
  expiresAt: number;
}

/** The wire shape of `access` on an asset, a bin row or a version. */
export interface RawSignedAccess {
  file_url?: string;
  thumb_url?: string;
  thumb_urls?: Record<string, string>;
  expires_at?: string;
}

export function toSignedAccess(raw: RawSignedAccess | null | undefined): SignedAccess | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const expiresAt = typeof raw.expires_at === "string" ? Date.parse(raw.expires_at) : Number.NaN;
  // A link set without a readable expiry cannot be refreshed in time, so it is
  // not used at all: the stable links still work.
  if (!Number.isFinite(expiresAt)) return undefined;
  const thumbUrls: Record<string, string> = {};
  for (const [size, link] of Object.entries(raw.thumb_urls ?? {})) {
    if (typeof link === "string" && link) thumbUrls[size] = link;
  }
  return {
    fileUrl: typeof raw.file_url === "string" ? raw.file_url : "",
    thumbUrl: typeof raw.thumb_url === "string" ? raw.thumb_url : "",
    thumbUrls,
    expiresAt,
  };
}

/**
 * How long before expiry a link already counts as gone. A request started that
 * close to the end may not finish in time — a long video certainly will not —
 * and the browser's clock is not the server's.
 */
export const SIGNED_LINK_MARGIN_MS = 2 * 60_000;

/** Whether links that expire at `expiresAt` should be replaced before use. */
export function signedLinksStale(expiresAt: number | undefined, now = Date.now()): boolean {
  return expiresAt !== undefined && expiresAt - SIGNED_LINK_MARGIN_MS <= now;
}

/** The first moment any of these link sets expires, or undefined for none. */
export function earliestSignedExpiry(expiries: Iterable<number | undefined>): number | undefined {
  let earliest: number | undefined;
  for (const at of expiries) {
    if (at === undefined) continue;
    if (earliest === undefined || at < earliest) earliest = at;
  }
  return earliest;
}

/**
 * The shortest gap between two refreshes. If the browser's clock runs far
 * enough ahead of the server's, every fresh link already looks stale here, and
 * without a floor the screen would reload in a loop.
 */
export const SIGNED_LINK_MIN_REFRESH_MS = 5 * 60_000;

/**
 * How long to wait before refreshing links that expire at `expiresAt`: until
 * the margin before expiry, but never sooner than the floor after the last
 * refresh.
 */
export function signedLinkRefreshDelay(
  expiresAt: number,
  now: number,
  lastRefreshAt: number | undefined,
): number {
  const due = expiresAt - SIGNED_LINK_MARGIN_MS - now;
  const floor = lastRefreshAt === undefined ? 0 : lastRefreshAt + SIGNED_LINK_MIN_REFRESH_MS - now;
  return Math.max(0, due, floor);
}
