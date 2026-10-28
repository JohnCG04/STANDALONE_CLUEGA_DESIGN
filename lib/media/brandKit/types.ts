/**
 * The three shapes the Brand Kit deals in. Read `brandkit.md` §2 first.
 *
 *   BrandKitDoc     the kit (camelCase). STRUCTURALLY OPEN, never rebuilt.
 *   BrandStyleGuide the projection (snake_case). TOTAL — §7.2 promises every
 *                   key is present, and `parse.ts` makes that true.
 *   BrandDraft      what the editor binds to: the union of both.
 *
 * A third model is needed because neither wire shape holds everything the nine
 * sections show: the kit has no `disclaimers` or `italic`, and the style_guide
 * has nowhere for a colour's NAME, `mission.values` or `tone.soundsLike`. Each
 * draft field below says which side it can reach.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The kit — brandkit.md §4 / §7.1
// ─────────────────────────────────────────────────────────────────────────────

export type BrandKitMission = {
  statement?: string;
  /** Stored only: the style_guide has no home for these. */
  values?: string[];
  [extra: string]: unknown;
};

export type BrandKitTone = {
  /** Joined into the style_guide's `tone`. */
  personality?: string[];
  /**
   * Stored only. §4: "these describe how the brand WRITES; the prompt is read
   * by something drawing a picture".
   */
  soundsLike?: string;
  doesntSoundLike?: string;
  samplePhrases?: string[];
  vocabulary?: {
    use?: string[];
    /** → `banned_claims`. ENFORCED: stripped from prompts and narration (§6). */
    avoid?: string[];
    [extra: string]: unknown;
  };
  [extra: string]: unknown;
};

export type BrandKitColor = {
  name?: string;
  hex?: string;
  role?: string;
  usage?: string;
  variants?: Record<string, unknown>;
};

export type BrandKitColors = {
  /** Projected first. */
  brand?: BrandKitColor[];
  /** Projected second. */
  neutrals?: BrandKitColor[];
  /** NOT projected — §4's table names only brand then neutrals. */
  semantic?: BrandKitColor[];
  [extra: string]: unknown;
};

/** §7.1's enumerated roles. Anything else is kept as `custom` + a label. */
export const BRAND_KIT_TYPE_ROLES = [
  "display",
  "heading",
  "subheading",
  "body",
  "caption",
  "button",
  "accent",
] as const;

export type BrandKitTypeRole = (typeof BRAND_KIT_TYPE_ROLES)[number];

export type BrandKitTextStyle = {
  /** A BrandKitTypeRole, or any word (kept as `custom` with the word as label). */
  role?: string;
  fontFamily?: string;
  /** `>= 600` → `bold: true`. */
  weight?: number;
  /** `72` → `font_size: "72px"`. */
  size?: number;
  lineHeight?: number;
  letterSpacing?: number;
  usage?: string;
};

export type BrandKitTypography = {
  styles?: BrandKitTextStyle[];
  [extra: string]: unknown;
};

export type BrandKitLogoVariant = {
  /** → `logos[].variant`. `primary` is sorted first (§9). */
  type?: string;
  /**
   * → `logos[].artifact_id`. §7.3: a public https URL is accepted directly, so
   * a kit needs no upload step.
   */
  assetUrl?: string;
  fileName?: string;
  format?: string;
};

export type BrandKitLogo = {
  /** Empty in every template (§3) — a logo is the user's own mark. */
  variants?: BrandKitLogoVariant[];
  rules?: {
    clearSpace?: number;
    minimumSize?: number;
    /** Merged into `prompt_rules.dont` AHEAD of the rule items' donts. */
    donts?: string[];
    [extra: string]: unknown;
  };
  [extra: string]: unknown;
};

export type BrandKitPhotography = {
  /** → `photography.brand_assets`. §9: STORED, NEVER sent to the model. */
  moodboard?: string[];
  style?: {
    lighting?: string[];
    mood?: string[];
    composition?: string[];
    colorTreatment?: string[];
    [extra: string]: unknown;
  };
  /** → `assets_description`. The only part of photography that reaches a prompt. */
  subjectMatter?: string;
  /** Stored only. */
  avoid?: string;
  [extra: string]: unknown;
};

export type BrandKitLayout = {
  composition?: string;
  whitespace?: string;
  /** Stored only. */
  patterns?: string[];
  /** One string that becomes a one-entry `spacing.custom_rules[]`. */
  customRules?: string;
  [extra: string]: unknown;
};

