import { BRAND_KIT_TYPE_ROLES, type BrandKitTypeRole } from "@/lib/media/brandKit";

import type {
  BrandChipOption,
  BrandSectionId,
  CompositionStyle,
  RadioCardOption,
  SectionCompleteness,
  WhiteSpace,
} from "./types";

/** The URL segment the pre-save editor lives at. */
export const NEW_BRAND_SEGMENT = "new";

/** A template is authored content, identical for every tenant (§3). */
export const TEMPLATES_STALE_MS = 24 * 60 * 60 * 1000;

/** The tenant's own brands move when this page saves. */
export const BRANDS_STALE_MS = 60_000;

/** Google's library is the same for everyone and moves monthly. */
export const FONT_CATALOGUE_STALE_MS = 24 * 60 * 60 * 1000;

/** How many families the picker asks Google to render at once. */
export const FONT_PREVIEW_LIMIT = 40;

/** Placeholder cards while the first list loads. */
export const SKELETON_CARD_COUNT = 6;

/** The moodboard cap the panel's own heading states (§9). */
export const PHOTOGRAPHY_MAX_ASSETS = 20;

/** How many swatches a card's palette strip prints before it stops. */
export const CARD_PALETTE_MAX = 6;

/** The landing grid, shared by the real grid and its skeleton so they agree. */
export const BRAND_KIT_GRID_CLASS =
  "mt-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5";

/**
 * The editor's two columns: a fixed nav rail, a panel that takes the rest.
 *
 * The column gap is wider than the row gap: without the rail's card, the gutter
 * is the only thing separating the columns. Stacked below `lg` the rail sits
 * above the panel, where 24px is still right.
 */
export const EDITOR_LAYOUT_CLASS =
  "mt-6 grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-x-20";

/**
 * The section rail, and one of its rows. Radix Tabs supplies the behaviour.
 *
 * No card around it: the panel beside it already bounds the rail, so a border
 * would be a second frame around the same nine words. The highlight is the
 * active row's own flat background, and `hover` is scoped to
 * `data-[state=inactive]` so the row being read does not shift under the cursor.
 *
 * `focus-visible:ring-inset` keeps the keyboard ring INSIDE the row — the
 * shared TabsTrigger rings in `--ring` (teal) with no inset, which read as a
 * second border a pixel outside the highlight.
 */
export const SECTION_NAV_LIST_CLASS =
  "h-auto w-full flex-col items-stretch justify-start gap-0.5 border-0 bg-transparent p-0";
export const SECTION_NAV_TRIGGER_CLASS =
  "grid w-full grid-cols-[10px_minmax(0,1fr)] items-start gap-x-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-neutral-500 hover:text-neutral-800 data-[state=inactive]:hover:bg-neutral-100/70 data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 data-[state=active]:shadow-none focus-visible:ring-inset focus-visible:ring-neutral-900/20 dark:text-neutral-400 dark:data-[state=inactive]:hover:bg-neutral-800/50 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-neutral-50 dark:focus-visible:ring-white/25";

/**
 * The dot beside a section — a border AND a fill, so it reads on both themes.
 * The technique is lifted from the TikTok builder's anchor nav; the palette is
 * ours, and every dot is paired with an sr-only word (colour is never the only
 * channel).
 */
export const SECTION_DOT_CLASS: Record<SectionCompleteness, string> = {
  complete: "border-emerald-500 bg-emerald-500",
  partial: "border-amber-500 bg-amber-400",
  empty: "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900",
  invalid: "border-red-500 bg-red-500",
};

/**
 * The dashed "Add new" tile.
 *
 * `self-start` so the row does not stretch it: a stretched grid item has a
 * definite height, and a definite height beats `aspect-square` — which left
 * this tile taller than the swatches by the height of their captions.
 */
export const ADD_TILE_CLASS =
  "flex aspect-square w-full flex-col items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-neutral-300 text-[12px] font-semibold text-neutral-500 transition-colors hover:border-blue-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-blue-500";

