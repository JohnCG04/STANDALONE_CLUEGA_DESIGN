/**
 * The letter and colour a person's placeholder avatar is drawn with.
 *
 * Shared by the settings modal's own avatar (sidebar and Profile header) and the
 * Team Directory rows, so the signed-in user wears the same face in both places
 * instead of a stock picture on one screen and their initial on the other.
 */

/** The first letter of the name, else of the email; "?" when there is neither. */
export function avatarInitial(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}

/**
 * A stable colour per person.
 *
 * Hashed so the same face keeps the same colour between renders and between
 * sessions — an avatar that changes hue on every load is noise, not identity.
 * Seeded by email, lower-cased: it is the one identifier every surface has,
 * the Profile header included, which has no user id. Hues avoid the red band,
 * which is reserved for destructive states.
 */
export function avatarColor(seed: string): string {
  const normalized = seed.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  const hue = 30 + (Math.abs(hash) % 300);
  return `hsl(${hue} 45% 42%)`;
}
