import {
  DEFAULT_FEATHER,
  EXPAND_PROMPT_BASE,
  EXPAND_PROMPT_MASK,
  MAX_EXPAND_EDGE,
  MAX_EXPAND_PIXELS,
  MAX_SOURCE_UPSCALE,
  MIN_EXPAND_BAND,
} from "./constants";
import { RESIZE_MESSAGES } from "./messages";
import type {
  ExpandAnchor,
  ExpandGeometry,
  ExpandImageParams,
  ExpandRoutingInput,
  ExpandSourceFrame,
} from "./types";

/** The node sends only `aspectRatio`; the rest defaults here. `params.expand` is the escape hatch
 *  for a caller that wants the knobs, and wins as the more specific intent. */
export function readExpandPlan(
  req: ExpandRoutingInput | undefined,
): ExpandImageParams {
  const params = req?.params;
  const raw = params?.expand;
  const bag: Record<string, unknown> =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const aspectRatio =
    str(bag.aspectRatio) ?? str(req?.aspectRatio) ?? str(params?.aspectRatio);
  const place = framePlacement(bag.placement);

  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(num(bag.scale) ? { scale: num(bag.scale) } : {}),
    ...(num(bag.canvasWidth) ? { canvasWidth: num(bag.canvasWidth) } : {}),
    ...(num(bag.canvasHeight) ? { canvasHeight: num(bag.canvasHeight) } : {}),
    ...(bag.fitSource === true ? { fitSource: true } : {}),
    ...(num(bag.maxPixels) ? { maxPixels: num(bag.maxPixels) } : {}),
    // 0 is a legal offset — finiteness, not truthiness.
    ...(finite(bag.offsetX) ? { offsetX: Math.round(bag.offsetX as number) } : {}),
    ...(finite(bag.offsetY) ? { offsetY: Math.round(bag.offsetY as number) } : {}),
    ...(isAnchor(bag.anchor) ? { anchor: bag.anchor } : {}),
    ...(place ? { placement: place } : {}),
    ...(finite(bag.feather) ? { feather: Math.max(0, bag.feather as number) } : {}),
    fill: bag.fill === "gray" ? "gray" : "alpha",
    ...(str(bag.prompt) ? { prompt: str(bag.prompt) } : {}),
    ...(str(bag.model) ? { model: str(bag.model) } : {}),
  };
}

/** A frame as fractions of itself, or nothing: above 1 puts the original outside its canvas. */
function framePlacement(
  value: unknown,
): ExpandImageParams["placement"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const bag = value as Record<string, unknown>;
  const [x, y, width, height] = ["x", "y", "width", "height"].map((key) =>
    Number(bag[key]),
  );
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return undefined;
  if (!(width > 0 && width <= 1 && height > 0 && height <= 1)) return undefined;
  return {
    x: clampUnit(x, 1 - width),
    y: clampUnit(y, 1 - height),
    width,
    height,
  };
}