/**
 * A chip, selected and not.
 *
 * Selection is carried by the BORDER, not a fill: twelve chips inverted to
 * solid black read as a wall of buttons, and a fill is what hover needs.
 *
 * 12px of radius rather than a pill — a stadium chip this small is all end-cap
 * — and `h-7` rather than `max-h-7`, since every chip is one truncated line and
 * the "Add your own" field has to match it.
 *
 * Explicit `dark:` on every colour: the ChipGroup this was ported from has
 * none, which is why it could not simply be imported.
 */
export const CHIP_BASE_CLASS =
  "inline-flex h-7 max-w-full items-center gap-1 rounded-xl border px-2 text-[12px] font-medium transition-colors";
export const CHIP_IDLE_CLASS =
  "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60";
export const CHIP_SELECTED_CLASS =
  "border-neutral-900 bg-transparent text-neutral-900 hover:bg-neutral-50 dark:border-neutral-100 dark:bg-transparent dark:text-neutral-100 dark:hover:bg-neutral-800/60";

/**
 * Every multi-line field in the editor.
 *
 * The teal `--ring` on focus is traded for the border itself going black, so
 * nothing new appears outside the box. `resize-none` with `min-h-0` hands the
 * height back to each field's `rows` — the shared `min-h-24` otherwise floors a
 * 2-row field at four rows' worth. Long text scrolls inside the fixed box.
 */
export const BRAND_TEXTAREA_CLASS =
  "min-h-0 resize-none rounded-xl focus-visible:border-neutral-900 focus-visible:ring-0 focus-visible:ring-offset-0 dark:focus-visible:border-neutral-100";

/** The tile grid the Colors, Logo and Photography sections all use. */
export const TILE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-4";

/**
 * The Do/Don't row's left edge. The one place colour carries meaning — so the
 * select beside it repeats it in words.
 */
export const RULE_ACCENT_CLASS: Record<"do" | "dont", string> = {
  do: "border-l-4 border-l-emerald-500",
  dont: "border-l-4 border-l-red-500",
};

export const BRAND_SECTIONS: readonly BrandSectionId[] = [
  "mission",
  "colors",
  "typography",
  "logo",
  "photography",
  "tone",
  "layout",
  "rules",
  "compliance",
];

export const SECTION_LABEL_KEY: Record<BrandSectionId, string> = {
  mission: "appChat.brandKit.section.mission.title",
  colors: "appChat.brandKit.section.colors.title",
  typography: "appChat.brandKit.section.typography.title",
  logo: "appChat.brandKit.section.logo.title",
  photography: "appChat.brandKit.section.photography.title",
  tone: "appChat.brandKit.section.tone.title",
  layout: "appChat.brandKit.section.layout.title",
  rules: "appChat.brandKit.section.rules.title",
  compliance: "appChat.brandKit.section.compliance.title",
};

export const SECTION_DESCRIPTION_KEY: Record<BrandSectionId, string> = {
  mission: "appChat.brandKit.section.mission.description",
  colors: "appChat.brandKit.section.colors.description",
  typography: "appChat.brandKit.section.typography.description",
  logo: "appChat.brandKit.section.logo.description",
  photography: "appChat.brandKit.section.photography.description",
  tone: "appChat.brandKit.section.tone.description",
  layout: "appChat.brandKit.section.layout.description",
  rules: "appChat.brandKit.section.rules.description",
  compliance: "appChat.brandKit.section.compliance.description",
};

/** Spoken by the sr-only span inside a nav row. */
export const SECTION_STATUS_LABEL_KEY: Record<SectionCompleteness, string> = {
  complete: "appChat.brandKit.status.complete",
  partial: "appChat.brandKit.status.partial",
  empty: "appChat.brandKit.status.empty",
  invalid: "appChat.brandKit.status.invalid",
};

/**
 * Which section §8's moderated fields belong to, so a `content_policy` refusal
 * can turn the right dot red. The service names a CODE, not a field, so all
 * five are marked — the alternative is a red banner with nowhere to look.
 */
