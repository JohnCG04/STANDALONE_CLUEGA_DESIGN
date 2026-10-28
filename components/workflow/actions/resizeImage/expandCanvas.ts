import { PHOTO_QUALITY, PHOTO_TYPES } from "./constants";
import { RESIZE_MESSAGES } from "./messages";
import type { ExpandGeometry } from "./types";

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(RESIZE_MESSAGES.noContext);
  return ctx;
}

/** `ctx.filter` isn't universal (older Safari ignores it); probing beats a UA check. */
function supportsCanvasFilter(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.filter = "blur(1px)";
    const ok = ctx.filter !== "none";
    ctx.filter = "none";
    return ok;
  } catch {
    return false;
  }
}

/** The grown canvas plus its mask (white = paint, black = keep; only `"gray"` ships it). Feathered
 *  on a SEPARATE canvas (browsers disagree on self-draws), then the core is re-filled black. */
export function buildExpandCanvas(
  image: CanvasImageSource,
  geo: ExpandGeometry,
): { canvas: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const { canvasWidth: cw, canvasHeight: ch, offsetX: ox, offsetY: oy } = geo;

  const canvas = createCanvas(cw, ch);
  const ctx = context2d(canvas);
  if (geo.fill === "gray") {
    ctx.fillStyle = "rgb(127,127,127)";
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.drawImage(image, ox, oy, geo.imageWidth, geo.imageHeight);

  const mask = createCanvas(cw, ch);
  const mctx = context2d(mask);
  mctx.fillStyle = "white"; // generate everywhere…
  mctx.fillRect(0, 0, cw, ch);
  mctx.fillStyle = "black"; // …except over the original.
  mctx.fillRect(ox, oy, geo.imageWidth, geo.imageHeight);

  if (geo.feather > 0) {
    const blurred = createCanvas(cw, ch);
    const bctx = context2d(blurred);
    if (supportsCanvasFilter(bctx)) {
      bctx.filter = `blur(${geo.feather}px)`;
      bctx.drawImage(mask, 0, 0);
      bctx.filter = "none";

      mctx.clearRect(0, 0, cw, ch);
      mctx.fillStyle = "white";
      mctx.fillRect(0, 0, cw, ch);
      mctx.drawImage(blurred, 0, 0);
    }
  }

  // Unconditional: it must hold whether or not the feather ran.
  mctx.fillStyle = "black";
  mctx.fillRect(ox, oy, geo.imageWidth, geo.imageHeight);

  return { canvas, mask };
}

/**
 * PNG is the operation, not a preference: a JPEG export drops the transparency that
 * tells the model where to paint — a valid file that comes back completely rewritten.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(RESIZE_MESSAGES.pngEncodeFailed));
      }, "image/png");
    } catch (err) {
      reject(
        new Error(
          RESIZE_MESSAGES.taintedCanvas((err as Error)?.message ?? ""),
        ),
      );
    }
  });
}

/**
 * The type is read back off the RESULT: `toBlob` silently falls back to PNG for a type
 * the browser can't encode, so a Safari build without WEBP would hand back a 2.6 MB one.
 */
export async function canvasToPhotoBlob(
  canvas: HTMLCanvasElement,
  quality = PHOTO_QUALITY,
): Promise<Blob> {
  for (const type of PHOTO_TYPES) {
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, type, quality);
      } catch {
        resolve(null); // tainted canvas — canvasToPngBlob reports it properly below
      }
    });
    if (blob && blob.type === type) return blob;
  }
  return canvasToPngBlob(canvas);
}

/** File extension for a blob {@link canvasToPhotoBlob} produced. */
export function photoFileExtension(blob: Blob): string {
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/jpeg") return "jpg";
  return "png";
}

/** Pastes the original back, since even a good edit model re-encodes it. Scaled to the plan's
 *  frame first: providers normalize output size, and the paste-back offset must stay valid. */
export function compositeOriginalBack(
  generated: CanvasImageSource,
  original: CanvasImageSource,
  geo: ExpandGeometry,
): HTMLCanvasElement {
  const out = createCanvas(geo.canvasWidth, geo.canvasHeight);
  const ctx = context2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(generated, 0, 0, geo.canvasWidth, geo.canvasHeight);
  ctx.drawImage(
    original,
    geo.offsetX,
    geo.offsetY,
    geo.imageWidth,
    geo.imageHeight,
  );
  return out;
}
