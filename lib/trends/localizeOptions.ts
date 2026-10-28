// Client-side localization for the trend picker's filter options. The backend
// serves industry and region names exactly as stored (English), and its value
// codes are stable on the wire — so the names are resolved here from those
// codes, the same way the rest of the app localizes enums, instead of plumbing
// a locale through a corpus shared by every tenant.
//
// Every resolver falls back to the server-provided name: `t()` never throws —
// a missing key renders its own dotted path — so an unknown code must degrade
// to the English name rather than to visible gibberish.

type Translate = (path: string) => string;

/** t(path), or `fallback` when the catalog has no such key. */
function translateOr(t: Translate, path: string, fallback: string): string {
  const value = t(path);
  return value === path ? fallback : value;
}

/** Localized industry (category level 1) name, keyed by its stable code. */
export function localizedIndustryName(
  t: Translate,
  category: { id: string; name: string },
): string {
  return translateOr(
    t,
    `appChat.trendModal.industryNames.${category.id}`,
    category.name,
  );
}

/** Localized region-group heading (united_states / europe / …). */
export function localizedRegionGroupName(
  t: Translate,
  group: { id: string; name: string },
): string {
  return translateOr(
    t,
    `appChat.trendModal.regionGroups.${group.id}`,
    group.name,
  );
}

/**
 * Localized country name from its ISO code via `Intl.DisplayNames` — no
 * dictionary needed, and it covers every locale at once. Codes Intl cannot
 * resolve (and environments without DisplayNames) fall back to the
 * server-provided English name.
 */
export function localizedCountryName(
  locale: string,
  country: { code: string; name: string },
): string {
  try {
    const resolved = new Intl.DisplayNames([locale], {
      type: "region",
    }).of(country.code.toUpperCase());
    // `of()` echoes the input back for codes it has no name for.
    if (resolved && resolved !== country.code.toUpperCase()) return resolved;
  } catch {
    // Invalid code or no DisplayNames support — fall through.
  }
  return country.name;
}

/**
 * Compact view count in the active locale — "44.6M" on an English UI,
 * "4460萬" on a Traditional Chinese one, "44,6 Tr" on a Vietnamese one. The
 * old hand-rolled version hardcoded `.toFixed(1)`, which rendered a dot
 * decimal in every locale.
 */
export function formatTrendViews(
  views: number | undefined,
  locale: string,
): string {
  if (!views || views <= 0) return "";
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(views);
  } catch {
    return String(views);
  }
}