export type BrandKitRule = {
  id?: string;
  /** `do` | `dont`. Anything else is not projected. */
  type?: string;
  /** Stored only — no style_guide home. */
  category?: string;
  text?: string;
  imageUrl?: string;
};

export type BrandKitRules = {
  items?: BrandKitRule[];
  [extra: string]: unknown;
};

/**
 * The Brand Kit document (§4).
 *
 * The index signature is load-bearing. §4 promises `id`, `trainedAt`,
 * `confidence`, `sourceMeta` "and anything else your extractor adds" survive,
 * and §3 stashes `templateId` on the document — they do because nothing ever
 * REBUILDS a kit: `draftToKit` spreads the original.
 *
 * EVERY nested branch carries the same signature, not just this level, because
 * §4's promise is about the document. A strict nested type would say the
 * opposite of what the code does.
 */
export interface BrandKitDoc {
  name?: string;
  mission?: BrandKitMission;
  tone?: BrandKitTone;
  colors?: BrandKitColors;
  typography?: BrandKitTypography;
  logo?: BrandKitLogo;
  photography?: BrandKitPhotography;
  layout?: BrandKitLayout;
  rules?: BrandKitRules;
  [extra: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// The style guide — brandkit.md §7.2
// ─────────────────────────────────────────────────────────────────────────────

export type BrandTextStyle = {
  /** A §7.1 role, or "custom". */
  role: string;
  /** The original word when `role` is "custom". */
  label: string;
  font_family: string;
  /** "72px". */
  font_size: string;
  bold: boolean;
  /** style_guide-only: the kit schema has no italic. */
  italic: boolean;
};

export type BrandLogo = {
  /**
   * §7.3: an https URL, a storage id, or a dev path. §9: rewritten server-side
   * when an SVG is converted to PNG, so the value read back may differ from the
   * `assetUrl` that was sent.
   */
  artifact_id: string;
  variant: string;
};

export type BrandPhotography = {
  /** §9: stored and returned, but NEVER attached to a render. */
  brand_assets: string[];
  assets_description: string;
  lighting: string;
  mood: string;
  composition: string;
  color_treatment: string;
};

export type BrandSpacing = {
  composition_styles: string;
  white_space: string;
  custom_rules: string[];
};

export type BrandPromptRules = { do: string[]; dont: string[] };

/**
 * The projection the service renders from (§7.2).
 *
 * TOTAL on purpose: §7.2 says "every key is always present in a response, empty
 * or not, so you never need to check for existence before reading" — and
 * `parse.ts` makes that true for the UI even when a deployment drops one.
 *
 * NOT the PATCH body type. Sending this whole object would write `""`/`[]` over
 * every untouched field, and §5 says `""`/`[]` CLEARS. See BrandStyleGuidePatch.
 */
export type BrandStyleGuide = {
  colors: string[];
  tone: string;
  mission: string;
  text_styles: BrandTextStyle[];
  logos: BrandLogo[];
  photography: BrandPhotography;
  spacing: BrandSpacing;
  prompt_rules: BrandPromptRules;
  /** Composited verbatim (§9). No kit equivalent — style_guide-only. */
  disclaimers: string[];
  banned_claims: string[];

  // ── legacy scalars (§7.2) ────────────────────────────────────────────────
  // "For new clients, ignore the legacy fields entirely" — which is safe for
  // READING and unsafe for writing. See patch.ts for the three that have to be
  // actively cleared as their content is adopted.
  palette: string;
  typography: string;
  camera_language: string;
  lighting: string;
  fonts: string[];
  /** Loses to `logos`, but only when `logos` is non-empty. */
  logo_artifact_id: string;
  /** JOINED with `prompt_rules.dont`, not overridden. */
  do_nots: string[];
};

/**
 * The PATCH body (§5). A separate type because the semantics live in it: an
 * omitted key is KEPT, a present-but-empty key is CLEARED.
 *
 * The three merge-one-level objects are Partial; the two lists-of-objects are
 * whole ("send the full list when editing one entry"). `palette`, `typography`,
 * `camera_language` and `lighting` are deliberately absent — the editor owns no
 * field for them, and omitted means kept, so they are never destroyed.
 */
export type BrandStyleGuidePatch = {
  colors?: string[];
  tone?: string;
  mission?: string;
  text_styles?: BrandTextStyle[];
  logos?: BrandLogo[];
  photography?: Partial<BrandPhotography>;
  spacing?: Partial<BrandSpacing>;
  prompt_rules?: Partial<BrandPromptRules>;
  disclaimers?: string[];
  banned_claims?: string[];
  fonts?: string[];
  logo_artifact_id?: string;
  do_nots?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand, template, request bodies
// ─────────────────────────────────────────────────────────────────────────────

export type Brand = {
  /** The service's own name for it — `brand_id`, not `id`. */
  brand_id: string;
  name: string;
  description: string;
  style_guide: BrandStyleGuide;
  /**
   * The document exactly as posted, untouched by PATCH (§5). `{}` for a brand
   * created through `POST /ads/brands` rather than import.
   */
  source_kit: BrandKitDoc;
  /**
   * `assetUrl`s that could not be fetched or converted (§4). "Show the user a
   * warning if it is not empty — those marks will not appear on renders, and
   * there is no later signal."
   */
  unreadable_logos: string[];
  /**
   * Whether the workspace chose this brand as its default — the one a job with
   * `use_brand` carries.
   *
   * `false` on every brand is a real state, and the one that means "this
   * workspace renders unbranded": there is no fallback, so owning a brand is
   * not the same as using one. lib/media/defaultBrand.ts is what asks the
   * service, and the only thing that should answer the question.
   */
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandKitTemplate = {
  /** Stable across deploys; the value to remember on select (§3). */
  id: string;
  name: string;
  /** "already whitespace-normalised, safe to render raw" (§3). */
  summary: string;
  /**
   * Post back unreshaped. `logo.variants` and `photography.moodboard` are empty
   * in EVERY template (§3) — collect the logo after the template is chosen.
   */
  kit: BrandKitDoc;
};

/** `POST /ads/brands` — the native shape (§5). */
export type BrandInput = {
  name: string;
  description?: string;
  style_guide: BrandStyleGuidePatch;
};

export type BrandPatch = {
  name?: string;
  description?: string;
  style_guide?: BrandStyleGuidePatch;
};

// ─────────────────────────────────────────────────────────────────────────────
// Wire mirrors — every field optional and mostly `unknown`
// ─────────────────────────────────────────────────────────────────────────────

// `unknown` rather than the typed shape, because `photography: null` and
// `text_styles: "…"` are both things a four-hop proxy chain can deliver and
// both would type-check past an optional typed field. The only guarantee a
// proxied JSON body carries is that it parsed.

export type BrandStyleGuideWire = {
  colors?: unknown;
  tone?: unknown;
  mission?: unknown;
  text_styles?: unknown;
  logos?: unknown;
  photography?: unknown;
  spacing?: unknown;
  prompt_rules?: unknown;
  disclaimers?: unknown;
  banned_claims?: unknown;
  palette?: unknown;
  typography?: unknown;
  camera_language?: unknown;
  lighting?: unknown;
  fonts?: unknown;
  logo_artifact_id?: unknown;
  do_nots?: unknown;
};

export type BrandWire = {
  brand_id?: unknown;
  id?: unknown;
  name?: unknown;
  description?: unknown;
  style_guide?: unknown;
  source_kit?: unknown;
  unreadable_logos?: unknown;
  is_default?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type BrandListWire = { items?: unknown } | BrandWire[] | null;

export type BrandKitTemplateWire = {
  id?: unknown;
  name?: unknown;
  summary?: unknown;
  kit?: unknown;
};

export type BrandKitTemplateListWire =
  | { count?: unknown; items?: unknown }
  | null;

// ─────────────────────────────────────────────────────────────────────────────
// The draft — what the editor binds to
// ─────────────────────────────────────────────────────────────────────────────

export type BrandDraftColor = {
  hex: string;
  /** kit-only */
  name: string;
  /** kit-only */
  role: string;
  /** kit-only */
  usage: string;
  /** kit-only */
  variants: Record<string, unknown>;
  /** Brand colours project first, then neutrals; semantic never projects. */
  group: "brand" | "neutral" | "semantic";
};

export type BrandDraftTextStyle = {
  /** Normalised: a §7.1 role, or "custom". */
  role: string;
  label: string;
  fontFamily: string;
  /** What the user picked, e.g. "72px". */
  fontSize: string;
  bold: boolean;
  /** style_guide-only */
  italic: boolean;
  /**
   * The kit's original weight, kept so an untouched `600` stays `600` rather
   * than being rewritten to `700` by the bold flag alone.
   */
  weight: number | null;
  /** kit-only */
  lineHeight: number | null;
  /** kit-only */
  letterSpacing: number | null;
  /** kit-only */
  usage: string;
};

export type BrandDraftLogo = {
  artifactId: string;
  variant: string;
  /** kit-only */
  fileName: string;
  /** kit-only */
  format: string;
};

export type BrandDraftRule = {
  id: string;
  type: "do" | "dont";
  /** kit-only */
  category: string;
  text: string;
  /** kit-only */
  imageUrl: string;
  /**
   * Which kit branch this rule came from.
   *
   * `logo.rules.donts` and `rules.items[type=dont]` both land in
   * `prompt_rules.dont`, so the editor shows ONE list — otherwise a logo dont
   * is invisible in the UI but still applies at render. This tag lets
   * `draftToKit` put each back where it came from.
   *
   * `legacy` is a `do_nots` entry adopted on load, written back into
   * `rules.items` with the legacy field cleared. See patch.ts.
   */
  origin: "rules" | "logoRules" | "legacy";
};

export type BrandDraft = {
  /** null ⇒ this is a create (POST /ads/brands/import). */
  brandId: string | null;
  name: string;
  description: string;

  /** 1. Mission and Values */
  mission: { statement: string; values: string[] };

  /** 2. Colors — one flat list; `group` splits it back into the kit. */
  colors: BrandDraftColor[];

  /** 3. Typography */
  textStyles: BrandDraftTextStyle[];

  /** 4. Logo */
  logos: BrandDraftLogo[];
  logoRules: { clearSpace: number | null; minimumSize: number | null };

  /** 5. Photography */
  photography: {
    moodboard: string[];
    lighting: string[];
    mood: string[];
    composition: string[];
    colorTreatment: string[];
    subjectMatter: string;
    /** kit-only */
    avoid: string;
  };

  /** 6. Tone of voice (+ words to avoid) */
  tone: {
    personality: string[];
    /** kit-only */
    soundsLike: string;
    /** kit-only */
    doesntSoundLike: string;
    /** kit-only */
    samplePhrases: string[];
    /** kit-only */
    vocabularyUse: string[];
    /** "words to avoid" → kit `tone.vocabulary.avoid` → `banned_claims` (§6). */
    vocabularyAvoid: string[];
  };

  /** 7. Spacing and Layout */
  layout: {
    composition: string;
    whitespace: string;
    customRules: string[];
    /** kit-only */
    patterns: string[];
  };

  /** 8. Do's and Don'ts — logo donts and rule items, as one list. */
  rules: BrandDraftRule[];

  /** 9. Compliance — style_guide-only; the kit has no field for this. */
  disclaimers: string[];

  // ── carried, not edited ──────────────────────────────────────────────────
  /**
   * The document this draft was seeded from, kept verbatim so `draftToKit` can
   * spread it and let every unknown key survive. `{}` for a blank brand.
   */
  sourceKit: BrandKitDoc;
  /**
   * The style_guide as last read from the server — the diff base for
   * `buildStyleGuidePatch`. An empty guide for a new brand.
   */
  baseline: BrandStyleGuide;
  /** The brand's name as last read, so a rename can be detected. */
  baselineName: string;
  /** From the last write's response. Non-empty ⇒ show the §4 warning. */
  unreadableLogos: string[];
};

/**
 * What `POST /ads/brands/import-document` reports about the reading.
 *
 * Everything here is about HOW the kit was arrived at, not what is in it — the
 * brand itself is the ordinary `Brand`. Two fields change what a screen shows:
 *
 * `logoSource` is `"fallback"` when nothing in the file looked like a mark and
 * the best candidate was taken anyway. Only the first logo is ever composited,
 * onto EVERY render, so that is the moment to show the mark and ask.
 *
 * `droppedUngrounded` lists what the model answered that the document does not
 * contain — a hex or a typeface has to appear in the file's words, in its theme
 * or in the pixels of a picture it embeds, or it is discarded as invented.
 */
export type BrandDocumentExtraction = {
  documentKind: string;
  textChars: number;
  textTruncated: boolean;
  imagesFound: number;
  imagesSent: number;
  logoSource: "model" | "fallback" | "none";
  fieldsFilled: string[];
  factCount: number;
  droppedUngrounded: string[];
};

/** A brand created from an uploaded guideline, and how the reading went. */
export type BrandDocumentImport = {
  brand: Brand;
  extraction: BrandDocumentExtraction;
};
