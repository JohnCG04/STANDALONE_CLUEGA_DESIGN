import { MAX_EXPAND_EDGE, MAX_EXPAND_PIXELS } from "./constants";

export const RESIZE_MESSAGES = {
  noSource: "AI Resize received no source image.",
  unbakedEdits:
    "This image still has unbaked edits (crop/filter/levels/blur). Export it to a new image first, then resize that image.",
  noBrowser: "AI Resize needs a browser canvas and cannot run here.",
  noSourceSize: "AI Resize could not read the source image's size.",
  unreadableRatio: (value: string) =>
    `AI Resize got an unreadable aspect ratio: ${value}`,
  nothingToPaint:
    "AI Resize has nothing to paint — the target frame is the same size as the source. Pick a wider aspect ratio or a scale above 1.",
  edgeCap: (width: number, height: number) =>
    `AI Resize is capped at ${MAX_EXPAND_EDGE}px per side; this plan asks for ${width}×${height}.`,
  pixelCap: (width: number, height: number) =>
    `AI Resize is capped at ${Math.round(MAX_EXPAND_PIXELS / 1e6)}MP; this plan asks for ${width}×${height}.`,
  // Four different fixes hide behind one "Failed to fetch", so every rung's failure is named.
  unreadableSource: (url: string, attempts: string[]) =>
    `AI Resize could not read the source image. The canvas needs same-origin bytes or an "Access-Control-Allow-Origin" header on the image host: ${url} — tried: ${attempts.join("; ")}`,
  imageFailedToLoad: "the image failed to load",
  noPixels: "the decoded image has no pixels",
  noContext: "AI Resize could not open a 2D canvas context.",
  pngEncodeFailed: "AI Resize could not encode the canvas as PNG.",
  taintedCanvas: (detail: string) =>
    `AI Resize could not export the canvas — it was tainted by a cross-origin image. ${detail}`.trim(),
  sourceAreaTransparent:
    "AI Resize built a canvas whose source area is transparent — the original image did not draw.",
  lostAlpha:
    "AI Resize lost its alpha channel on export — the area to paint came back opaque, so the model would be free to repaint the whole frame.",
  grayPlateTransparent:
    "AI Resize built a gray-fill canvas whose paint area is transparent — the mask and the plate disagree.",
} as const;

export const RESIZE_WARNINGS = {
  visibleSeam: (side: string, score: number) =>
    `[workflow] AI Resize: visible seam on the ${side} edge after a re-roll (${score.toFixed(1)}× the picture's own texture variation). The model re-imagined the frame instead of extending it.`,
} as const;
