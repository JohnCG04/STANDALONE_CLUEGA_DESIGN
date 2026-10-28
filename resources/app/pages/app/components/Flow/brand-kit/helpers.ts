// Pure helpers for the Brand Kit screens: what a card shows, how full a section
// is, and whether a hex is a hex. No React, no fetch — see helpers.test.ts.

import {
  BrandKitError,
  draftForBlank,
  kitToDraft,
  type Brand,
  type BrandDraft,
  type BrandDraftTextStyle,
  type BrandKitTemplate,
} from "@/lib/media/brandKit";

import {
  CARD_PALETTE_MAX,
  COLOR_ROLE_GROUP,
  DEFAULT_TEXT_STYLE_ROLES,
  MODERATED_SECTIONS,
  REGULAR_WEIGHT,
} from "./constants";
import type {
  BrandKitCardModel,
  BrandSectionId,
  SectionCompleteness,
} from "./types";

type Translate = (path: string) => string;

const hasText = (value: string): boolean => value.trim().length > 0;

// ─────────────────────────────────────────────────────────────────────────────
// Hex
// ─────────────────────────────────────────────────────────────────────────────

/** Three- or six-digit hex, with or without the hash. */
const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHex = (value: string): boolean => HEX_PATTERN.test(value.trim());

/**
 * `e8521d` / `#E8521D` / `#e52` → `#E8521D`, or null when it is not a colour.
 *
 * Uppercased and expanded so two spellings of one colour compare equal — the
 * projection dedupes on the string, and `#fff` next to `#FFFFFF` would
 * otherwise both reach the renderer.
 */
export function normalizeHex(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;
  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return `#${full.toUpperCase()}`;
}

/**
 * HSV, because that is the space the picker's controls are shaped like: a
 * square of saturation against brightness, and a hue strip beside it. RGB has
 * no axis that maps onto either.
 *
 * `h` is 0..360, `s` and `v` are 0..1.
 */
export type Hsv = { h: number; s: number; v: number };

/** `#E8521D` → HSV, or null when it is not a colour. */
export function hexToHsv(value: string): Hsv | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);

  let h = 0;
  if (span !== 0) {
    if (max === r) h = 60 * (((g - b) / span) % 6);
    else if (max === g) h = 60 * ((b - r) / span + 2);
    else h = 60 * ((r - g) / span + 4);
  }
  return { h: h < 0 ? h + 360 : h, s: max === 0 ? 0 : span / max, v: max };
}

/**
 * HSV → `#RRGGBB`.
 *
 * The inverse of `hexToHsv` everywhere except on the greys: black is every hue
 * at once, so a round trip through a hex cannot carry one back. That is why the
 * picker keeps HSV as its own state and only reads a hex back in when the user
 * types one — otherwise dragging to the bottom of the square would lose the hue
 * the strip is still pointing at.
 */
