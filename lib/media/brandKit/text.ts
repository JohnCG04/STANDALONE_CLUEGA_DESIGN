/**
 * String plumbing the projection needs, split out so it can be tested without
 * a fetch. Everything here is pure.
 */

/**
 * §4: "each list joined into one sentence". Confirmed twice by §7.2's example —
 * ["Soft natural studio light", "Gentle directional shadows"] becomes
 * "Soft natural studio light, Gentle directional shadows", and
 * ["Warm", "Tactile"] becomes "Warm, Tactile". The separator is ", ".
 */
export function joinSentence(values: readonly string[]): string {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * The inverse — lossy, and the loss is the point: an entry that contains a
 * comma cannot be split back out of the sentence it was joined into. Only ever
 * reached through `reconcileList`.
 */
export function splitSentence(text: string): string[] {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Recover a list from a joined sentence WITHOUT destroying the original.
 *
 * `kitList` is what the kit said; `guideText` is what the server currently
 * renders from. When the two still agree, the kit's array is returned untouched
 * — so "Flat-lay / top-down, shot on a 50mm" stays ONE entry instead of
 * splitting on its own comma. Only when they disagree (someone PATCHed the
 * string) does the split win, because then the string is the newer truth.
 */
export function reconcileList(
  kitList: readonly string[],
  guideText: string,
): string[] {
  if (joinSentence(kitList) === guideText.trim()) return [...kitList];
  return splitSentence(guideText);
}

/** Comma / newline separated text -> the list the service stores. */
export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** The list, back as the one line a text field shows. */
export function formatList(values: readonly string[] | undefined): string {
  return (values ?? []).join(", ");
}
