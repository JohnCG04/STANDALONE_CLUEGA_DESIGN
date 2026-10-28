/** Where the original image sits inside the grown canvas. */
export type ExpandAnchor =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** `"alpha"`: ONE file, new area transparent (edit models with no mask param).
 *  `"gray"`: a neutral plate plus a black/white mask, for diffusion engines. */
export type ExpandFill = "alpha" | "gray";

/** The expand knobs, as they arrive on a node's free-form `params` bag. */
export interface ExpandImageParams {
  /** Target frame ratio, e.g. `"16:9"`, `"16/9"` or `"1.7778"`. */
  aspectRatio?: string;
  /** Growth factor on top of `aspectRatio` (1.5 → 50% bigger). */
  scale?: number;
  /** Explicit target size; wins over `aspectRatio`/`scale`. */
  canvasWidth?: number;
  canvasHeight?: number;
  /** Read the explicit canvas as an EXACT frame (ad slot, social size): fit the source inside. */
  fitSource?: boolean;
  /** Area budget that stops a chain of reframes compounding. Defaults to the source. */
  maxPixels?: number;
  /** Explicit placement inside the canvas; wins over `anchor`. */
  offsetX?: number;
  offsetY?: number;
  anchor?: ExpandAnchor;
  /** Where the source sits, in fractions OF THE FRAME (Generative Fill); wins over every knob. */
  placement?: { x: number; y: number; width: number; height: number };
  /** Only meaningful in `"gray"` fill. */
  feather?: number;
  fill?: ExpandFill;
  /** Extra scene guidance. Never geometry. */
  prompt?: string;
  /** Catalog model override; only Generative Fill's outpaint (it has a picker) sets it. */
  model?: string;
}

/** Every number the raster steps need, in canvas pixels. */
export interface ExpandGeometry {
  canvasWidth: number;
  canvasHeight: number;
  offsetX: number;
  offsetY: number;
  imageWidth: number;
  imageHeight: number;
  feather: number;
  fill: ExpandFill;
}

/** Natural pixel size of the source. */
export interface ExpandSourceFrame {
  width: number;
  height: number;
}

/** What `readExpandPlan` needs off a `ResizeImageRequest`. */
export interface ExpandRoutingInput {
  /** Target ratio as `"W:H"` — the typed field the AI Resize node fills in. */
  aspectRatio?: string;
  params?: Record<string, unknown>;
}

/** Which edge of the kept original the worst transition sits on, and how bad it is. */
export interface SeamReport {
  side: "top" | "bottom" | "left" | "right" | "none";
  /** Cross-seam change in units of the picture's OWN local texture variation. */
  score: number;
}

/** A decoded image plus the object-url lifetime that backs it. */
export interface PixelSource {
  image: HTMLImageElement;
  /** Revoke the backing object url. Safe to call twice; a no-op on the direct path. */
  release(): void;
}

/** One way to get at an image's BYTES, plus its name in a failure report. */
export interface ByteSource {
  label: string;
  fetch(): Promise<Response>;
}
