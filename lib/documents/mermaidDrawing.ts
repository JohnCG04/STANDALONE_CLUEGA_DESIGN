/**
 * A stored mermaid source → the picture a reader can actually read.
 *
 * `MermaidBlock` draws every diagram this app shows — the chat's fences, the
 * figure strip on a document's chip, the editor's diagram block — and it used to
 * hand the stored text straight to `beautiful-mermaid`. The text is what the
 * model wrote, and the model writes things the library draws faithfully and
 * badly (N5, doc_97bc46e3 block 16, 05/10/2026):
 *
 * - labels in SINGLE quotes, `A['Đơn giá niêm yết']`. Mermaid's grammar quotes
 *   a label with double quotes only, so the single ones are label text and
 *   every box was drawn with a `'` at each end — seven of that document's
 *   eight diagrams, 109 stray quotes between them;
 * - a nine-step `flowchart LR` chain. Drawn across, it is 1475px wide, so a
 *   column fitting it shrank it to under 40% and its 13px labels came out
 *   near 5px — a picture of a diagram, not one anybody could read;
 * - and no face of its own: the library sets every label in Inter, fetched by
 *   an `@import` from Google Fonts. So the one picture on the page was not in
 *   the page's type, and opening a diagram was a request to a third party.
 *
 * Repaired HERE, at draw time, and not only where documents are written:
 * documents already stored carry the faults, and they are the ones being read.
 * CLUEGA_DOC_RENDER draws the same stored text with the same library for the
 * PDF, so the same repairs are owed there (see `app/render/diagram.py`).
 *
 * Kept free of the library itself: `MermaidBlock` loads `beautiful-mermaid`
 * lazily so a session without a diagram never pays for it, and a static import
 * here would undo that. The caller passes its renderer in.
 */

import { DEFAULT_THEME, PAGE_INNER_WIDTH } from "./documentTheme";

/** Draws one mermaid source to an SVG string, throwing when it cannot. */
export type MermaidRender = (source: string) => string | Promise<string>;

// --- quotes ------------------------------------------------------------------

/**
 * Each label form whose delimiters can enclose a single-quoted label, as
 * `(opener)'(body)'` followed by its closer.
 *
 * The body may not contain its own closing delimiter — exactly what the
 * library's shape patterns cannot parse either — so a malformed line is left
 * as malformed as it came rather than re-bracketed into a different one. It MAY
 * contain an apostrophe: "Bob's report" is still one label.
 *
 * Nested shapes need no entries of their own. `A[['x']]`, `A(['x'])` and
 * `A{{'x'}}` all quote against their INNERMOST delimiter, which is one of these.
 */
const SINGLE_QUOTED_LABEL: RegExp[] = [
  /(\[)\s*'([^\]\n]*?)'\s*(?=\])/g, // A['…']  subgraph S['…']
  /(\()\s*'([^)\n]*?)'\s*(?=\))/g, // A('…')  A(('…'))  A[('…')]
  /(\{)\s*'([^}\n]*?)'\s*(?=\})/g, // A{'…'}  A{{'…'}}
  /(\|)\s*'([^|\n]*?)'\s*(?=\|)/g, // A -->|'…'| B
  /((?<=\w)>)\s*'([^\]\n]*?)'\s*(?=\])/g, // A>'…']
  // The other way to label an edge, `A -- 'yes' --> B`. Its body may not hold a
  // quote: there is no closing bracket here to say where a label ends.
  /((?:--|-\.|==)\s+)'([^'\n]*)'(?=\s+(?:-->|---|\.->|-\.-|==>|===))/g,
];

/** The line a diagram declares its kind on — mermaid's own rule: the first one
 *  that is neither blank nor a `%%` comment. */
function headerIndex(lines: string[]): number {
  return lines.findIndex((line) => line.trim() !== "" && !line.trim().startsWith("%%"));
}

/**
 * `source` with every single-quoted flowchart label double-quoted instead.
 *
 * Double rather than bare: a double-quoted label is mermaid's own way to write
 * text with brackets or punctuation in it, so the repaired line parses in any
 * mermaid, not only in the library this app happens to draw with.
 *
 * Flowcharts only. A flowchart is the one kind whose grammar QUOTES a label, so
 * it is the one kind where a quote can be called a mistake without guessing. A
 * sequence message `A->>B: 'hi'` is free text, and its quotes may be meant.
 */
export function unquotedLabels(source: string): string {
  const lines = source.split("\n");
  const head = headerIndex(lines);
  if (head === -1 || !/^(?:flowchart|graph)\b/i.test(lines[head].trim())) return source;
  return lines
    .map((line, i) =>
      i <= head || line.trim().startsWith("%%")
        ? line
        : SINGLE_QUOTED_LABEL.reduce((text, pattern) => text.replace(pattern, '$1"$2"'), line),
    )
    .join("\n");
}

// --- legibility --------------------------------------------------------------

/** The size `beautiful-mermaid` sets a node label at (its `FONT_SIZES.nodeLabel`). */
const LABEL_PX = 13;

/** The smallest a label may come out on screen and still be read without
 *  zooming. Below it a diagram is texture: you can see that there are boxes. */
const MIN_LABEL_PX = 10;

/** How far a drawing may be shrunk to fit its column before its labels pass
 *  `MIN_LABEL_PX`. */
export const MIN_DIAGRAM_SCALE = MIN_LABEL_PX / LABEL_PX;

/**
 * The widest a drawing can be and still fit the page's measure legibly — 720px
 * at the A4 measure of 554.
 *
 * The PAGE's measure, not whatever column a diagram happens to be shown in: the
 * same diagram is drawn in the chat, on the chip and in the editor, and it
 * should be the same picture in all three — the one the document holds.
 */
