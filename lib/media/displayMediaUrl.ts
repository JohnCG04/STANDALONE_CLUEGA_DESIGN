import { cdpApiConfig } from "@/config/cdp-api";
import { mediaSession } from "@/lib/media/mediaSession";
import { isViewableMediaUrl, toViewUrl } from "@/lib/media/viewMediaUrl";

/**
 * The address a stored media link is drawn, opened or copied from.
 *
 * What the app STORES for an image is a stable reference: `/media/by-id/<tenant>/<file>`,
 * `/media/artifact-files/…`, `/media/asset-thumbs/…`, or, for older rows, a direct bucket link. None of
 * those is what a person should be handed: they open for anyone who holds them. While the browser holds
 * the media session cookie (lib/media/mediaSession.ts) such a link is drawn from the app's own view
 * route instead (lib/media/viewMediaUrl.ts), which a browser opens only where someone is signed in.
 * Anything else, and any browser that cannot get the cookie, keeps the link it was given.
 *
 * The stored reference is never replaced: callers keep storing the link they have and ask for a display
 * address only where they draw it.
 */

/** The view address of a stored link while the session is held, else the link itself. */
export async function displayMediaUrl(stored: string): Promise<string> {
  if (!isViewableMediaUrl(stored)) return stored;
  return (await mediaSession.ensure()) ? toViewUrl(stored) : stored;
}

/** Where a tab opened on a stored link should go; same answer as `displayMediaUrl`. */
export const openableMediaUrl = displayMediaUrl;

/**
 * The link to put on the clipboard for a stored media link, as an absolute address. With the session held
 * it is the view address: it opens only in a browser where someone is signed in, so a copy pasted into a
 * private window is refused. Otherwise it is the link as stored.
 */
export async function copyableMediaUrl(stored: string): Promise<string> {
  const shown = await displayMediaUrl(stored);
  // A path on the app's own origin (a view address, a Pulse view address) is pasted as a full address.
  return shown.startsWith("/") ? `${cdpApiConfig.baseUrl || window.location.origin}${shown}` : shown;
}
