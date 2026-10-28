// One display name per model, whatever route it arrived by.
//
// The cost book stores the id the caller sent, and the same house's models
// reach it under ids of three different shapes: the host's own default is bare
// ("google/gemini-3.1-flash-image-preview"), a model picked in the workflow
// editor carries the router that served it ("openrouter/google/gemini-3-pro-
// image-preview"), and the image catalog reports the family as the vendor
// ("gemini/imagen-4.0-generate-001"). Printed verbatim, the same page shows
// three spellings of one brand and the reader cannot tell which differences are
// real models and which are plumbing.
//
// So every block on the page prints `formatModelLabel` instead: the ROUTER is
// dropped (it names who billed the call, not who made the model), and what is
// left reads "Google - Gemini 3 Pro Image" — house first, then the model.
//
// The raw id is NOT rewritten. It stays on `modelId`, which is what the model
// facet and the ledger filter send back to the API, and it stays reachable in
// the UI as the `title` of the cell that shows the label — a name this module
// prettifies must still be resolvable to the exact model that was charged.

/**
 * Namespaces that say who ROUTED a call rather than who authors the model.
 * Dropped before the brand is read. Mirrors ROUTER_NAMESPACES in the
 * composer's modelGroups, which folds the same prefix for the model picker.
 */
const ROUTER_NAMESPACES = new Set(["openrouter"]);

/**
 * Brands whose slug does not title-case into the name the house writes.
 * Deliberately small: everything else goes through `titleCaseWords`, so this
 * table only holds the ones that would come out wrong ("Openai", "Deepseek").
 *
 * `gemini` is here as a BRAND, not a family: the image/video catalog reports it
 * in the vendor position, and folding it to Google is what makes
 * "gemini/imagen-4.0" and "google/gemini-3-pro" agree on one house.
 */
const BRAND_LABELS: Record<string, string> = {
  "ai21": "AI21",
  "bytedance": "ByteDance",
  "deepseek": "DeepSeek",
  "elevenlabs": "ElevenLabs",
  "gemini": "Google",
  "google-vertex": "Google Vertex",
  "meta-llama": "Meta",
  "minimax": "MiniMax",
  "mistralai": "Mistral",
  "moonshotai": "Moonshot",
  "openai": "OpenAI",
  "stabilityai": "Stability AI",
  "x-ai": "xAI",
  "z-ai": "Z.AI",
  "zhipuai": "Zhipu AI",
};

/**
 * Family keyword → the house it belongs to, for an id that carries NO vendor
 * segment at all (a bare "gemini-flash-latest" alongside a namespaced sibling).
 * Mirrors KEYWORD_PROVIDERS in modelGroups for the same reason it exists there:
 * without it the same model reads as two different things depending on which
 * catalog handed it over.
 */
const KEYWORD_BRANDS: ReadonlyArray<readonly [string, string]> = [
  ["gemini", "google"],
  ["imagen", "google"],
  ["gemma", "google"],
];

/**
 * Trailing words that describe a model's RELEASE CHANNEL, not the model. Both
 * are dropped: "preview" and "latest" move without the model changing, and a
 * label that keeps them makes one model look like two.
 */
const CHANNEL_WORDS = new Set(["preview", "latest"]);

/** Letters only, no vowel, short — an acronym the reader expects in caps. */
const ACRONYM = /^[a-z]{2,4}$/;

function titleCaseWord(word: string): string {
  // A version or a variant token ("3.1", "4o") is already written the way its
  // house writes it — capitalising it would only get it wrong.
  if (/\d/.test(word)) return word;
  if (ACRONYM.test(word) && !/[aeiou]/.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * "gemini-3-pro-image-preview" → "Gemini 3 Pro Image".
 *
 * The dot is NOT a separator: splitting on it would turn the version "3.1" into
 * the two words "3 1".
 */
function titleCaseWords(slug: string): string {
  const words = slug.split(/[-_/\s]+/).filter(Boolean);
  // Only the TAIL is trimmed, and never to nothing: a model whose whole name is
  // a channel word keeps the one word it has.
  while (words.length > 1 && CHANNEL_WORDS.has(words[words.length - 1])) {
    words.pop();
  }
  return words.map(titleCaseWord).join(" ");
}

/** The brand's own spelling of its name, from the slug in the vendor position. */
function brandLabel(slug: string): string {
  return BRAND_LABELS[slug] ?? titleCaseWords(slug);
}

/**
 * The label every block on the page prints for a model id.
 *
 * "openrouter/google/gemini-3-pro-image-preview" → "Google - Gemini 3 Pro Image"
 * "google/gemini-3.1-flash-image-preview"        → "Google - Gemini 3.1 Flash Image"
 * "gemini-flash-latest"                          → "Google - Gemini Flash"
 * "veo-3.1"                                      → "Veo 3.1"
 *
 * An empty id comes back EMPTY rather than as a placeholder: only the caller
 * knows what unattributed spend should be called (see UNATTRIBUTED_MODEL), and
 * inventing a name here would hide that the book never learned one.
 */
export function formatModelLabel(rawId: string): string {
  const id = rawId.trim().toLowerCase();
  if (id === "") return "";

  const segments = id.split("/").filter(Boolean);
  // Stripped even when it is all there is: a router prefix with nothing behind
  // it names no model, and printing "Openrouter" would invent one.
  while (segments.length > 0 && ROUTER_NAMESPACES.has(segments[0])) {
    segments.shift();
  }
  if (segments.length === 0) return "";

  if (segments.length > 1) {
    const [brand, ...rest] = segments;
    return `${brandLabel(brand)} - ${titleCaseWords(rest.join("/"))}`;
  }

  // No vendor segment: name the house from the family when we can recognise it,
  // and otherwise print the model alone rather than guess a brand.
  const bare = segments[0];
  const name = titleCaseWords(bare);
  for (const [keyword, brand] of KEYWORD_BRANDS) {
    if (bare.includes(keyword)) return `${brandLabel(brand)} - ${name}`;
  }
  return name;
}
