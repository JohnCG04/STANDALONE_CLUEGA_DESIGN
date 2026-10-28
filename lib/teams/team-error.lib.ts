import { TeamApiError } from "./cdp-teams";

/**
 * What to TELL somebody when a team action fails
 * (黃小美/kiki · 無法添加下屬成員 · "Request failed: 502").
 *
 * WHAT THE READER SAW. `teamData` builds `Request failed: ${status}` when the
 * response carries no error body, and every caller printed that string. So a
 * gateway that did not answer read as `Request failed: 502` next to the Add
 * button — which tells the reader nothing they can act on and, worse, looks
 * like something they typed was rejected. The invite route goes through
 * mid-platform, so a 502 there is not the reader's doing and not something
 * retrying differently will fix.
 *
 * WHAT THIS IS NOT. It does not make the action succeed — the upstream failure
 * is real and backend-side. It replaces a status code with a sentence that says
 * whose problem it is and what to do next, which is the part that belongs to
 * this screen.
 *
 * Returns an i18n KEY rather than a string, so the classification is testable
 * without a translator and stays correct in all three languages.
 */

/** Status families that mean "the request never reached a working service". */
const UPSTREAM_DOWN = new Set([502, 503, 504]);

export function teamErrorCopyKey(error: unknown): string | null {
  if (!(error instanceof TeamApiError)) return null;
  const { status } = error;
  if (status === 401) return "settings.team.errors.signedOut";
  if (status === 403) return "settings.team.noPermission";
  if (status === 404) return "settings.team.errors.notFound";
  if (status === 409) return "settings.team.errors.conflict";
  if (UPSTREAM_DOWN.has(status)) return "settings.team.errors.upstreamDown";
  // 5xx that is not one of the gateway codes: the service answered and broke.
  // A different sentence, because "try again shortly" is misleading advice for
  // a request that will fail the same way every time.
  if (status >= 500) return "settings.team.errors.serverError";
  // 4xx the server bothered to explain (it had an error body, so `message` is
  // not a status code) is shown as-is: it is about this request's own input.
  return null;
}

/**
 * The sentence to render, falling back to the error's own message.
 *
 * The fallback matters: a 4xx that CAME WITH an explanation is more useful than
 * anything this function could invent, and swallowing it would hide the one
 * case where the reader really can fix the input.
 */
export function teamErrorMessage(
  t: (key: string) => string,
  error: unknown,
): string {
  const key = teamErrorCopyKey(error);
  if (key) return t(key);
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}