function clampUnit(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isAnchor(value: unknown): value is ExpandAnchor {
  return (
    typeof value === "string" &&
    [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ].includes(value)
  );
}

/** `"16:9"` / `"16/9"` / `"1.7778"` → a width÷height number. */
function parseAspectRatio(value: string): number | null {
  const pair = value.match(/^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (pair) {
    const w = Number(pair[1]);
    const h = Number(pair[2]);
    return w > 0 && h > 0 ? w / h : null;
  }
  const single = Number(value);
  return Number.isFinite(single) && single > 0 ? single : null;
}

/** The source's contain-fitted size in an exact frame, upscale capped by `MAX_SOURCE_UPSCALE`.
 *  Exported so a caller can skip a no-op BEFORE `resolveExpandGeometry` throws over it. */
export function containSourceInFrame(
  frame: ExpandSourceFrame,
  canvasWidth: number,
  canvasHeight: number,
): ExpandSourceFrame {
  const contain = Math.min(
    canvasWidth / frame.width,
    canvasHeight / frame.height,
  );
  const scale = Math.min(contain, MAX_SOURCE_UPSCALE);
  return {
    width: clamp(frame.width * scale, 1, canvasWidth),
    height: clamp(frame.height * scale, 1, canvasHeight),
  };
}

/** Fits the frame to a pixel budget (default: the source's) so chained reframes converge.
 *  Throws rather than clamping on a no-op or a cap: both bill for a picture nobody asked for. */
export function resolveExpandGeometry(
  frame: ExpandSourceFrame,
  plan: ExpandImageParams,
): ExpandGeometry {
  return resolveGeometry(frame, plan.placement ? framedPlan(frame, plan) : plan);
}

/** A fractional `placement` → explicit canvas + offset, here where the real size is first known.
 *  `scale`/`aspectRatio` are dropped: either could only disagree with the dragged frame. */
function framedPlan(
  frame: ExpandSourceFrame,
  plan: ExpandImageParams,
): ExpandImageParams {
  const place = plan.placement!;
  const canvasWidth = Math.round(Math.round(frame.width) / place.width);
  const canvasHeight = Math.round(Math.round(frame.height) / place.height);
  const derived: ExpandImageParams = {
    ...plan,
    canvasWidth,
    canvasHeight,
    offsetX: Math.round(place.x * canvasWidth),
    offsetY: Math.round(place.y * canvasHeight),
    // The source keeps its own pixels: the frame was measured around them.
    fitSource: false,
  };
  delete derived.placement;
  delete derived.aspectRatio;
  delete derived.scale;
  return derived;
}

function resolveGeometry(
  frame: ExpandSourceFrame,
  plan: ExpandImageParams,
): ExpandGeometry {
  let imageWidth = Math.round(frame.width);
  let imageHeight = Math.round(frame.height);
  if (!(imageWidth > 0 && imageHeight > 0)) {
    throw new Error(RESIZE_MESSAGES.noSourceSize);
  }

  // Kept before the fit step can scale the draw size.
  const sourcePixels = imageWidth * imageHeight;

  // The fit step re-derives the short edge from this, so a scaled frame keeps the ratio too.
  const target = plan.aspectRatio ? parseAspectRatio(plan.aspectRatio) : null;
  if (plan.aspectRatio && !target) {
    throw new Error(RESIZE_MESSAGES.unreadableRatio(plan.aspectRatio));
  }

  const explicitCanvas = Boolean(plan.canvasWidth && plan.canvasHeight);
  let canvasWidth = plan.canvasWidth ? Math.round(plan.canvasWidth) : 0;
  let canvasHeight = plan.canvasHeight ? Math.round(plan.canvasHeight) : 0;

  // Grow only the axis SHORT for the ratio: "16:9 this square photo" adds side panels.
  if (!(canvasWidth && canvasHeight) && target) {
    const current = imageWidth / imageHeight;
    if (target > current) {
      canvasWidth = Math.round(imageHeight * target);
      canvasHeight = imageHeight;
    } else {
      canvasWidth = imageWidth;
      canvasHeight = Math.round(imageWidth / target);
    }
  }

  if (!(canvasWidth && canvasHeight)) {
    canvasWidth = imageWidth;
    canvasHeight = imageHeight;
  }

  // "16:9, 1.25×" means a 16:9 canvas with a margin all round.
  if (plan.scale && plan.scale > 0) {
    canvasWidth = Math.round(canvasWidth * plan.scale);
    canvasHeight = Math.round(canvasHeight * plan.scale);
  }

  // An EXACT frame can't grow, so the SOURCE is fitted into it instead of dragging it out.
  if (explicitCanvas && plan.fitSource) {
    const drawn = containSourceInFrame(
      { width: imageWidth, height: imageHeight },
      canvasWidth,
      canvasHeight,
    );
    imageWidth = drawn.width;
    imageHeight = drawn.height;
  }

  canvasWidth = Math.max(canvasWidth, imageWidth);
  canvasHeight = Math.max(canvasHeight, imageHeight);

  // `scale` is linear per axis, so the budget grows by its square or "1.5× bigger" is undone.
  const growth = plan.scale && plan.scale > 0 ? plan.scale : 1;
  const budget =
    plan.maxPixels ?? (explicitCanvas ? 0 : sourcePixels * growth * growth);
  const fit =
    budget > 0
      ? Math.min(1, Math.sqrt(budget / (canvasWidth * canvasHeight)))
      : 1;

  if (fit < 1) {
    canvasWidth = Math.max(1, Math.round(canvasWidth * fit));
    canvasHeight = Math.max(1, Math.round(canvasHeight * fit));
    // Re-derive from the ratio: a twice-rounded edge drifts (1365×769) and ad platforms reject it.
    if (target) {
      if (canvasWidth >= canvasHeight) {
        canvasHeight = Math.max(1, Math.round(canvasWidth / target));
      } else {
        canvasWidth = Math.max(1, Math.round(canvasHeight * target));
      }
    }
    imageWidth = Math.min(Math.max(1, Math.round(imageWidth * fit)), canvasWidth);
    imageHeight = Math.min(Math.max(1, Math.round(imageHeight * fit)), canvasHeight);
  }

  // Measured AFTER the fit — that is the canvas the model is handed.
  const grewX = canvasWidth - imageWidth;
  const grewY = canvasHeight - imageHeight;
  if (grewX < MIN_EXPAND_BAND && grewY < MIN_EXPAND_BAND) {
    throw new Error(RESIZE_MESSAGES.nothingToPaint);
  }
  if (canvasWidth > MAX_EXPAND_EDGE || canvasHeight > MAX_EXPAND_EDGE) {
    throw new Error(RESIZE_MESSAGES.edgeCap(canvasWidth, canvasHeight));
  }
  if (canvasWidth * canvasHeight > MAX_EXPAND_PIXELS) {
    throw new Error(RESIZE_MESSAGES.pixelCap(canvasWidth, canvasHeight));
  }

  // An EXPLICIT offset counts source pixels, so it moves with the frame's own factor.
  const anchored = anchorOffset(plan.anchor ?? "center", grewX, grewY);
  const offsetX = clamp(
    plan.offsetX === undefined ? anchored.x : plan.offsetX * fit,
    0,
    grewX,
  );
  const offsetY = clamp(
    plan.offsetY === undefined ? anchored.y : plan.offsetY * fit,
    0,
    grewY,
  );

  return {
    canvasWidth,
    canvasHeight,
    offsetX,
    offsetY,
    imageWidth,
    imageHeight,
    feather: plan.feather ?? DEFAULT_FEATHER,
    fill: plan.fill ?? "alpha",
  };
}

function anchorOffset(
  anchor: ExpandAnchor,
  grewX: number,
  grewY: number,
): { x: number; y: number } {
  const midX = Math.round(grewX / 2);
  const midY = Math.round(grewY / 2);
  switch (anchor) {
    case "top":
      return { x: midX, y: 0 };
    case "bottom":
      return { x: midX, y: grewY };
    case "left":
      return { x: 0, y: midY };
    case "right":
      return { x: grewX, y: midY };
    case "top-left":
      return { x: 0, y: 0 };
    case "top-right":
      return { x: grewX, y: 0 };
    case "bottom-left":
      return { x: 0, y: grewY };
    case "bottom-right":
      return { x: grewX, y: grewY };
    default:
      return { x: midX, y: midY };
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/** The user's text goes last, so it reads as an addition to the contract. */
export function buildExpandPrompt(
  plan: ExpandImageParams,
  geo: ExpandGeometry,
): string {
  const parts = [EXPAND_PROMPT_BASE];
  if (geo.fill === "gray") parts.push(EXPAND_PROMPT_MASK);
  const extra = plan.prompt?.trim();
  if (extra) parts.push(extra);
  return parts.join("\n\n");
}
