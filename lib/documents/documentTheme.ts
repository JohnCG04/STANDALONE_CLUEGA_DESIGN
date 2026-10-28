/**
 * Typography, page geometry and colour for the Word-like document surface.
 *
 * A theme is data, not styling scattered through the converter. The converter
 * takes one and asks it for every colour and size it draws; the React wrapper
 * takes the same one and derives canvas-editor's options from it. That is what
 * makes "switch the document to the green report look" a one-line change rather
 * than a hunt through the markdown walker.
 *
 * What a theme can express is bounded by the renderer: canvas-editor paints on
 * a canvas, so there are colours, straight rules, filled cells and images —
 * no rounded corners, gradients or shadows. Themes here stay inside that box
 * deliberately, so a preset never renders differently from how it reads.
 */

// --- page geometry -----------------------------------------------------------

/** A4 at 96dpi — the size canvas-editor's print path recognises for PDF. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

/**
 * [top, right, bottom, left] in px.
 *
 * The side margins are wider than the vertical ones, and wider than Word's
 * 2.54cm default, because measure is what they actually control. At 96px a side
 * the writable width is 602px, which at the body size below runs ~80 characters
 * to the line — past the 65–75 that reading research and every book you own
 * settle on, and far enough past it that the eye loses the line return. 120px a
 * side brings it to ~69.
 */
export const PAGE_MARGINS: [number, number, number, number] = [96, 120, 96, 120];

/** Writable width of the page: what tables and images must fit inside. */
export const PAGE_INNER_WIDTH = PAGE_WIDTH - PAGE_MARGINS[1] - PAGE_MARGINS[3];

/** Line spacing for fenced code, which is one row per source line. */
export const CODE_ROW_MARGIN = 0.5;

// Font stacks, not single families: canvas `ctx.font` takes the CSS shorthand,
// so a comma list falls back the same way it would in CSS. Every family used by
// a preset carries Vietnamese diacritics, which the app's `vn` locale needs.
const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const SERIF = "Iowan Old Style, Palatino Linotype, Georgia, serif";
const MONO = "SFMono-Regular, Menlo, Consolas, monospace";

// --- theme model -------------------------------------------------------------

export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

export interface CalloutStyle {
  /** Left bar and title colour. */
  accent: string;
  /** Body fill behind the callout. */
  surface: string;
  /** Drawn before the title. A glyph, not an image — always available. */
  glyph: string;
  /** Title shown when the author writes `> [!NOTE]` with no title of their own. */
  label: string;
}

export interface CodeTokenStyle {
  color?: string;
  italic?: boolean;
  bold?: boolean;
}

export interface DocumentTheme {
  id: string;
  /** Shown in the theme picker. */
  name: string;

  bodyFont: string;
  headingFont: string;
  monoFont: string;
  bodySize: number;

  text: string;
  muted: string;
  link: string;
  /** Hairlines: heading underscores, thematic breaks. */
  rule: string;

  /** Drives heading colour, table headers, callout defaults and the cover bar. */
  accent: string;
  /** Text drawn on top of `accent`. */
  onAccent: string;

  heading: {
    /** Per-level colour; index 0 is h1. */
    colors: [string, string, string, string, string, string];
    sizes: {
      defaultFirstSize: number;
      defaultSecondSize: number;
      defaultThirdSize: number;
      defaultFourthSize: number;
      defaultFifthSize: number;
      defaultSixthSize: number;
    };
    /** Levels that get a hairline under them, e.g. [1, 2]. */
    ruleUnder: number[];
    /** Prefix headings with 1. / 1.1 / 1.1.1 automatically. */
    numbered: boolean;
  };

  table: {
    headerBackground: string;
    headerText: string;
    /** Fill on every other body row. Empty string turns banding off. */
    zebra: string;
    border: string;
    /** Hide the vertical rules — the Stripe/Notion look. */
    horizontalRulesOnly: boolean;
  };

  code: {
    surface: string;
    text: string;
    tokens: Record<string, CodeTokenStyle>;
  };

  callout: Record<CalloutKind, CalloutStyle>;

