// A data source's label for every dashboard surface (panel header, widget
// footer, widget picker, composer chip, cards, filters), so a raw slug never
// reaches a header badge or a prompt sent to the agent.
//
// The NAME comes from the served vocabulary (`platforms[].label`), never from a
// table here: a source the backend adds names itself. What this module owns is
// only the neutral reading of a slug the vocabulary has not named (not loaded
// yet, or a stored board bound to a source no longer served): `google_ads`
// reads "Google Ads", and `composio:<toolkit>` reads as the toolkit, humanised.
import { toBackendLocale } from "@/lib/ai-agent/cluega-session-auth";
import { getDashboardVocabulary } from "@/lib/dashboard/vocabulary";

/** The prefix of a source served through Composio: `composio:<toolkit>`. */
const COMPOSIO_PREFIX = "composio:";

/** The toolkit of a `composio:<toolkit>` source, or null for any other slug. */
export function composioToolkit(source: string): string | null {
  if (!source.startsWith(COMPOSIO_PREFIX)) return null;
  const toolkit = source.slice(COMPOSIO_PREFIX.length).trim();
  return toolkit || null;
}

/** Slug words whose brand casing is not plain capitalisation (`tiktok` -> "TikTok"). */
const BRAND_WORDS: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" };

/** A toolkit slug as words, each capitalised: `google_sheets` -> "Google Sheets". */
function humanizeToolkit(toolkit: string): string {
  return toolkit
    .split("_")
    .flatMap((part) => part.split("-"))
    .filter(Boolean)
    .map((word) => BRAND_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A source's label: the vocabulary's own name for it (in `lang`, else English,
 * else whatever it served), else the neutral reading of the slug. The one rule
 * for every dashboard surface.
 */
export function dashboardPlatformLabel(app: string, lang?: string | null): string {
  const names = getDashboardVocabulary()?.platforms?.find((p) => p.app === app)?.label;
  if (names) {
    const locale = toBackendLocale(lang) as keyof typeof names;
    const served = names[locale] ?? names.en ?? Object.values(names).find(Boolean);
    if (typeof served === "string" && served.trim()) return served;
  }
  const toolkit = composioToolkit(app);
  if (toolkit) return humanizeToolkit(toolkit);
  return humanizeToolkit(app);
}

/**
 * The platforms the filter offers for PERSONAL dashboards.
 *
 * Read from the served vocabulary, which is the single source of truth: the
 * server decides what it can deliver, serves that list, and refuses a binding
 * outside it on write. The Add-widget picker reads the same list, so the two
 * menus cannot disagree.
 *
 * `null` sets mean the vocabulary has not loaded — a first paint, or a failed
 * fetch — and then no platform is offered: the menu holds only "all" until the
 * server says what it delivers. Showing a platform that cannot be chosen is
 * worse than briefly showing none, because the filter it produces returns
 * nothing and looks broken (BUG-62-RD-X-07).
 *
 * NOT A FILTER ON WHAT LOADS. A board bound to a platform no longer offered
 * still lists, still opens and still renders; it simply is not an option in
 * this menu, and the page drops such a value out of the URL (see
 * `canonicalizePlatform`).
 *
 * 【中文】個人儀表板的平台選項取自伺服器詞彙表，而非寫死清單。
 */
export function dashboardPlatformOptions(
  sets: { apps: Set<string> } | null,
): string[] {
  if (sets) return [...sets.apps].sort();
  return [];
}