export const LEGIBLE_DIAGRAM_WIDTH = Math.round(PAGE_INNER_WIDTH / MIN_DIAGRAM_SCALE);

/** A flowchart laid out across the page: `flowchart LR`, `graph RL`. */
const ACROSS = /^(\s*(?:flowchart|graph)\s+)(LR|RL)\b/i;

/**
 * `source` laid out down the page instead of across it, or null when it is
 * not a flowchart laid out across.
 *
 * Down, not wrapped: a flowchart has no line breaking, and a chain broken into
 * rows needs invented subgraphs that the next edit would have to understand.
 * Turning it changes one word of the source and nothing about the graph. `RL`
 * becomes `BT` so a chain written to run backwards still does.
 */
function turnedDown(source: string): string | null {
  const lines = source.split("\n");
  const head = headerIndex(lines);
  if (head === -1 || !ACROSS.test(lines[head])) return null;
  lines[head] = lines[head].replace(
    ACROSS,
    (_match, lead: string, across: string) => lead + (across.toUpperCase() === "LR" ? "TD" : "BT"),
  );
  return lines.join("\n");
}

/** The drawing's own width in px, read off its viewBox. */
export function drawnWidth(svg: string): number | null {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const box = /\bviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+[\d.]+\s*"/.exec(root);
  const width = box ? Number(box[1]) : NaN;
  return Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * The narrowest `svg` may be shown at: its own width at `MIN_DIAGRAM_SCALE`.
 *
 * For a column narrower than that, the picture holds this width and the column
 * scrolls — a diagram that must be scrolled sideways can still be read, one
 * shrunk to fit cannot. `0` when the drawing states no size.
 */
export function legibleMinWidth(svg: string): number {
  const width = drawnWidth(svg);
  return width === null ? 0 : Math.round(width * MIN_DIAGRAM_SCALE);
}

/**
 * `svg` — or, for a flowchart drawn across that is too wide to read on the
 * page, the same flowchart drawn down, when that comes out narrower.
 *
 * Decided on the DRAWING, not on a count of nodes: four steps with long labels
 * can be as wide as nine short ones, and a fan-out drawn down can be wider than
 * across. Only the narrower picture wins, so a turn can never make it worse.
 */
async function readableWay(svg: string, source: string, render: MermaidRender): Promise<string> {
  const width = drawnWidth(svg);
  if (width === null || width <= LEGIBLE_DIAGRAM_WIDTH) return svg;
  const down = turnedDown(source);
  if (down === null) return svg;
  try {
    const turned = await render(down);
    const turnedWidth = drawnWidth(turned);
    return turnedWidth !== null && turnedWidth < width ? turned : svg;
  } catch {
    // The direction it was written in drew; that picture still stands.
    return svg;
  }
}

// --- face --------------------------------------------------------------------

/** The library's webfont request: `@import url('https://fonts.googleapis…');`. */
const WEBFONT_IMPORT = /@import\s+url\([^)]*\)\s*;?/g;

/** The library's label face, `text { font-family: 'Inter', … }`, on a line of
 *  its own in the SVG's stylesheet. */
const LABEL_FACE_RULE = /^[ \t]*text\s*\{\s*font-family\s*:[^}]*\}[ \t]*\n?/m;

/** A stack that ends in a generic family can never fall through to the
 *  browser's default face — which, for SVG text, is a serif. */
const GENERIC_FAMILY = /\b(?:sans-serif|serif|monospace|system-ui|ui-sans-serif)\s*$/i;

/**
 * `svg` with its labels set in `font` — the document's body face unless
 * told otherwise — and no webfont request left in it.
 *
 * The face goes on the SVG's ROOT, as an inline style its labels inherit, and
 * the library's own `text { … }` rule comes out. That rule was never the
 * diagram's alone: a `<style>` inside inline SVG is a stylesheet for the whole
 * page, so it restyled every `<text>` on screen while a diagram was showing.
 *
 * The `@import` goes too, for the reason CLUEGA_DOC_RENDER drops it
 * (`node/mermaid.mjs`): it is a request to Google from the reader's browser,
 * and it was asking for a face the document is not set in.
 */
export function inDocumentFont(svg: string, font: string = DEFAULT_THEME.bodyFont): string {
  const stack = (GENERIC_FAMILY.test(font) ? font : `${font}, sans-serif`).replace(/"/g, "'");
  return svg
    .replace(WEBFONT_IMPORT, "")
    .replace(LABEL_FACE_RULE, "")
    .replace(/<svg\b[^>]*>/, (root) =>
      /\sstyle="/.test(root)
        ? root.replace(/\sstyle="([^"]*)"/, (_attr, style: string) =>
            ` style="${style.replace(/;?\s*$/, ";")}font-family:${stack}"`,
          )
        : root.replace(/\s*(\/?)>$/, ` style="font-family:${stack}"$1>`),
    );
}

// --- the drawing -------------------------------------------------------------

/**
 * `source` drawn with the repairs above, as an SVG string.
 *
 * Rejects only when the source as WRITTEN cannot be drawn either — the caller's
 * fallback (printing the source) is the right answer then, and it must not be
 * reached because a repair made a drawable diagram undrawable.
 */
export async function drawMermaid(source: string, render: MermaidRender): Promise<string> {
  const repaired = unquotedLabels(source);
  let drawnFrom = repaired;
  let svg: string;
  try {
    svg = await render(repaired);
  } catch (error) {
    if (repaired === source) throw error;
    drawnFrom = source;
    svg = await render(source);
  }
  return inDocumentFont(await readableWay(svg, drawnFrom, render));
}