export const MODERATED_SECTIONS: readonly BrandSectionId[] = [
  "mission",
  "photography",
  "layout",
  "rules",
];

// ─────────────────────────────────────────────────────────────────────────────
// Preset chips. Values are stable opaque ids; labels resolve through
// `appChat.brandKit.options.<group>.<value>`, so adding one is a line here plus
// three i18n entries.
// ─────────────────────────────────────────────────────────────────────────────

const options = (...values: string[]): readonly BrandChipOption[] =>
  values.map((value) => ({ value }));

/** §1 Mission and Values. */
export const VALUE_OPTIONS = options(
  "warmth", "craft", "clarity", "boldness", "playfulness", "precision",
  "sustainability", "inclusivity", "innovation", "trust", "simplicity", "quality",
);

/** §5 → `photography.style.lighting`. */
export const LIGHTING_OPTIONS = options(
  "soft_natural", "hard_directional", "golden_hour", "studio_strobe",
  "backlit", "low_key", "high_key", "neon", "overcast",
);

/** §5 → `photography.style.mood`. Moderated on save (§8). */
export const MOOD_OPTIONS = options(
  "warm", "tactile", "calm", "energetic", "luxurious", "playful",
  "editorial", "nostalgic", "clinical",
);

/** §5 → `photography.style.composition`. */
export const PHOTO_COMPOSITION_OPTIONS = options(
  "flat_lay", "centered_hero", "rule_of_thirds", "close_up_macro",
  "wide_environmental", "negative_space", "symmetrical", "candid",
);

/** §5 → `photography.style.colorTreatment`. */
export const COLOR_TREATMENT_OPTIONS = options(
  "monochrome", "warm_tones", "cool_tones", "high_contrast",
  "desaturated", "pastel", "saturated_bold", "film_grain",
);

/** §6 → `tone.personality` → the style guide's `tone`. */
export const PERSONALITY_OPTIONS = options(
  "warm", "optimistic", "confident", "direct", "playful",
  "calm", "premium", "technical", "witty",
);

/**
 * §6 → `tone.vocabulary.avoid` → `banned_claims`.
 *
 * ENFORCED, not a style note: §6 strips these from every prompt and from video
 * narration, and in block mode a prompt containing one is refused before
 * billing. That is why the section's copy says so.
 */
export const AVOID_WORD_OPTIONS = options(
  "synergy", "leverage", "disruptive", "best_in_class",
  "guaranteed", "cheap", "revolutionary", "world_class",
);

// ─────────────────────────────────────────────────────────────────────────────
// Radio cards — §7
// ─────────────────────────────────────────────────────────────────────────────

