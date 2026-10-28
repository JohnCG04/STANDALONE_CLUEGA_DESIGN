/**
 * The families the Brand Kit's Font field may offer.
 *
 * Deliberately NOT the fonts installed on this machine. §4 hands a family NAME
 * to the renderer and the renderer resolves it server-side, so a kit built from
 * a local scan would look right to whoever authored it and render as a fallback
 * face for the service — and for every teammate. Every family here is one the
 * renderer can obtain: Google's library, or a face we know is installed
 * alongside it.
 *
 * No React and no fetch beyond the one call — see brandFonts.test.ts.
 */

/** Diagnostic only: turns "the picker is short" into "the key is missing". */
export type FontSource = "google" | "curated";

export type FontCatalogue = {
  families: readonly string[];
  source: FontSource;
};

/** Used when the Google library is unreachable — no key, upstream down, offline. */
export const CURATED_FONT_FAMILIES: readonly string[] = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "DM Sans",
  "Space Grotesk",
  "Clash Display",
  "General Sans",
  "Lora",
  "Source Serif 4",
  "IBM Plex Sans",
  "Roboto",
  "Georgia",
  "Helvetica Neue",
];

/** Curated families Google does not serve: asking for them 404s, so the picker
 *  draws these in the reading face instead of blanking the row. */
export const NON_GOOGLE_FAMILIES: ReadonlySet<string> = new Set([
  "Clash Display",
  "General Sans",
  "Georgia",
  "Helvetica Neue",
]);

export const FONT_CATALOGUE_URL = "/api/fonts";

/** Through our own origin: the Developer API wants a key, and a key in the
 *  browser is a public key. The route handler holds it. */
export async function fetchFontCatalogue(signal?: AbortSignal): Promise<FontCatalogue> {
  const response = await fetch(FONT_CATALOGUE_URL, { signal });
  if (!response.ok) throw new Error(`font catalogue: ${response.status}`);
  const body = (await response.json()) as Partial<FontCatalogue>;
  if (!Array.isArray(body.families) || body.families.length === 0) {
    throw new Error("font catalogue: empty");
  }
  return {
    families: body.families,
    source: body.source === "google" ? "google" : "curated",
  };
}

/**
 * Matches for `query`, prefix hits first: typing the start of a name is naming
 * it, a match mid-string is a coincidence. Ties keep the catalogue's order,
 * which for Google is popularity.
 */
export function searchFamilies(
  families: readonly string[],
  query: string,
): readonly string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return families;
  const ranked: { family: string; rank: number; at: number }[] = [];
  families.forEach((family, at) => {
    const found = family.toLowerCase().indexOf(needle);
    if (found === -1) return;
    ranked.push({ family, rank: found === 0 ? 0 : 1, at });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return ranked.map((entry) => entry.family);
}
