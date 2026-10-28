import type {
  BlendMode,
  LogoPosition,
  ObjectRect,
  PlaceRelativeTo,
} from "@dogclaw-ad/workflow";
import { DEFAULT_IMAGE_MODEL } from "../../shared/constants";

/** The node has no model picker, so the host owns the routing. */
export const LOGO_COMPOSITE_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;
export const LOGO_COMPOSITE_FEATURE = "Logo Compositing";

/** One job per creative, so the batch is capped rather than fanned out unbounded. */
export const MAX_LOGO_COMPOSITE_CREATIVES = 20;

// Mirrored, not imported: the DOM-only package loads lazily, so the host imports only its TYPES.

export const LOGO_POSITIONS: readonly LogoPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  "soft-light": "Soft Light",
  "hard-light": "Hard Light",
  darken: "Darken",
  lighten: "Lighten",
  "color-burn": "Color Burn",
  "color-dodge": "Color Dodge",
  difference: "Difference",
  luminosity: "Luminosity",
};

export const LOGO_COMPOSITE_DEFAULTS = {
  placeRelativeTo: "object" as PlaceRelativeTo,
  position: "bottom-right" as LogoPosition,
  size: 15,
  opacity: 90,
  margin: 4,
  blendMode: "normal" as BlendMode,
  avoidContent: true,
  preserveOriginal: true,
};

// `margin` caps at 25: past a quarter of the box an inset just moves the logo (the grid's job).
export const SIZE_RANGE = { min: 1, max: 100 };
export const OPACITY_RANGE = { min: 0, max: 100 };
export const MARGIN_RANGE = { min: 0, max: 25 };

/** The whole creative — the anchor box for canvas-relative placement. */
export const CANVAS_BOX: ObjectRect = { x: 0, y: 0, width: 1, height: 1 };

// An image model ignores raw percentages, so every knob also travels as a fraction and a look.

/** Coarse on purpose — the nearest fraction beats an exact decimal here. */
export const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 10, "about one tenth"],
  [1 / 8, "about one eighth"],
  [1 / 6, "about one sixth"],
  [1 / 5, "about one fifth"],
  [1 / 4, "about one quarter"],
  [1 / 3, "about one third"],
  [2 / 5, "about two fifths"],
  [1 / 2, "about half"],
  [3 / 5, "about three fifths"],
  [2 / 3, "about two thirds"],
  [3 / 4, "about three quarters"],
  [4 / 5, "about four fifths"],
  // Reads into "the logo is ___ as wide as the product" — no trailing "as".
  [1, "essentially just"],
];

/** Each CSS blend keyword as a rule the model can follow. */
export const BLEND_MODE_PROSE: Record<BlendMode, string> = {
  normal: "the logo's own colors sit directly over the surface",
  multiply:
    "the logo may only DARKEN what is beneath it — its white and light areas vanish into the surface",
  screen:
    "the logo may only LIGHTEN what is beneath it — its black and dark areas vanish into the surface",
  overlay:
    "the logo boosts contrast where it lands: darks go darker, lights go lighter, and the surface's own shading stays legible through it",
  "soft-light":
    "the logo tints the surface gently, like a soft gel over a lamp — contrast shifts stay subtle",
  "hard-light":
    "the logo drives contrast hard, like a harsh light thrown onto the surface",
  darken:
    "for every pixel keep whichever is DARKER, the logo or the surface — wherever the logo is lighter than the surface, the surface shows through unchanged",
  lighten:
    "for every pixel keep whichever is LIGHTER, the logo or the surface — wherever the logo is darker than the surface, the surface shows through unchanged",
  "color-burn":
    "the logo darkens and saturates the surface intensely, deepening its shadows",
  "color-dodge":
    "the logo brightens and blows out the surface, lifting its highlights",
  difference:
    "the logo inverts the surface where the two differ, producing a high-contrast negative",
  luminosity:
    "only the logo's BRIGHTNESS is applied — the surface keeps its own hue and saturation",
};

/** 256 finds a bounding box to within half a percent, in under a millisecond. */
export const SAMPLE_EDGE = 256;

/** Alpha below this counts as background — matches the editor's subject-box scan. */
export const ALPHA_MIN = 8;

/** Under 1.5% on both axes the padding is a rounding error, not a trim. */
export const TRIM_MIN = 0.015;

/** "The whole file is the mark" — the fallback when alpha can't be read. */
export const FULL_FRAME: ObjectRect = { x: 0, y: 0, width: 1, height: 1 };
