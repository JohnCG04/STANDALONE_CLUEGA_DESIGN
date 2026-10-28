import type { ObjectRect } from "@dogclaw-ad/workflow";
import { CANVAS_BOX } from "./constants";
import type {
  ImageFrame,
  LogoArtwork,
  LogoCompositeGeometry,
  NormalizedLogoComposite,
} from "./types";

/** Pin to the anchored edge with its inset, or center — then keep it inside the box. */
function along(
  anchor: 0 | 0.5 | 1,
  start: number,
  span: number,
  size: number,
  margin: number,
): number {
  // Bigger than its box: centering is the only placement that reads as intentional.
  if (size >= span) return start + (span - size) / 2;
  const at =
    anchor === 0
      ? start + margin
      : anchor === 1
        ? start + span - size - margin
        : // A centered axis ignores the margin — it would only push it off center.
          start + (span - size) / 2;
  return Math.min(Math.max(at, start), start + span - size);
}

/** A port of the package's `logoOverlayStyle`: the rect the Live Preview showed. Without
 *  `frame` and `artwork`, `rect` is omitted and the prompt states percentages. */
export function resolveLogoGeometry(
  batch: NormalizedLogoComposite,
  index: number,
  frame?: ImageFrame | null,
  artwork?: LogoArtwork | null,
): LogoCompositeGeometry {
  const detected =
    batch.placeRelativeTo === "object" ? batch.objectBoxes[index] : null;
  const box = detected ?? CANVAS_BOX;
  const anchoredToObject = !!detected;

  const { anchorX, anchorY, widthRatio, marginRatio } = batch.placement;

  // Both in fractions of the creative's WIDTH (the package's unit): a square inset on any box.
  const width = widthRatio * box.width;
  const marginX = marginRatio * box.width;

  const usableFrame = frame && frame.width > 0 && frame.height > 0 ? frame : undefined;
  const logoAspect =
    artwork && artwork.aspectRatio > 0 ? artwork.aspectRatio : undefined;

  if (!usableFrame || !logoAspect) {
    return { box, anchoredToObject, frame: usableFrame, artwork: artwork ?? undefined };
  }

  // Converts a width fraction into the height fraction with the same pixel count.
  const aspect = usableFrame.width / usableFrame.height;
  const height = (width * aspect) / logoAspect;
  const marginY = marginX * aspect;

  const rect: ObjectRect = {
    x: along(anchorX, box.x, box.width, width, marginX),
    y: along(anchorY, box.y, box.height, height, marginY),
    width,
    height,
  };

  const left = rect.x * usableFrame.width;
  const top = rect.y * usableFrame.height;
  const pxWidth = rect.width * usableFrame.width;
  const pxHeight = rect.height * usableFrame.height;

  return {
    box,
    anchoredToObject,
    rect,
    pixels: {
      left,
      top,
      right: left + pxWidth,
      bottom: top + pxHeight,
      width: pxWidth,
      height: pxHeight,
    },
    frame: usableFrame,
    artwork: artwork ?? undefined,
  };
}
