/**
 * The address a stored media link is shown from when the browser holds the media session cookie
 * (lib/media/mediaSession.ts): the same file on the app's OWN origin, under /api/v1/media/view.
 *
 * It carries no signature. What opens it is the cookie, which only a browser that signed in has, so a
 * link copied out of the page opens only where someone is signed in, and CDP still decides per file
 * whether that person may see it. Same origin, because the cookie is the app's: a request to the API's
 * own host would be a third-party one.
 */

const VIEW_PREFIX = "/api/v1/media/view";
/** The storage service's file ids: 26 upper-case ULID characters. */
const STORAGE_ID = /^[0-9A-Z]{26}$/;
const BUCKET_HOST = /\.(r2\.dev|r2\.cloudflarestorage\.com)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The view path of a stored link, or null when it is not a file of this app's own media. */
function viewPath(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://relative.invalid");
  } catch {
    return null;
  }
  const path = parsed.pathname;
  if (path.includes("..")) return null;
  for (const route of ["by-id", "artifact-files", "asset-thumbs", "artifact-images"] as const) {
    const prefix = `/media/${route}/`;
    if (path.startsWith(prefix)) return `${VIEW_PREFIX}/${route}/${path.slice(prefix.length)}`;
  }
  // A link straight to the bucket (most rows written before signing): <tenant>/<yyyy>/<mm>/<file id>.
  if (BUCKET_HOST.test(parsed.hostname)) {
    const parts = path.split("/").filter(Boolean);
    const file = parts[parts.length - 1] ?? "";
    const tenant = parts.slice(0, -1).find((segment) => UUID.test(segment));
    if (tenant && STORAGE_ID.test(file)) return `${VIEW_PREFIX}/by-id/${tenant}/${file}`;
  }
  return null;
}

/** Whether the link is one the view routes can serve. */
export function isViewableMediaUrl(raw: string | null | undefined): boolean {
  return !!raw && viewPath(raw) !== null;
}

/**
 * The view address of a stored link, or the link itself when it is not viewable.
 *
 * `nonce` makes the address differ from one already requested, for a retry: a browser does not ask for
 * the same address again after it failed.
 */
export function toViewUrl(raw: string, options: { nonce?: number } = {}): string {
  const path = viewPath(raw);
  if (!path) return raw;
  const query = new URLSearchParams();
  // A resized picture (/media/artifact-images/…?w=640) is the same file at the size asked for.
  const width = new URL(raw, "http://relative.invalid").searchParams.get("w");
  if (path.startsWith(`${VIEW_PREFIX}/artifact-images/`) && width) query.set("w", width);
  if (options.nonce) query.set("r", String(options.nonce));
  const rest = query.toString();
  return rest ? `${path}?${rest}` : path;
}
