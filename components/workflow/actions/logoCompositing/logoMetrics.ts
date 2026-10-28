import type { ObjectRect } from "@dogclaw-ad/workflow";
import { toProxiedMediaUrl } from "../../shared/mediaProxy";
import { ALPHA_MIN, FULL_FRAME, SAMPLE_EDGE, TRIM_MIN } from "./constants";
import type { ImageFrame, LogoArtwork } from "./types";

// Best-effort throughout: a failed decode returns `null` and the prompt falls back to prose.
const frames = new Map<string, ImageFrame | null>();
const artworks = new Map<string, LogoArtwork | null>();

/** `crossOrigin` keeps the canvas readable but fails to decode on a no-CORS host: retry plain. */
async function decode(url: string): Promise<HTMLImageElement | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }
  const src = toProxiedMediaUrl(url);
  return (await load(src, true)) ?? (await load(src, false));
}

async function load(
  src: string,
  anonymous: boolean,
): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.decoding = "async";
  if (anonymous) img.crossOrigin = "anonymous";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  return img.naturalWidth && img.naturalHeight ? img : null;
}

/** Cached per url, and normally free — the node has already rendered the image. */
export async function measureImageFrame(url: string): Promise<ImageFrame | null> {
  const known = frames.get(url);
  if (known !== undefined) return known;

  const img = await decode(url);
  const frame = img ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  frames.set(url, frame);
  return frame;
}

/** The trim box matters: "36% of the product" means 36% of the MARK, not of its padded file. */
export async function measureLogoArtwork(url: string): Promise<LogoArtwork | null> {
  const known = artworks.get(url);
  if (known !== undefined) return known;

  const measured = await scanLogo(url);
  artworks.set(url, measured);
  return measured;
}

async function scanLogo(url: string): Promise<LogoArtwork | null> {
  const img = await decode(url);
  if (!img) return null;

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const scan = alphaBox(img, width, height);
  const content = scan?.box ?? FULL_FRAME;

  const contentWidth = content.width * width;
  const contentHeight = content.height * height;

  return {
    width,
    height,
    content,
    trimmed: content.width < 1 - TRIM_MIN || content.height < 1 - TRIM_MIN,
    aspectRatio:
      contentWidth > 0 && contentHeight > 0 ? contentWidth / contentHeight : 1,
    hasAlpha: scan ? scan.hasAlpha : null,
  };
}

/** `null` when the pixels can't be read, or the file is fully transparent. */
function alphaBox(
  img: HTMLImageElement,
  width: number,
  height: number,
): { box: ObjectRect; hasAlpha: boolean } | null {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, sw, sh);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    // Tainted canvas — fall back to "the file is the mark".
    return null;
  }

  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  let hasAlpha = false;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[(y * sw + x) * 4 + 3] < ALPHA_MIN) {
        hasAlpha = true;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // Fully transparent: no mark, and "cut out" would skip the matte on a file carrying nothing.
  if (maxX < 0) return null;

  return {
    box: {
      x: minX / sw,
      y: minY / sh,
      width: (maxX - minX + 1) / sw,
      height: (maxY - minY + 1) / sh,
    },
    hasAlpha,
  };
}
