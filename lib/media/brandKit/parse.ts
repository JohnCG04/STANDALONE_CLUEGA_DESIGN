// Wire -> domain mapping for the Brand Kit API.
//
// Split out from the requests in ./client.ts so the field-by-field translation
// can be tested without a fetch. Everything here is pure.
//
// The rule these functions exist to enforce: §7.2 promises "every key is always
// present in a response, empty or not, so you never need to check for existence
// before reading". That is a promise about a healthy deployment, not about the
// four proxy hops in front of it — so the promise is kept HERE, and nothing
// downstream needs `?.` on a style guide.
//
// `parseKit` is the deliberate exception. See its doc block.

import type {
  Brand,
  BrandDocumentExtraction,
  BrandKitDoc,
  BrandKitTemplate,
  BrandKitTemplateListWire,
  BrandKitTemplateWire,
  BrandListWire,
  BrandLogo,
  BrandPhotography,
  BrandPromptRules,
  BrandSpacing,
  BrandStyleGuide,
  BrandStyleGuideWire,
  BrandTextStyle,
  BrandWire,
} from "./types";

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

const bool = (value: unknown): boolean => value === true;

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Non-empty strings only: a blank entry is not a colour, a font or a rule. */
const strs = (value: unknown): string[] =>
  arr(value).filter((entry): entry is string => typeof entry === "string" && entry !== "");

const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function emptyPhotography(): BrandPhotography {
  return {
    brand_assets: [],
    assets_description: "",
    lighting: "",
    mood: "",
    composition: "",
    color_treatment: "",
  };
}

export function emptySpacing(): BrandSpacing {
  return { composition_styles: "", white_space: "", custom_rules: [] };
}

export function emptyPromptRules(): BrandPromptRules {
  return { do: [], dont: [] };
}

/** A style guide with every key present and every value empty. */
export function emptyStyleGuide(): BrandStyleGuide {
  return {
    colors: [],
    tone: "",
    mission: "",
    text_styles: [],
    logos: [],
    photography: emptyPhotography(),
    spacing: emptySpacing(),
    prompt_rules: emptyPromptRules(),
    disclaimers: [],
    banned_claims: [],
    palette: "",
    typography: "",
    camera_language: "",
    lighting: "",
    fonts: [],
    logo_artifact_id: "",
    do_nots: [],
  };
}

function parseTextStyle(value: unknown): BrandTextStyle {
  const row = obj(value);
  return {
    role: str(row.role),
    label: str(row.label),
    font_family: str(row.font_family),
    font_size: str(row.font_size),
    bold: bool(row.bold),
    italic: bool(row.italic),
  };
}

function parseLogo(value: unknown): BrandLogo {
  const row = obj(value);
  return { artifact_id: str(row.artifact_id), variant: str(row.variant) };
}

function parsePhotography(value: unknown): BrandPhotography {
  const row = obj(value);
  return {
    brand_assets: strs(row.brand_assets),
    assets_description: str(row.assets_description),
    lighting: str(row.lighting),
    mood: str(row.mood),
    composition: str(row.composition),
    color_treatment: str(row.color_treatment),
  };
}

function parseSpacing(value: unknown): BrandSpacing {
  const row = obj(value);
  return {
    composition_styles: str(row.composition_styles),
    white_space: str(row.white_space),
    custom_rules: strs(row.custom_rules),
  };
}

function parsePromptRules(value: unknown): BrandPromptRules {
  const row = obj(value);
  return { do: strs(row.do), dont: strs(row.dont) };
}

/**
 * A style guide the UI is allowed to read: same data, nothing undefined.
 *
 * A row of `text_styles` missing its `role` becomes `role: ""` rather than
 * being dropped — the editor can still show and fix it, and dropping a row
 * would silently shorten a list the next PATCH replaces wholesale.
 */
export function parseStyleGuide(
  wire: BrandStyleGuideWire | null | undefined,
): BrandStyleGuide {
  if (!wire) return emptyStyleGuide();
  return {
    colors: strs(wire.colors),
    tone: str(wire.tone),
    mission: str(wire.mission),
    text_styles: arr(wire.text_styles).map(parseTextStyle),
    logos: arr(wire.logos).map(parseLogo).filter((logo) => logo.artifact_id !== ""),
    photography: parsePhotography(wire.photography),
    spacing: parseSpacing(wire.spacing),
    prompt_rules: parsePromptRules(wire.prompt_rules),
    disclaimers: strs(wire.disclaimers),
    banned_claims: strs(wire.banned_claims),
    palette: str(wire.palette),
    typography: str(wire.typography),
    camera_language: str(wire.camera_language),
    lighting: str(wire.lighting),
    fonts: strs(wire.fonts),
    logo_artifact_id: str(wire.logo_artifact_id),
    do_nots: strs(wire.do_nots),
  };
}

