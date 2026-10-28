// One display name per billable ACTION — the ledger's "Feature" column and the
// feature facet.
//
// The cost book stores the verb the job performed, verbatim and lowercase:
// "image.generate", "video.generate", "image.remove_background". The backend
// documents the column as an OPEN set — an action is derived from the job's own
// `operation`, so an upscale or an erase lands there without anything on either
// side having been taught the word. Printed raw, the column reads as a wire
// enum in a table that otherwise speaks in sentences.
//
// So the ledger prints `formatActionLabel` instead: the medium first, then what
// was done to it — "Image generation", "Image background removal". Same bargain
// formatModelLabel strikes: the raw value is NOT rewritten. It stays on
// `featureId`, which is what the facet sends back as the `action` filter, and
// stays reachable as the `title` of the cell showing the label.

/**
 * The mediums an action can name, in their written spelling. A segment that is
 * not one of these is title-cased like any other word — the set is open, and a
 * medium nobody has hard-coded must still print.
 */
const MEDIUM_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  text: "Text",
};

/**
 * Verbs whose noun form is not the slug with a suffix bolted on.
 *
 * Deliberately small: it holds the verbs this system actually books plus the
 * ones the open set is documented to produce. Everything else falls through to
 * the generic humaniser, which prints the words as they arrived rather than
 * guessing at English morphology.
 */
const ACTION_NOUNS: Record<string, string> = {
  generate: "generation",
  remove_background: "background removal",
  upscale: "upscaling",
  erase: "erasing",
  edit: "editing",
  enhance: "enhancement",
  translate: "translation",
  transcribe: "transcription",
};

/** Whole actions named after the node that books them; "Audio voice" says nothing. */
const ACTION_LABELS: Record<string, string> = {
  "audio.voice": "Voice generation",
  "audio.music": "Music generation",
  "audio.sfx": "Sound effects generation",
  "audio.translate": "Voice translation",
  "audio.transcribe": "Speech to text",
};

/** "remove_background" → "remove background". */
function humanize(slug: string): string {
  return slug.split(/[-_\s]+/).filter(Boolean).join(" ");
}

function sentenceCase(value: string): string {
  return value === "" ? "" : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The label every block prints for an action id.
 *
 * "image.generate"            → "Image generation"
 * "video.generate"            → "Video generation"
 * "image.remove_background"   → "Image background removal"
 * "audio.voice"               → "Voice generation"
 * "image.some_new_thing"      → "Image some new thing"
 * "moderation"                → "Moderation"
 *
 * An empty action comes back EMPTY rather than as a placeholder: only the
 * caller knows what an unnamed action should be called in its own column.
 */
export function formatActionLabel(rawAction: string): string {
  const action = rawAction.trim().toLowerCase();
  if (action === "") return "";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];

  const segments = action.split(".").filter(Boolean);
  if (segments.length === 0) return "";

  // A verb with no medium in front of it is the whole label: "moderation".
  if (segments.length === 1) {
    const only = segments[0];
    return sentenceCase(ACTION_NOUNS[only] ?? humanize(only));
  }

  const [medium, ...rest] = segments;
  // Anything past the second segment stays part of the verb — a deeper action
  // ("image.background.remove") names one operation, not a nested medium.
  const verb = rest.join("_");
  const noun = ACTION_NOUNS[verb] ?? humanize(verb);
  return `${MEDIUM_LABELS[medium] ?? sentenceCase(humanize(medium))} ${noun}`;
}