/** All four values are percentages of the glyph box, so the shape scales. */
export const COMPOSITION_STYLE_OPTIONS: readonly RadioCardOption<CompositionStyle>[] = [
  {
    value: "centered_symmetric",
    labelKey: "appChat.brandKit.layout.composition.centered.label",
    captionKey: "appChat.brandKit.layout.composition.centered.caption",
    glyph: [
      { x: 25, y: 15, w: 50, h: 8 },
      { x: 15, y: 32, w: 70, h: 6 },
      { x: 15, y: 44, w: 70, h: 6 },
      { x: 30, y: 60, w: 40, h: 20 },
    ],
  },
  {
    value: "left_aligned_structured",
    labelKey: "appChat.brandKit.layout.composition.leftAligned.label",
    captionKey: "appChat.brandKit.layout.composition.leftAligned.caption",
    glyph: [
      { x: 8, y: 15, w: 45, h: 8 },
      { x: 8, y: 32, w: 70, h: 6 },
      { x: 8, y: 44, w: 55, h: 6 },
      { x: 8, y: 60, w: 36, h: 20 },
    ],
  },
  {
    value: "dynamic_organic",
    labelKey: "appChat.brandKit.layout.composition.dynamic.label",
    captionKey: "appChat.brandKit.layout.composition.dynamic.caption",
    glyph: [
      { x: 10, y: 12, w: 38, h: 22 },
      { x: 54, y: 22, w: 34, h: 12 },
      { x: 18, y: 44, w: 60, h: 8 },
      { x: 40, y: 60, w: 48, h: 22 },
    ],
  },
  {
    value: "dense_info_rich",
    labelKey: "appChat.brandKit.layout.composition.dense.label",
    captionKey: "appChat.brandKit.layout.composition.dense.caption",
    glyph: [
      { x: 8, y: 12, w: 38, h: 6 },
      { x: 54, y: 12, w: 38, h: 6 },
      { x: 8, y: 24, w: 84, h: 6 },
      { x: 8, y: 36, w: 40, h: 6 },
      { x: 54, y: 36, w: 38, h: 6 },
      { x: 8, y: 48, w: 84, h: 6 },
      { x: 8, y: 60, w: 56, h: 6 },
      { x: 8, y: 72, w: 84, h: 6 },
    ],
  },
  {
    value: "minimal_spacious",
    labelKey: "appChat.brandKit.layout.composition.minimal.label",
    captionKey: "appChat.brandKit.layout.composition.minimal.caption",
    glyph: [
      { x: 22, y: 34, w: 36, h: 8 },
      { x: 22, y: 52, w: 22, h: 5 },
    ],
  },
];

