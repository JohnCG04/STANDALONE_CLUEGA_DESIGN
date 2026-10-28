import { createCanvas } from "../resizeImage/expandCanvas";
import { FILL_MESSAGES } from "./messages";

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(FILL_MESSAGES.noContext);
  return ctx;
}

/** The opaque plate as ALPHA, since `destination-out` cuts by alpha. Kept at the plate's own size:
 *  the punch scales it, and a full-size `getImageData` is 48MB for a shape with no detail. */
function stencilFrom(mask: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  marked: number;
} {
  const w = mask.naturalWidth;
  const h = mask.naturalHeight;
  if (!w || !h) throw new Error(FILL_MESSAGES.unreadableMask);

  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.drawImage(mask, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  let marked = 0;
  // Red IS the luminance on a B/W plate, and a grey edge becomes a partial cut, not a staircase.
  for (let i = 0; i < px.length; i += 4) {
    const level = px[i];
    px[i + 3] = level;
    if (level > 127) marked += 1;
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, marked };
}

/** The photo with the plate's region punched to alpha (a marker ON it would be copied as content).
 *  An unmarked plate throws: an intact photo told to repaint a hole invites redrawing the lot. */
export function punchMaskedRegion(
  photo: HTMLImageElement,
  mask: HTMLImageElement,
): HTMLCanvasElement {
  const width = photo.naturalWidth;
  const height = photo.naturalHeight;
  if (!width || !height) throw new Error(FILL_MESSAGES.unreadableSource);

  const { canvas: stencil, marked } = stencilFrom(mask);
  if (marked === 0) throw new Error(FILL_MESSAGES.emptyMask);

  const out = createCanvas(width, height);
  const ctx = context2d(out);
  ctx.drawImage(photo, 0, 0, width, height);
  // The plate matches the photo's ASPECT, not its size; scaling here spares `fillMask.ts` the size.
  ctx.globalCompositeOperation = "destination-out";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(stencil, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  return out;
}
