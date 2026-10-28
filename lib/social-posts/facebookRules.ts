/**
 * Facebook Page posting rules, as pure functions.
 *
 * The backend refuses each of these at create with a 400
 * (usecase/socialposts/facebook_rules.go); the compose card states them here so
 * it can explain them before the submit instead of after it.
 */

/** One photo or one video per Facebook post: the adapter publishes a single
 *  media item, and the backend refuses more rather than drop the rest. */
export const FACEBOOK_MAX_MEDIA = 1;

/** Facebook holds a scheduled post itself, and only takes a publish time
 *  between 10 minutes and 75 days ahead. */
export const FACEBOOK_MIN_SCHEDULE_LEAD_MS = 10 * 60 * 1000;
export const FACEBOOK_MAX_SCHEDULE_LEAD_MS = 75 * 24 * 60 * 60 * 1000;

/** Whether a media selection can become one Facebook post. An empty selection
 *  is not this rule's to judge — every platform needs at least one item. */
export function facebookMediaFits(count: number): boolean {
  return count <= FACEBOOK_MAX_MEDIA;
}

/** Whether a scheduled time is one Facebook will hold. */
export function facebookScheduleFits(scheduleAt: Date, now: Date): boolean {
  const lead = scheduleAt.getTime() - now.getTime();
  return lead >= FACEBOOK_MIN_SCHEDULE_LEAD_MS && lead <= FACEBOOK_MAX_SCHEDULE_LEAD_MS;
}

/** Whether a destination link is usable. Empty is fine — the link is optional
 *  and its absence makes a plain photo/video post. */
export function facebookLinkValid(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