/**
 * The kit, asserted to be an object and otherwise UNTOUCHED.
 *
 * Deliberately an identity function, not a walk. §2: "post back exactly what
 * you were handed. Do not map fields between them. Field mapping in the client
 * is where a value quietly goes missing." A field-by-field parse would drop
 * every unknown key by construction — `templateId`, `sourceMeta`, `confidence`,
 * `trainedAt` — and §4 promises they survive. They survive because nothing here
 * copies them: the same reference goes back out.
 */
export function parseKit(value: unknown): BrandKitDoc {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as BrandKitDoc)
    : {};
}

/** One brand, or null when the row carries no id to key it by. */
export function parseBrand(wire: BrandWire | null | undefined): Brand | null {
  if (!wire) return null;
  // The service's own name is `brand_id`; `id` is accepted as a fallback
  // because the media endpoints in this codebase have answered in more than
  // one shape before (see uploadBrandLogo's id ladder).
  const brandId = str(wire.brand_id) || str(wire.id);
  if (!brandId) return null;
  return {
    brand_id: brandId,
    name: str(wire.name),
    description: str(wire.description),
    style_guide: parseStyleGuide(wire.style_guide as BrandStyleGuideWire | null),
    source_kit: parseKit(wire.source_kit),
    unreadable_logos: strs(wire.unreadable_logos),
    // Absent on a service that predates the default, and on every row of a
    // listing written before it — `bool` reads that as "not chosen", which is
    // exactly what it means.
    is_default: bool(wire.is_default),
    created_at: str(wire.created_at),
    updated_at: str(wire.updated_at),
  };
}

/**
 * Every brand this tenant has.
 *
 * The service answers `{items: [...]}`. A bare array is accepted too, because a
 * listing that changed shape should degrade to "no brands", not to a crash.
 */
export function parseBrandList(body: BrandListWire): Brand[] {
  const rows = Array.isArray(body) ? body : arr(obj(body).items);
  return rows
    .map((row) => parseBrand(row as BrandWire))
    .filter((brand): brand is Brand => brand !== null);
}

export function parseTemplate(
  wire: BrandKitTemplateWire | null | undefined,
): BrandKitTemplate | null {
  if (!wire) return null;
  const id = str(wire.id);
  if (!id) return null;
  return {
    id,
    name: str(wire.name),
    summary: str(wire.summary),
    kit: parseKit(wire.kit),
  };
}

/** Rows with no id are dropped: nothing downstream can key or select them. */
export function parseTemplateList(
  body: BrandKitTemplateListWire,
): BrandKitTemplate[] {
  return arr(obj(body).items)
    .map((row) => parseTemplate(row as BrandKitTemplateWire))
    .filter((template): template is BrandKitTemplate => template !== null);
}

/**
 * The `extraction` block on a document import, made total.
 *
 * Every field is defaulted rather than validated. This block is a REPORT about
 * how a reading went, not the brand itself — a deployment that answers without
 * it, or with a field this build has not met, must still hand the user their
 * brand rather than an error about a diagnostic.
 *
 * `logoSource` is narrowed because a screen branches on it. Anything
 * unrecognised reads as `"none"`, which shows no claim about a mark at all —
 * the safe end of the three.
 */
export function parseBrandDocumentExtraction(
  body: unknown,
): BrandDocumentExtraction {
  const raw = obj(obj(body).extraction);
  const source = String(raw.logo_source ?? "");
  return {
    documentKind: String(raw.document_kind ?? ""),
    textChars: Number(raw.text_chars ?? 0) || 0,
    textTruncated: raw.text_truncated === true,
    imagesFound: Number(raw.images_found ?? 0) || 0,
    imagesSent: Number(raw.images_sent ?? 0) || 0,
    logoSource:
      source === "model" || source === "fallback" ? source : "none",
    fieldsFilled: arr(raw.fields_filled).map(String),
    factCount: Number(raw.fact_count ?? 0) || 0,
    droppedUngrounded: arr(raw.dropped_ungrounded).map(String),
  };
}
