import type {
  MagicLayerImageItem,
  MagicLayerItem,
  MagicLayerResult,
  MagicLayerTextItem,
} from "@dogclaw-ad/workflow";
import { ANCHOR, BOLD_FROM, NAME_MAX, SLACK_MIN, SLACK_RATIO } from "./constants";
import type { ServedDesign, ServedLine, ServedPiece } from "./types";

function isServedDesign(value: unknown): value is ServedDesign {
  const d = value as ServedDesign | null;
  return Boolean(
    d && typeof d.width === "number" && typeof d.height === "number" && Array.isArray(d.pieces),
  );
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

/** The text layer has no letter-spacing or squeeze, so shrink the size until the natural
 *  width fits: the line stays on one row, and the user can scale it from there. */
function fittedSize(lines: ServedLine[]): number {
  const fits = lines.map((l) => {
    const chars = [...l.text].length;
    const natural = l.box.w / (l.x_scale || 1) - l.tracking * Math.max(chars - 1, 0);
    return natural > 0 ? Math.min(1, l.box.w / natural) : 1;
  });
  return Math.max(1, Math.round(mean(lines.map((l) => l.size)) * Math.min(...fits)));
}

function toText(p: ServedPiece): MagicLayerTextItem | null {
  const lines = p.lines ?? [];
  if (!p.font || lines.length === 0) return null;
  const fontSize = fittedSize(lines);
  // Several lines keep their original pitch even though the size shrank; one line has no pitch.
  const lineHeight = lines.length > 1 ? (lines[1].box.y - lines[0].box.y) / fontSize : (p.line_height ?? 1.2);
  // Centre the first line's box on the original line, wherever the glyphs sit inside it.
  const firstCentre = lines[0].box.y + lines[0].box.h / 2;
  const align = p.align ?? "left";
  const extra = Math.max(p.box.w * SLACK_RATIO, SLACK_MIN);
  const width = p.box.w + extra;
  const text = lines.map((l) => l.text).join("\n");
  return {
    kind: "text",
    name: text.replace(/\s+/g, " ").slice(0, NAME_MAX),
    text,
    x: p.box.x - extra * ANCHOR[align],
    y: firstCentre - (lineHeight * fontSize) / 2,
    width,
    height: lineHeight * fontSize * lines.length,
    fontFamily: p.font.family,
    fontSize,
    fontWeight: p.font.weight >= BOLD_FROM ? "bold" : "normal",
    fontStyle: p.font.italic ? "italic" : "normal",
    color: p.colour,
    align,
    lineHeight,
  };
}

function toImage(p: ServedPiece, resolveUrl: (url: string) => string): MagicLayerImageItem {
  return {
    kind: "image",
    url: resolveUrl(p.url),
    x: p.box.x,
    y: p.box.y,
    width: p.box.w,
    height: p.box.h,
  };
}

/** media-ai's design map → the Magic Layer contract: bottom first, image and text layers. */
export function toMagicLayerResult(
  served: unknown,
  resolveUrl: (url: string) => string,
): MagicLayerResult | null {
  if (!isServedDesign(served)) return null;
  // Equal z means "same layer of the model": the image remainder goes under its text.
  const ordered = served.pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.z - b.p.z || Number(a.p.kind === "text") - Number(b.p.kind === "text") || a.i - b.i)
    .map(({ p }) => p);
  const layers = ordered.flatMap<MagicLayerItem>((p) => {
    const item = p.kind === "text" ? toText(p) : toImage(p, resolveUrl);
    return item ? [item] : [];
  });
  return { width: served.width, height: served.height, layers };
}

/** Every face the text layers use, so the page can load them before the editor draws. */
export function fontsOf(result: MagicLayerResult): { family: string; weight: number; italic: boolean }[] {
  const seen = new Map<string, { family: string; weight: number; italic: boolean }>();
  for (const l of result.layers) {
    if (l.kind !== "text" || !l.fontFamily) continue;
    const face = { family: l.fontFamily, weight: l.fontWeight === "bold" ? 700 : 400, italic: l.fontStyle === "italic" };
    seen.set(`${face.family}:${face.weight}:${face.italic}`, face);
  }
  return [...seen.values()];
}
