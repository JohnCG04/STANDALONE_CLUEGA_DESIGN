import type {
  BlendMode,
  LogoCompositeRequest,
  LogoPlacement,
  LogoPosition,
  ObjectRect,
} from "@dogclaw-ad/workflow";
import {
  BLEND_MODE_LABELS,
  LOGO_COMPOSITE_DEFAULTS,
  LOGO_POSITIONS,
  MARGIN_RANGE,
  OPACITY_RANGE,
  SIZE_RANGE,
} from "./constants";
import type { NormalizedLogoComposite } from "./types";

/** An untyped `params` number, clamped into a slider's range. */
function clampNumber(
  value: unknown,
  { min, max }: { min: number; max: number },
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A 0..1 fraction as a percentage string. */
export function pct(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}

/** Rounded — sub-pixel precision is noise to an image model. */
export function px(value: number): string {
  return String(Math.round(value));
}

export const anchorXOf = (position: LogoPosition): 0 | 0.5 | 1 =>
  position.endsWith("-left") ? 0 : position.endsWith("-right") ? 1 : 0.5;

export const anchorYOf = (position: LogoPosition): 0 | 0.5 | 1 =>
  position.startsWith("top-") ? 0 : position.startsWith("bottom-") ? 1 : 0.5;

/** For a caller that sent `params.placement` without the raw `position`. */
function positionFromAnchors(
  anchorX: unknown,
  anchorY: unknown,
): LogoPosition | undefined {
  const row =
    anchorY === 0 ? "top" : anchorY === 1 ? "bottom" : anchorY === 0.5 ? "middle" : undefined;
  const column =
    anchorX === 0 ? "left" : anchorX === 1 ? "right" : anchorX === 0.5 ? "center" : undefined;
  if (!row || !column) return undefined;
  if (row === "middle" && column === "center") return "center";
  // The grid names its centered row "middle-…" but its centered column "…-center".
  if (row === "top" || row === "bottom") {
    return `${row}-${column}` as LogoPosition;
  }
  return `middle-${column}` as LogoPosition;
}

/** An unusable rect becomes `null` ("find the product yourself"), never a confidently wrong one. */
function objectRectOf(value: unknown): ObjectRect | null {
  if (!value || typeof value !== "object") return null;
  const rect = value as Partial<ObjectRect>;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x + width > 1.001 || y + height > 1.001) return null;
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

/** Raw knobs win and `placement` is RE-DERIVED, so prose and coordinates always agree.
 *  `objectBoxes` stays ALIGNED to `creativeUrls`: both are filtered in one pass. */
export function normalizeLogoCompositeRequest(
  req: LogoCompositeRequest,
): NormalizedLogoComposite {
  const params = req.params ?? {};
  const sent = (params.placement ?? {}) as Partial<LogoPlacement>;

  const rawPosition =
    typeof params.position === "string" ? params.position.trim() : "";
  const position = LOGO_POSITIONS.includes(rawPosition as LogoPosition)
    ? (rawPosition as LogoPosition)
    : (positionFromAnchors(sent.anchorX, sent.anchorY) ??
      LOGO_COMPOSITE_DEFAULTS.position);

  const size = clampNumber(
    params.size ?? (Number.isFinite(Number(sent.widthRatio)) ? Number(sent.widthRatio) * 100 : undefined),
    SIZE_RANGE,
    LOGO_COMPOSITE_DEFAULTS.size,
  );
  const opacity = clampNumber(
    params.opacity ?? (Number.isFinite(Number(sent.opacity)) ? Number(sent.opacity) * 100 : undefined),
    OPACITY_RANGE,
    LOGO_COMPOSITE_DEFAULTS.opacity,
  );
  const margin = clampNumber(
    params.margin ?? (Number.isFinite(Number(sent.marginRatio)) ? Number(sent.marginRatio) * 100 : undefined),
    MARGIN_RANGE,
    LOGO_COMPOSITE_DEFAULTS.margin,
  );

  const rawBlend = typeof params.blendMode === "string" ? params.blendMode.trim() : "";
  const blendMode = (rawBlend in BLEND_MODE_LABELS
    ? rawBlend
    : LOGO_COMPOSITE_DEFAULTS.blendMode) as BlendMode;

  // Node order is the contract: one asset back per creative, in this order.
  const sentBoxes = Array.isArray(params.objectBoxes) ? params.objectBoxes : [];
  const creativeUrls: string[] = [];
  const objectBoxes: (ObjectRect | null)[] = [];
  (req.images ?? []).forEach((image: any, index: number) => {
    const url = image?.url?.trim();
    if (!url) return;
    creativeUrls.push(url);
    objectBoxes.push(objectRectOf(sentBoxes[index]));
  });

  return {
    creativeUrls,
    objectBoxes,
    logoUrl: req.logo?.url?.trim() ?? "",
    placeRelativeTo:
      params.placeRelativeTo === "canvas" || params.placeRelativeTo === "object"
        ? params.placeRelativeTo
        : LOGO_COMPOSITE_DEFAULTS.placeRelativeTo,
    position,
    size,
    opacity,
    margin,
    blendMode,
    avoidContent: params.avoidContent !== false,
    preserveOriginal: params.preserveOriginal !== false,
    printOnSurface: params.printOnSurface === true,
    placement: {
      anchorX: anchorXOf(position),
      anchorY: anchorYOf(position),
      widthRatio: size / 100,
      marginRatio: margin / 100,
      opacity: opacity / 100,
    },
  };
}
