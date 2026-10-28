import { Proportions, Ratio, Scaling } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Job settings for the DESIGN (image generation) flow — the image twin of
 * `videoGenConfig`.
 *
 * Only two knobs exist, because only two are real for an image job:
 *   • `aspectRatio` — a first-class POST /jobs field (`aspect_ratio`). No longer
 *     unconditionally authoritative: a ratio named in the prompt ("poster 9:16")
 *     now outranks it, and `aspectExplicit` is what tells the backend whether a
 *     human chose this one or it is just the panel's default.
 *   • `resolution`  — a real wire field: it rides `options.resolution`, which
 *     media-ai maps to `image_config.image_size` (see media.api.md, "Image
 *     `options`"). THIS surface does not send it yet — the workflow Image node
 *     does (`components/workflow/actions/basic/generateImage.ts`) — so on the design
 *     panel the pick is still display-only. It is a gap, not a design: never
 *     state the tier in the prompt instead, or it competes with the field.
 *
 * Both are PER-MODEL: the catalog row says which values a model accepts
 * (`supported_aspect_ratios` / `supported_sizes`), surfaced through
 * `useImageModelCapabilities`. A model that declares nothing falls back to the
 * generic lists below, and `[0]` is always the default — never a value carried
 * over from a model that no longer offers it.
 */
export type ImageGenConfig = {
  /** Exact output frame, e.g. "1:1". Forwarded as the job's `aspect_ratio`. */
  aspectRatio: string;
  /** True only when a HUMAN picked {@link aspectRatio} (a ratio tile in the
   *  design panel). Absent means "this is the panel's default", and a ratio
   *  named in the prompt then wins. Travels as the job's `aspect_explicit`.
   *  Never set by {@link snapImageOption} — re-clamping after a model switch is
   *  not a choice anyone made. */
  aspectExplicit?: boolean;
  /** Target output size, e.g. "2K" or a bare short-edge pixel count ("1024").
   *  Travels as the job's `options.resolution` on the surfaces that send it. */
  resolution: string;
};

/**
 * Aspect ratios POST /jobs accepts. A model-declared ratio outside this set is
 * dropped rather than offered: sending one the API doesn't know fails the job,
 * and a tile the user cannot use is worse than one fewer tile. Mirrors
 * `SUPPORTED_ASPECT_RATIOS` in components/workflow/actions/storyboard/constants.ts — the two
 * must agree, or the same value is offered on one surface and rejected on the other.
 */
export const SUPPORTED_ASPECT_RATIOS = new Set([
  "1:1",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

/** Ratio tiles shown when the model declares none (or the catalog is cold).
 *  Ordered by how often an ad creative wants them, so `[0]` (1:1) is the default. */
export const IMAGE_ASPECT_RATIO_OPTIONS: string[] = [
  "1:1",
  "4:5",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
];

/** Resolution tiles shown when the model declares none. Mirrors the workflow
 *  editor's `IMAGE_RESOLUTIONS_DEFAULT`. `[0]` (1K) is the default. */
export const IMAGE_RESOLUTION_OPTIONS: string[] = ["1K", "2K", "4K"];

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  aspectRatio: IMAGE_ASPECT_RATIO_OPTIONS[0],
  resolution: IMAGE_RESOLUTION_OPTIONS[0],
};

/**
 * The ratio tiles to offer for a model: its own `supported_aspect_ratios` when
 * the catalog knows them, else the generic list. Never intersect the two — a
 * model whose real list is 2:3/3:2 must be able to offer them. Values the API
 * would reject are filtered out (see {@link SUPPORTED_ASPECT_RATIOS}); if that
 * leaves nothing, fall back rather than render an empty section.
 */
export function aspectRatioOptionsFor(
  modelRatios: readonly string[] | undefined,
): string[] {
  if (!modelRatios || modelRatios.length === 0) {
    return IMAGE_ASPECT_RATIO_OPTIONS;
  }
  const allowed = [...new Set(modelRatios)].filter((r) =>
    SUPPORTED_ASPECT_RATIOS.has(r),
  );
  return allowed.length > 0 ? allowed : IMAGE_ASPECT_RATIO_OPTIONS;
}

/**
 * The resolution tiles to offer for a model. The catalog's vocabulary is passed
 * through verbatim — image rows ship either tiers ("1K"/"2K") or bare short-edge
 * pixel counts ("1024"/"2048"), and translating between them would state a size
 * the model never advertised.
 */
export function resolutionOptionsFor(
  modelResolutions: readonly string[] | undefined,
): string[] {
  if (!modelResolutions || modelResolutions.length === 0) {
    return IMAGE_RESOLUTION_OPTIONS;
  }
  return [...new Set(modelResolutions)];
}

/**
 * Keep `value` when the model still offers it, else fall back to `allowed[0]`.
 *
 * This is the "Auto → option[0]" rule and the model-switch re-clamp in one: the
 * catalog lists a model's values in PREFERENCE order, so `[0]` is that model's
 * own default. Carrying a 21:9 choice onto a model that only renders 1:1 / 4:5
 * would send a value it rejects.
 */
export function snapImageOption(
  value: string | undefined,
  allowed: readonly string[],
): string {
  if (allowed.length === 0) return value ?? "";
  return value && allowed.includes(value) ? value : allowed[0];
}

/** Long-edge pixels a resolution tier means, used to spell the target out for
 *  the model. Only the tier vocabulary needs this — a bare pixel count already
 *  says its own size. */
const RESOLUTION_TIER_PIXELS: Record<string, number> = {
  "1K": 1024,
  "2K": 2048,
  "4K": 4096,
};

/**
 * The long-edge pixel count a resolution TIER stands for ("1K" → "1024px"), so
 * the tier is not the only thing the user has to go on. Returns nothing for the
 * bare-pixel vocabulary some catalog rows use ("1024"), which already states its
 * own size — repeating it would read as two different numbers.
 */
export function resolutionPixelsLabel(resolution: string): string | undefined {
  const pixels = RESOLUTION_TIER_PIXELS[resolution];
  return pixels ? `${pixels}px` : undefined;
}

export const IMAGE_ASPECT_RATIO_SECTION_ICON: LucideIcon = Proportions;
export const IMAGE_RESOLUTION_SECTION_ICON: LucideIcon = Scaling;
/** Trigger icon for the design config popover. */
export const IMAGE_CONFIG_TRIGGER_ICON: LucideIcon = Ratio;