  /** Quoted text: a coloured bar plus muted italics. */
  quote: { bar: string; text: string };

  chart: {
    /**
     * Series colours, in the order series are drawn. The first is the theme's
     * own accent so a single-series chart — the common case — belongs to the
     * document rather than introducing a colour nothing else uses.
     */
    series: string[];
    /** Axis lines, tick labels and the faint horizontal grid. */
    axis: string;
    grid: string;
    label: string;
  };
}

// --- shared pieces -----------------------------------------------------------

/**
 * Syntax colours, following GitHub's light palette.
 *
 * Keys are Prism token names. Anything not listed falls through to the code
 * block's base colour, so an unknown language degrades to plain monospace
 * rather than to something unreadable.
 */
const CODE_TOKENS: Record<string, CodeTokenStyle> = {
  comment: { color: "#6e7781", italic: true },
  prolog: { color: "#6e7781", italic: true },
  doctype: { color: "#6e7781", italic: true },
  cdata: { color: "#6e7781", italic: true },
  punctuation: { color: "#24292f" },
  operator: { color: "#0550ae" },
  keyword: { color: "#cf222e" },
  "control-flow": { color: "#cf222e" },
  atrule: { color: "#cf222e" },
  boolean: { color: "#0550ae" },
  number: { color: "#0550ae" },
  constant: { color: "#0550ae" },
  symbol: { color: "#0550ae" },
  string: { color: "#0a3069" },
  char: { color: "#0a3069" },
  regex: { color: "#0a3069" },
  "attr-value": { color: "#0a3069" },
  function: { color: "#8250df" },
  "class-name": { color: "#953800" },
  builtin: { color: "#953800" },
  variable: { color: "#953800" },
  property: { color: "#0550ae" },
  "attr-name": { color: "#0550ae" },
  tag: { color: "#116329" },
  selector: { color: "#116329" },
  important: { color: "#cf222e", bold: true },
  deleted: { color: "#cf222e" },
  inserted: { color: "#116329" },
};

/**
 * Callout palette, following GitHub's alert colours.
 *
 * Reusing them is deliberate: the assistant writes `> [!NOTE]`, which is
 * GitHub's own syntax, and readers already associate these five hues with these
 * five meanings. Every theme shares them so a warning never reads as decorative.
 */
const CALLOUTS: Record<CalloutKind, CalloutStyle> = {
  note: { accent: "#0969da", surface: "#ddf4ff", glyph: "ℹ", label: "Note" },
  tip: { accent: "#1a7f37", surface: "#dafbe1", glyph: "✦", label: "Tip" },
  important: { accent: "#8250df", surface: "#fbefff", glyph: "★", label: "Important" },
  warning: { accent: "#9a6700", surface: "#fff8c5", glyph: "⚠", label: "Warning" },
  caution: { accent: "#cf222e", surface: "#ffebe9", glyph: "⚠", label: "Caution" },
};

interface PresetInput {
  id: string;
  name: string;
  accent: string;
  /** Heading colour when it should differ from the accent (e.g. near-black). */
  headingColor?: string;
  tableHeaderBackground: string;
  tableHeaderText: string;
  zebra: string;
  headingFont?: string;
  bodyFont?: string;
  numbered?: boolean;
  /** Series colours after the accent. Four is enough: a report chart with more
   *  than five series is a table wearing a costume. */
  chartSeries: [string, string, string, string];
}

