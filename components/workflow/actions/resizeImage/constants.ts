import { DEFAULT_IMAGE_MODEL } from "../../shared/constants";

/** The node has no model picker, so the host owns the routing. */
export const RESIZE_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;
export const RESIZE_FEATURE = "AI Resize";

/** The ONLY guard on cost: canvas size drives memory and the provider bill. */
export const MAX_EXPAND_EDGE = 4096;
export const MAX_EXPAND_PIXELS = 16_000_000;

/** Wide enough to blend across, narrow enough to stay mostly hard mask. */
export const DEFAULT_FEATHER = 24;

/** Below this the "expansion" is a rounding error — a full job for nothing. */
export const MIN_EXPAND_BAND = 8;

/** How far an EXACT frame (`fitSource`) may enlarge a small source: closing a 5% gap beats side
 *  strips, but past this the resample is mush next to a sharp painted band. */
export const MAX_SOURCE_UPSCALE = 1.5;

/** Static: the numbers are geometry (mask, paste-back), so prose could only clash. */
export const EXPAND_PROMPT_BASE =
  "Extend this photograph outward to fill the empty border area so the result reads " +
  "as one continuous photograph. " +
  // A provider that flattens the PNG hands over a blank band, not a transparent one.
  "Fill the empty (transparent or blank) border area with a natural continuation of " +
  "the existing BACKGROUND only: keep the horizon line, ground plane, perspective, " +
  "lighting, color tone and grain aligned across the boundary so no seam is visible. " +
  // An edit model echoes the subject into the band — "no NEW subjects" missed that.
  "The subject of the existing image must appear exactly once, in its original " +
  "position: never duplicate, mirror, tile, reflect or echo the subject or any " +
  "object into the new area. " +
  "Do not modify, move, restyle, rescale or re-crop any part of the existing image. " +
  "Do not add new subjects, people, products, text, watermarks or logos.";

/** In "gray" fill the model gets two rasters, so the prompt must say which is which. */
export const EXPAND_PROMPT_MASK =
  "Input Image 1 is the picture to extend; its neutral gray areas are empty canvas. " +
  "Input Image 2 is the mask: paint only where the mask is white, and leave every " +
  "pixel where the mask is black exactly as it is.";

/** The FINISHED picture only; the canvas we SEND must be PNG (alpha = the instruction). */
export const PHOTO_TYPES = ["image/webp", "image/jpeg"] as const;
export const PHOTO_QUALITY = 0.92;

/** Longest edge the export check re-decodes onto. */
export const VERIFY_EDGE = 256;
/** Alpha at or below this counts as empty — the same floor the logo scan uses. */
export const ALPHA_EMPTY = 8;

/** A flat sky varies by nearly nothing; this floor (of 255) covers that. */
export const NATURAL_FLOOR = 2;
/** Enough to be representative, cheap to read. */
export const SEAM_SAMPLES = 96;
/** How far into the ORIGINAL the reference line sits. */
export const SEAM_REFERENCE_DEPTH = 4;

/** Above this a transition reads as a LINE (correct join 0.3–0.4, re-imagined frame 2.0–6.3).
 *  Never fatal: the run keeps the better of two attempts. */
export const SEAM_LIMIT = 2.5;