export function hsvToHex({ h, s, v }: Hsv): string {
  const chroma = v * s;
  const second = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const base = v - chroma;
  const [r, g, b] =
    h < 60
      ? [chroma, second, 0]
      : h < 120
        ? [second, chroma, 0]
        : h < 180
          ? [0, chroma, second]
          : h < 240
            ? [0, second, chroma]
            : h < 300
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const channel = (value: number) =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────────────────────

/** The display and body families a kit names, for the card's two "Aa" chips. */
function fontPair(draft: BrandDraft): { displayFont: string; bodyFont: string } {
  const byRole = (role: string) =>
    draft.textStyles.find((style) => style.role === role && hasText(style.fontFamily))
      ?.fontFamily ?? "";
  const first = draft.textStyles.find((style) => hasText(style.fontFamily))?.fontFamily ?? "";
  const display = byRole("display") || byRole("heading") || first;
  const body = byRole("body") || byRole("caption") || "";
  return {
    displayFont: display,
    // Never the same chip twice: a kit with one family shows one.
    bodyFont: body && body !== display ? body : "",
  };
}

/**
 * The sample kits' own copy, translated on the CLIENT.
 *
 * §3 serves one authored English document to every tenant and the endpoint
 * takes no locale, so there is nothing to translate against server-side. The id
 * is the join key and §3 promises it is stable across deploys.
 *
 * Falls back to the server's string for an unknown id, so a template added to
 * the backend YAML shows up in English rather than as a raw i18n key.
 */
export function templateCopy(
  template: Pick<BrandKitTemplate, "id" | "name" | "summary"> & { kit: { name?: string } },
  t: Translate,
): { name: string; summary: string } {
  const nameKey = `appChat.brandKit.templates.${template.id}.name`;
  const summaryKey = `appChat.brandKit.templates.${template.id}.summary`;
  const name = t(nameKey);
  const summary = t(summaryKey);
  return {
    // `t()` echoes the dotted key on a miss, which is the only signal there is
    // that this deployment serves a template we have no copy for.
    name: name === nameKey ? template.kit.name || template.name : name,
    summary: summary === summaryKey ? template.summary : summary,
  };
}

/**
 * A template as a card.
 *
 * Drawn entirely from the kit, because §3 is explicit that `logo.variants` and
 * `photography.moodboard` are EMPTY in every template — "a logo is the one part
 * of a brand that cannot be sampled … and shipping invented asset URLs would
 * give you a gallery of broken images". So in practice a template card falls
 * back to its palette strip and two font chips.
 */
export function templateCard(
  template: BrandKitTemplate,
  t: Translate,
): BrandKitCardModel {
  const draft = kitToDraft(template.kit);
  return {
    id: template.id,
    kind: "template",
    ...templateCopy(template, t),
    hexes: paletteHexes(draft),
    ...fontPair(draft),
    coverUrl: draft.photography.moodboard[0] ?? "",
    logoUrl: draft.logos[0]?.artifactId ?? "",
  };
}

/** A saved brand as a card. */
export function brandCard(brand: Brand): BrandKitCardModel {
  const guide = brand.style_guide;
  return {
    id: brand.brand_id,
    kind: "brand",
    name: brand.name,
    summary: brand.description || guide.mission,
    hexes: guide.colors.slice(0, CARD_PALETTE_MAX),
    displayFont:
      guide.text_styles.find((style) => style.role === "display")?.font_family ||
      guide.text_styles[0]?.font_family ||
      guide.fonts[0] ||
      "",
    bodyFont:
      guide.text_styles.find((style) => style.role === "body")?.font_family ||
      guide.fonts[1] ||
      "",
    coverUrl: guide.photography.brand_assets[0] ?? "",
    // `logo_artifact_id` loses to `logos`, but only when `logos` is non-empty.
    logoUrl: guide.logos[0]?.artifact_id || guide.logo_artifact_id,
  };
}

/** Brand colours first, then neutrals — §4's own projection order. */
export function paletteHexes(draft: BrandDraft): string[] {
  return [
    ...draft.colors.filter((color) => color.group === "brand"),
    ...draft.colors.filter((color) => color.group === "neutral"),
  ]
    .map((color) => color.hex)
    .filter(Boolean)
    .slice(0, CARD_PALETTE_MAX);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section completeness — the nav dots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The slots each section has, which IS the definition of "complete".
 *
 * Logo and Compliance have one slot each, so they are binary rather than ever
 * amber. That is deliberate: a brand either has a mark or it does not, and half
 * a disclaimer is not a state worth encoding in a colour.
 */
export const SECTION_SLOTS: Record<
  BrandSectionId,
  readonly ((draft: BrandDraft) => boolean)[]
> = {
  mission: [
    (draft) => hasText(draft.mission.statement),
    (draft) => draft.mission.values.length > 0,
  ],
  colors: [
    (draft) => draft.colors.length > 0,
    (draft) => draft.colors.length > 0 && draft.colors.every((color) => hasText(color.name)),
  ],
  typography: [
    (draft) => draft.textStyles.length > 0,
    (draft) =>
      draft.textStyles.length > 0 &&
      draft.textStyles.every((style) => hasText(style.fontFamily)),
  ],
  logo: [(draft) => draft.logos.length > 0],
  photography: [
    (draft) => draft.photography.moodboard.length > 0,
    (draft) => draft.photography.lighting.length > 0,
    (draft) => draft.photography.mood.length > 0,
    (draft) => draft.photography.composition.length > 0,
    (draft) => draft.photography.colorTreatment.length > 0,
  ],
  tone: [
    (draft) => draft.tone.personality.length > 0 || hasText(draft.tone.soundsLike),
    (draft) => draft.tone.vocabularyAvoid.length > 0,
  ],
  layout: [
    (draft) => hasText(draft.layout.composition),
    (draft) => hasText(draft.layout.whitespace),
    (draft) => draft.layout.customRules.some(hasText),
  ],
  rules: [
    (draft) => draft.rules.some((rule) => rule.type === "do" && hasText(rule.text)),
    (draft) => draft.rules.some((rule) => rule.type === "dont" && hasText(rule.text)),
  ],
  compliance: [(draft) => draft.disclaimers.some(hasText)],
};

/** How many of a section's slots the draft has filled, out of how many exist. */
export function sectionFill(
  id: BrandSectionId,
  draft: BrandDraft,
): { filled: number; total: number } {
  const slots = SECTION_SLOTS[id];
  return {
    filled: slots.filter((slot) => slot(draft)).length,
    total: slots.length,
  };
}

/** The dot's state. `invalid` outranks everything it is set on. */
export function sectionCompleteness(
  id: BrandSectionId,
  draft: BrandDraft,
  invalidSections: ReadonlySet<BrandSectionId>,
): SectionCompleteness {
  if (invalidSections.has(id)) return "invalid";
  const { filled, total } = sectionFill(id, draft);
  if (filled === 0) return "empty";
  if (filled < total) return "partial";
  return "complete";
}

// ─────────────────────────────────────────────────────────────────────────────
// Dirty tracking
// ─────────────────────────────────────────────────────────────────────────────

/** Which slice of the draft a section owns, for the dirty comparison. */
export function sectionSlice(draft: BrandDraft, id: BrandSectionId): unknown {
  switch (id) {
    case "mission":
      return draft.mission;
    case "colors":
      return draft.colors;
    case "typography":
      return draft.textStyles;
    case "logo":
      return [draft.logos, draft.logoRules];
    case "photography":
      return draft.photography;
    case "tone":
      return draft.tone;
    case "layout":
      return draft.layout;
    case "rules":
      return draft.rules;
    case "compliance":
      return draft.disclaimers;
  }
}

/**
 * JSON with object keys sorted, so two drafts that differ only in key order
 * compare equal.
 *
 * Fifteen lines rather than a dependency: a kit is a few KB, and this runs once
 * per section per keystroke — cheaper than the render it guards.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

/** The sections whose slice differs between two drafts. */
export function dirtySections(
  draft: BrandDraft,
  baseline: BrandDraft,
  sections: readonly BrandSectionId[],
): Set<BrandSectionId> {
  const dirty = new Set<BrandSectionId>();
  for (const id of sections) {
    if (
      stableStringify(sectionSlice(draft, id)) !==
      stableStringify(sectionSlice(baseline, id))
    ) {
      dirty.add(id);
    }
  }
  return dirty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

/** The group a colour's role puts it in, so §4's projection order is kept. */
export const groupForRole = (role: string): "brand" | "neutral" | "semantic" =>
  COLOR_ROLE_GROUP[role] ?? "brand";

/** A failed save or delete, as the sentence the screen shows. */
export function describeBrandKitError(error: unknown, t: Translate): string {
  if (error instanceof BrandKitError) {
    switch (error.code) {
      case "not_found":
        return t("appChat.brandKit.error.notFound");
      case "has_products":
        // The backend's sentence names the count, so it is shown verbatim.
        return error.productCount > 0
          ? t("appChat.brandKit.deleteDialog.inUse").replace(
              "{count}",
              String(error.productCount),
            )
          : t("appChat.brandKit.deleteDialog.inUseUnknown");
      case "content_policy":
        return t("appChat.brandKit.error.contentPolicy");
      case "brand_claim":
        // §6: `matched` is the exact phrase, safe to show so the user can reword.
        return t("appChat.brandKit.error.brandClaim").replace(
          "{matched}",
          error.findings.map((finding) => finding.matched).join(", "),
        );
      case "unavailable":
        return t("appChat.brandKit.error.unavailable");
      default:
        return t("appChat.brandKit.error.generic");
    }
  }
  return t("appChat.brandKit.error.generic");
}

/**
 * A failed guideline upload, as the sentence the screen shows.
 *
 * Its own function rather than four more cases on `describeBrandKitError`,
 * for the reason `describeTemplatesError` below is: the same code means a
 * different thing here. A 404 on this surface is the deployment not serving
 * the endpoint, and `not_found` copy about "this brand no longer exists"
 * would be nonsense on a screen where no brand exists yet.
 */
export function describeDocumentImportError(
  error: unknown,
  t: Translate,
  maxBytes: number,
): string {
  if (error instanceof BrandKitError) {
    switch (error.code) {
      case "unsupported_document":
        return t("appChat.brandKit.error.unsupportedDocument");
      case "document_too_large":
        return t("appChat.brandKit.error.documentTooLarge").replace(
          "{max}",
          `${Math.floor(maxBytes / 1_000_000)} MB`,
        );
      case "no_brand_facts":
        return t("appChat.brandKit.error.noBrandFacts");
      case "extraction_failed":
        return t("appChat.brandKit.error.extractionFailed");
      case "content_policy":
        return t("appChat.brandKit.error.contentPolicy");
      case "unavailable":
      case "not_found":
        // A 404 here is the endpoint, not the brand.
        return t("appChat.brandKit.error.unavailable");
      default:
        return t("appChat.brandKit.error.generic");
    }
  }
  return t("appChat.brandKit.error.generic");
}

/**
 * A failed TEMPLATE listing, as its own sentence.
 *
 * `describeBrandKitError` cannot be reused verbatim here: its `not_found` copy
 * is "this brand kit no longer exists", which is true of an editor opened on a
 * deleted brand and nonsense about a catalogue that is the same for every
 * tenant. A 404 on this endpoint means the DEPLOYMENT does not serve it —
 * media-ai's `/ads/brand-kits/templates` is newer than the running build — so
 * the copy says that instead of blaming a brand nobody named.
 */
export function describeTemplatesError(error: unknown, t: Translate): string {
  if (error instanceof BrandKitError && error.code === "not_found") {
    return t("appChat.brandKit.samplesUnavailable");
  }
  return describeBrandKitError(error, t);
}

/**
 * The sections a refused save should mark red.
 *
 * §8 checks five specific fields but the error names only a CODE, so every
 * moderated section is marked. A banner with nowhere to look is worse.
 */
export function sectionsForError(error: unknown): BrandSectionId[] {
  if (error instanceof BrandKitError && error.code === "content_policy") {
    return [...MODERATED_SECTIONS];
  }
  return [];
}

/**
 * A blank kit, opened with the four type roles the design shows.
 *
 * Rows rather than an empty list because the Typography panel is a list of
 * styles to fill in, and an empty one reads as "this brand has no type" instead
 * of "name your display face". Every row starts with no family, so the section
 * is amber until they are named — which is exactly what its dot should say.
 */
export function blankDraftWithDefaultStyles(): BrandDraft {
  const draft = draftForBlank();
  const rows: BrandDraftTextStyle[] = DEFAULT_TEXT_STYLE_ROLES.map((role) => ({
    role,
    label: "",
    fontFamily: "",
    fontSize: role === "display" ? "72px" : role === "heading" ? "32px" : "16px",
    bold: role === "display" || role === "heading",
    italic: false,
    weight: REGULAR_WEIGHT,
    lineHeight: null,
    letterSpacing: null,
    usage: "",
  }));
  return { ...draft, textStyles: rows };
}