function preset(input: PresetInput): DocumentTheme {
  const heading = input.headingColor ?? input.accent;
  return {
    id: input.id,
    name: input.name,
    bodyFont: input.bodyFont ?? SANS,
    headingFont: input.headingFont ?? input.bodyFont ?? SANS,
    monoFont: MONO,
    // 16, not 15: with the wider side margins above, 15 would leave the measure
    // short of the target rather than past it. The two numbers set measure
    // together and only make sense read together.
    bodySize: 16,
    text: "#1f2328",
    muted: "#59636e",
    link: input.accent,
    rule: "#d8dee4",
    accent: input.accent,
    onAccent: "#ffffff",
    heading: {
      // h1/h2 carry the accent; deeper levels settle toward body colour so a
      // long document does not turn into a wall of coloured text.
      colors: [heading, heading, "#1f2328", "#1f2328", "#1f2328", "#1f2328"],
      // Stepped up with the body size so the hierarchy keeps its ratios. h5 and
      // h6 land at and just under the body size on purpose: canvas-editor bolds
      // every title, and past four levels weight separates them better than
      // size, which would otherwise creep back down into the body.
      sizes: {
        defaultFirstSize: 30,
        defaultSecondSize: 23,
        defaultThirdSize: 19,
        defaultFourthSize: 17,
        defaultFifthSize: 16,
        defaultSixthSize: 15,
      },
      ruleUnder: [1, 2],
      numbered: input.numbered ?? false,
    },
    table: {
      headerBackground: input.tableHeaderBackground,
      headerText: input.tableHeaderText,
      zebra: input.zebra,
      border: "#d8dee4",
      horizontalRulesOnly: true,
    },
    code: { surface: "#f6f8fa", text: "#1f2328", tokens: CODE_TOKENS },
    callout: CALLOUTS,
    quote: { bar: input.accent, text: "#59636e" },
    chart: {
      // Accent first, then a fixed run of hues that stay distinguishable in
      // greyscale and to the most common colour-vision deficiencies — a report
      // gets printed in black and white more often than anyone plans for.
      series: [input.accent, ...input.chartSeries],
      axis: "#b6c2cc",
      grid: "#eceff2",
      label: "#59636e",
    },
  };
}

// --- presets -----------------------------------------------------------------

/**
 * Cluega's own look: the product's near-black navy (`--primary`) as the accent.
 * The brand mint is far too light to carry heading text or a filled table
 * header on paper, so it is not used here.
 */
export const THEME_CLUEGA = preset({
  id: "cluega",
  name: "Cluega",
  accent: "#0c1c29",
  tableHeaderBackground: "#0c1c29",
  tableHeaderText: "#ffffff",
  zebra: "#f6f8fa",
  chartSeries: ["#70dbbc", "#5b8def", "#e0a44a", "#9b8bd6"],
});

export const THEME_CORPORATE = preset({
  id: "corporate",
  name: "Corporate blue",
  accent: "#1d4ed8",
  tableHeaderBackground: "#1d4ed8",
  tableHeaderText: "#ffffff",
  zebra: "#f1f5fd",
  chartSeries: ["#5aa9e6", "#f2a65a", "#4fb286", "#a78bfa"],
  numbered: true,
});

export const THEME_REPORT = preset({
  id: "report",
  name: "Report green",
  accent: "#047857",
  tableHeaderBackground: "#ecfdf5",
  tableHeaderText: "#065f46",
  zebra: "#f6faf8",
  chartSeries: ["#7cc6a6", "#4a90a4", "#d8a657", "#b07fb0"],
  numbered: true,
});

/** Minimal: no colour beyond near-black, and a serif face for long reading. */
export const THEME_SLATE = preset({
  id: "slate",
  name: "Editorial slate",
  accent: "#334155",
  tableHeaderBackground: "#f1f5f9",
  tableHeaderText: "#0f172a",
  zebra: "",
  chartSeries: ["#7d8fa0", "#b0783c", "#5f7d6e", "#9a6a86"],
  bodyFont: SERIF,
  headingFont: SANS,
});

export const THEME_CREATIVE = preset({
  id: "creative",
  name: "Creative violet",
  accent: "#7c3aed",
  tableHeaderBackground: "#7c3aed",
  tableHeaderText: "#ffffff",
  zebra: "#faf6ff",
  chartSeries: ["#c084fc", "#38bdf8", "#fbbf24", "#4ade80"],
});

export const DOCUMENT_THEMES: DocumentTheme[] = [
  THEME_CLUEGA,
  THEME_CORPORATE,
  THEME_REPORT,
  THEME_SLATE,
  THEME_CREATIVE,
];

export const DEFAULT_THEME = THEME_CLUEGA;

export function themeById(id: string | undefined): DocumentTheme {
  return DOCUMENT_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}
