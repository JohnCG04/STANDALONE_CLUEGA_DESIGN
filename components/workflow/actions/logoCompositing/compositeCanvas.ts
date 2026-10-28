import type { Asset, BlendMode } from "@dogclaw-ad/workflow";
import { uploadFileToArtifact } from "../../shared/artifacts";
import { proxyImageAsset } from "../../shared/mediaProxy";
import { canvasToPngBlob } from "../resizeImage/expandCanvas";
import { loadPixelSource } from "../resizeImage/pixelSource";
import { FULL_FRAME } from "./constants";
import { resolveLogoGeometry } from "./logoGeometry";
import { LOGO_COMPOSITE_MESSAGES } from "./messages";
import type { ImageFrame, LogoArtwork, NormalizedLogoComposite } from "./types";

/** One draw of the mark: which pixels of the logo file land where, and how they mix. */
export interface LogoDrawPlan {
  source: { x: number; y: number; width: number; height: number };
  target: { x: number; y: number; width: number; height: number };
  alpha: number;
  operation: GlobalCompositeOperation;
}

/** Every non-normal blend id is already a canvas composite operation of the same name. */
function operationOf(mode: BlendMode): GlobalCompositeOperation {
  return mode === "normal" ? "source-over" : (mode as GlobalCompositeOperation);
}

/** The logo file's own measure from its pixels, when the cached scan could not read it. */
function artworkOrFrame(artwork: LogoArtwork | null, logo: ImageFrame): LogoArtwork {
  if (artwork) return artwork;
  return {
    ...logo,
    content: FULL_FRAME,
    trimmed: false,
    aspectRatio: logo.width / logo.height,
    hasAlpha: null,
  };
}

/** Where the mark goes on creative `index`. Blend and opacity only change how it mixes. */
export function drawPlan(
  batch: NormalizedLogoComposite,
  index: number,
  frame: ImageFrame,
  logo: ImageFrame,
  artwork: LogoArtwork | null,
): LogoDrawPlan {
  const measured = artworkOrFrame(artwork, logo);
  const geometry = resolveLogoGeometry(batch, index, frame, measured);
  if (!geometry.pixels) throw new Error(LOGO_COMPOSITE_MESSAGES.unmeasurable);
  // The rect is the MARK's box, so only the trimmed content is drawn into it.
  const { content } = measured;
  return {
    source: {
      x: content.x * logo.width,
      y: content.y * logo.height,
      width: content.width * logo.width,
      height: content.height * logo.height,
    },
    target: {
      x: geometry.pixels.left,
      y: geometry.pixels.top,
      width: geometry.pixels.width,
      height: geometry.pixels.height,
    },
    alpha: batch.opacity / 100,
    operation: operationOf(batch.blendMode),
  };
}

/** Exact, repeatable stamp in the browser: each creative at its own size, the mark in its rect. */
export async function compositeOnCanvas(
  batch: NormalizedLogoComposite,
  creativeUrls: string[],
  logo: { url: string; artwork: LogoArtwork | null },
  workflowId?: string,
  signal?: AbortSignal,
): Promise<Asset[]> {
  const logoSource = await loadPixelSource(logo.url);
  try {
    const logoFrame = {
      width: logoSource.image.naturalWidth,
      height: logoSource.image.naturalHeight,
    };
    const assets: Asset[] = [];
    for (const [index, url] of creativeUrls.entries()) {
      signal?.throwIfAborted();
      const creative = await loadPixelSource(url);
      try {
        const frame = {
          width: creative.image.naturalWidth,
          height: creative.image.naturalHeight,
        };
        const plan = drawPlan(batch, index, frame, logoFrame, logo.artwork);
        const canvas = document.createElement("canvas");
        canvas.width = frame.width;
        canvas.height = frame.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(LOGO_COMPOSITE_MESSAGES.noCanvas);
        ctx.drawImage(creative.image, 0, 0);
        ctx.globalAlpha = plan.alpha;
        ctx.globalCompositeOperation = plan.operation;
        const { source: s, target: t } = plan;
        ctx.drawImage(logoSource.image, s.x, s.y, s.width, s.height, t.x, t.y, t.width, t.height);
        const blob = await canvasToPngBlob(canvas);
        signal?.throwIfAborted();
        const file = new File([blob], `logo-composite-${index + 1}.png`, { type: "image/png" });
        assets.push(proxyImageAsset(await uploadFileToArtifact(file, workflowId)));
      } finally {
        creative.release();
      }
    }
    return assets;
  } finally {
    logoSource.release();
  }
}