export const WHITE_SPACE_OPTIONS: readonly RadioCardOption<WhiteSpace>[] = [
  {
    value: "generous",
    labelKey: "appChat.brandKit.layout.whiteSpace.generous.label",
    captionKey: "appChat.brandKit.layout.whiteSpace.generous.caption",
    glyph: [
      { x: 28, y: 38, w: 44, h: 8 },
      { x: 28, y: 54, w: 26, h: 5 },
    ],
  },
  {
    value: "balanced",
    labelKey: "appChat.brandKit.layout.whiteSpace.balanced.label",
    captionKey: "appChat.brandKit.layout.whiteSpace.balanced.caption",
    glyph: [
      { x: 18, y: 26, w: 64, h: 8 },
      { x: 18, y: 42, w: 50, h: 6 },
      { x: 18, y: 56, w: 64, h: 6 },
    ],
  },
  {
    value: "tight",
    labelKey: "appChat.brandKit.layout.whiteSpace.tight.label",
    captionKey: "appChat.brandKit.layout.whiteSpace.tight.caption",
    glyph: [
      { x: 10, y: 14, w: 80, h: 6 },
      { x: 10, y: 24, w: 80, h: 6 },
      { x: 10, y: 34, w: 66, h: 6 },
      { x: 10, y: 44, w: 80, h: 6 },
      { x: 10, y: 54, w: 74, h: 6 },
      { x: 10, y: 64, w: 80, h: 6 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Typography and colour
// ─────────────────────────────────────────────────────────────────────────────

export const TYPOGRAPHY_ROLES: readonly BrandKitTypeRole[] = BRAND_KIT_TYPE_ROLES;

export const TYPOGRAPHY_ROLE_LABEL_KEY: Record<string, string> = {
  display: "appChat.brandKit.typography.role.display",
  heading: "appChat.brandKit.typography.role.heading",
  subheading: "appChat.brandKit.typography.role.subheading",
  body: "appChat.brandKit.typography.role.body",
  caption: "appChat.brandKit.typography.role.caption",
  button: "appChat.brandKit.typography.role.button",
  accent: "appChat.brandKit.typography.role.accent",
  custom: "appChat.brandKit.typography.role.custom",
};

/** The four rows a blank kit starts with — the ones the design shows. */
export const DEFAULT_TEXT_STYLE_ROLES: readonly BrandKitTypeRole[] = [
  "display",
  "heading",
  "body",
  "caption",
];


/** The sizes the Font Size select offers, in px — the guide stores "72px". */
export const FONT_SIZES: readonly number[] = [
  12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 96,
];

/** §4: `weight >= 600` is what makes a style bold. */
export const BOLD_WEIGHT = 700;
export const REGULAR_WEIGHT = 400;

export const COLOR_ROLES: readonly string[] = [
  "primary",
  "secondary",
  "accent",
  "background",
  "surface",
  "text",
  "semantic",
];

export const COLOR_ROLE_LABEL_KEY: Record<string, string> = {
  primary: "appChat.brandKit.options.colorRole.primary",
  secondary: "appChat.brandKit.options.colorRole.secondary",
  accent: "appChat.brandKit.options.colorRole.accent",
  background: "appChat.brandKit.options.colorRole.background",
  surface: "appChat.brandKit.options.colorRole.surface",
  text: "appChat.brandKit.options.colorRole.text",
  semantic: "appChat.brandKit.options.colorRole.semantic",
};

/**
 * Which of `colors.{brand,neutrals,semantic}` a role lands in, since §4 projects
 * brand colours before neutrals and never projects `semantic` at all.
 */
export const COLOR_ROLE_GROUP: Record<string, "brand" | "neutral" | "semantic"> = {
  primary: "brand",
  secondary: "brand",
  accent: "brand",
  background: "neutral",
  surface: "neutral",
  text: "neutral",
  semantic: "semantic",
};

/** The hex a new swatch opens on. */
export const DEFAULT_NEW_COLOR_HEX = "#E8521D";

// ─────────────────────────────────────────────────────────────────────────────
// The colour picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The saturation/brightness square, the hue strip, and the handle they share.
 *
 * `touch-none` on both, or a drag on a phone scrolls the popover instead.
 *
 * The square's hairline is an INSET RING, never a `border`: a gradient is
 * positioned to the padding box but painted to the border box, so a bordered
 * element repeats the gradient into the border ring — which fringed the square
 * in its own hue. A ring is a box-shadow and touches no background box.
 */
export const PICKER_AREA_CLASS =
  "relative h-44 w-full cursor-crosshair touch-none rounded-xl outline-none ring-1 ring-inset ring-black/10 focus-visible:ring-2 focus-visible:ring-neutral-900/30 dark:ring-white/10 dark:focus-visible:ring-white/30";
export const PICKER_HUE_CLASS =
  "relative h-2.5 min-w-0 flex-1 cursor-pointer touch-none rounded-full bg-[linear-gradient(to_right,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)] outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 dark:focus-visible:ring-white/25";
export const PICKER_HANDLE_CLASS =
  "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]";

/**
 * The popover, and the row of boxes under the sliders.
 *
 * Explicit white rather than `bg-popover`: written when that token was a warm
 * off-white (it is pure white since 2026-10-06); the dark value stays its own.
 */
export const PICKER_POPOVER_CLASS =
  "w-[320px] rounded-2xl border-neutral-200 bg-white p-0 shadow-lg dark:border-neutral-800 dark:bg-neutral-900";
export const PICKER_FIELD_CLASS =
  "h-9 rounded-lg border border-neutral-200 bg-white text-[12px] text-neutral-900 shadow-none focus-visible:border-neutral-900 focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:border-neutral-100";
export const PICKER_ICON_BUTTON_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800";

/**
 * EVERY select in the editor, off the warm `--popover`/`--muted` tokens and the
 * teal `--ring`. One set of classes so a dropdown looks the same wherever the
 * editor opens one; a trigger needing its own width passes it alongside.
 */
export const BRAND_SELECT_TRIGGER_CLASS =
  "h-9 rounded-lg border-neutral-200 bg-white text-[12px] text-neutral-900 focus:border-neutral-900 focus:ring-0 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100";
export const BRAND_SELECT_CONTENT_CLASS =
  "rounded-lg border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100";
/** `pl-2` because the tick is gone and the shared SelectItem reserves 8 units
 *  of gutter for it. Selection is the background — one mark, not two. */
export const BRAND_SELECT_ITEM_CLASS =
  "rounded-md py-1.5 pl-2 pr-2 text-[12px] focus:bg-neutral-100 focus:text-neutral-900 data-[state=checked]:bg-neutral-100 data-[state=checked]:font-semibold dark:focus:bg-neutral-800 dark:focus:text-neutral-50 dark:data-[state=checked]:bg-neutral-800";

/** The two footer buttons: an outlined dismissal, a solid commit. */
export const PICKER_CANCEL_CLASS =
  "h-9 flex-1 rounded-lg border border-neutral-200 text-[12px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
export const PICKER_SAVE_CLASS =
  "h-9 flex-1 rounded-lg bg-neutral-900 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white";

// ─────────────────────────────────────────────────────────────────────────────
// The font picker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The picker's trigger, its search field and one of its rows.
 *
 * The trigger reuses the select geometry so the Font field still lines up with
 * Heading type and Font Size beside it — it is a different control, not a
 * differently sized one.
 *
 * The list is a fixed-height scroller rather than one that grows: Google serves
 * around sixteen hundred families, and a popover as tall as its contents would
 * be taller than the screen before the user has typed anything.
 */
export const FONT_PICKER_TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-left text-[12px] text-neutral-900 transition-colors hover:bg-neutral-50 focus-visible:border-neutral-900 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:border-neutral-100";
export const FONT_PICKER_POPOVER_CLASS =
  "w-64 rounded-xl border-neutral-200 bg-white p-0 shadow-lg dark:border-neutral-800 dark:bg-neutral-900";
export const FONT_PICKER_SEARCH_CLASS =
  "h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-[12px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:border-neutral-100";
export const FONT_PICKER_LIST_CLASS = "max-h-64 overflow-y-auto p-1";
export const FONT_PICKER_OPTION_CLASS =
  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-neutral-800 dark:text-neutral-200";
export const FONT_PICKER_OPTION_ACTIVE_CLASS =
  "bg-neutral-100 dark:bg-neutral-800";
export const FONT_PICKER_EMPTY_CLASS =
  "px-3 py-6 text-center text-[12px] font-medium text-neutral-500 dark:text-neutral-400";

// ─────────────────────────────────────────────────────────────────────────────
// A row's inline actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirm, dismiss, delete — the end of an editable row. 32px, not the shared
 * Button's 36px: these are what you do to the row, not its subject.
 *
 * Plain buttons because that Button's `outline` and `ghost` both hover to
 * `--muted` and focus in teal `--ring` — restyling all of it leaves nothing of
 * the variant behind.
 */
export const ROW_ICON_BUTTON_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900/20 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus-visible:ring-white/25";

/** The same button without an edge, for an action that sits apart from a pair. */
export const ROW_ICON_GHOST_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900/20 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:focus-visible:ring-white/25";

/** Composed onto either when the button DESTROYS something. Red on hover only:
 *  a column of permanently red buttons reads as a page full of errors. */
export const ROW_ICON_DELETE_CLASS =
  "hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-400";

// ─────────────────────────────────────────────────────────────────────────────
// A text style, open and shut
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row in Typography, and the controls panel that opens inside it.
 *
 * The panel animates `grid-template-rows` 0fr→1fr with its contents in an
 * `overflow-hidden` child — the one way to transition to an unmeasured height.
 * `height: auto` is not animatable, and measuring it in a layout effect re-runs
 * on every font, size and weight changed inside the panel.
 *
 * It stays MOUNTED when shut, which is what lets it animate both ways; a
 * ternary that swaps markup can only animate the way in. `inert` is therefore
 * required, or Tab walks into controls that are zero pixels tall.
 */
export const STYLE_ROW_CLASS =
  "rounded-xl border border-neutral-200 transition-colors dark:border-neutral-800";
export const STYLE_ROW_CLOSED_CLASS =
  "hover:border-neutral-300 dark:hover:border-neutral-600";
export const STYLE_PANEL_CLASS =
  "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
