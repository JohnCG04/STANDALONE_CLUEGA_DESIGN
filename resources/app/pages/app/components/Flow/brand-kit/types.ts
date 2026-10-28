import type { BrandDraft } from "@/lib/media/brandKit";

/** The nine sections of the editor, in the order the rail lists them. */
export type BrandSectionId =
  | "mission"
  | "colors"
  | "typography"
  | "logo"
  | "photography"
  | "tone"
  | "layout"
  | "rules"
  | "compliance";

/**
 * How full a section is, as the nav dot shows it.
 *
 * `invalid` outranks the other three: a red dot is the only way to find the
 * field that refused to save, whether it was refused locally (a malformed hex)
 * or by §8's write-time moderation.
 */
export type SectionCompleteness = "invalid" | "empty" | "partial" | "complete";

/** One row of the section rail. */
export type BrandSectionStatus = {
  id: BrandSectionId;
  completeness: SectionCompleteness;
  /** Differs from the baseline — drives the "edited" mark, and the PATCH body. */
  dirty: boolean;
};

/** What the editor knows about the brand behind the URL. */
export type BrandEditorState =
  | { status: "loading" }
  /** No brand answers to this id — deleted, or another tenant's (§9: a 404). */
  | { status: "missing" }
  | { status: "error"; retry: () => void }
  | { status: "ready" };

/** A card on the landing grid: one saved brand, or one sample template. */
export type BrandKitCardModel = {
  /** A `brand_…` id for a saved brand, a template id for a sample. */
  id: string;
  kind: "brand" | "template";
  name: string;
  /** A template's one-line summary (§3). Saved brands have a description. */
  summary: string;
  /** Brand colours first, then neutrals — §4's own projection order. */
  hexes: string[];
  /** The display and body families, for the two "Aa" chips. */
  displayFont: string;
  bodyFont: string;
  /** The first photography asset — the card's cover. "" ⇒ a plain fill. */
  coverUrl: string;
  /** The first logo — the one composited onto renders. "" ⇒ no logo drawn. */
  logoUrl: string;
};

/** A colour-picker draft, before it is committed to the section. */
export type ColorEditTarget = {
  /** The index being edited, or null while adding a new one. */
  index: number | null;
  value: BrandDraft["colors"][number];
};

/** The typography row being edited, if any. */
export type TextStyleEditTarget = {
  index: number | null;
  value: BrandDraft["textStyles"][number];
};

/** One bar of a composition card's little skeleton illustration, in percent. */
export type LayoutGlyphBar = { x: number; y: number; w: number; h: number };

/** One radio card in the Spacing and Layout section. */
export type RadioCardOption<T extends string> = {
  value: T;
  labelKey: string;
  captionKey: string;
  glyph: readonly LayoutGlyphBar[];
};

/** §7's "Composition Styles" → `layout.composition` → `spacing.composition_styles`. */
export type CompositionStyle =
  | "centered_symmetric"
  | "left_aligned_structured"
  | "dynamic_organic"
  | "dense_info_rich"
  | "minimal_spacious";

/** §7's "White Space" → `layout.whitespace` → `spacing.white_space`. */
export type WhiteSpace = "generous" | "balanced" | "tight";

/** One selectable pill. */
export type BrandChipOption = { value: string };
