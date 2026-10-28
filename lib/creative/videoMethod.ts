/**
 * What each video generation method means for the request.
 *
 * `videoMethod` shipped as inert state (`useCreativeComposerStore`) with the
 * selector already built; this is the table that gives it effect — which roles
 * the method can use, which driver runs, and what the backend is told.
 */

import type { VideoMethod } from "@/lib/stores/useCreativeComposerStore";
import { MAX_REFERENCE_VIDEOS } from "./uploadRules";
import type { AttachmentRole, RoleCaps } from "./attachmentRoles";

/** The `generation_method` values media-ai accepts (camelCase, same vocabulary
 *  as the FE union so nothing has to be translated at the wire edge). */
export type WireGenerationMethod =
  | "reference"
  | "imageToVideo"
  | "textToVideo"
  | "videoToVideo";

const WIRE_GENERATION_METHODS: readonly WireGenerationMethod[] = [
  "reference",
  "imageToVideo",
  "textToVideo",
  "videoToVideo",
];

/** Narrow a method that arrived as free-form text (a 409 option's answer). */
export function asWireGenerationMethod(
  value: string | undefined | null,
): WireGenerationMethod | undefined {
  return WIRE_GENERATION_METHODS.find((method) => method === value);
}

export type MethodRules = {
  wire: WireGenerationMethod;
  /** Per-method role budget, overriding the tab's. */
  roleCaps: RoleCaps;
  /** Roles the method reads. Anything else attached is kept but unused. */
  uses: readonly AttachmentRole[];
  /** Softly expected — surfaced as a hint, never a submit block: a bare prompt
   *  still generates something. */
  wants: readonly AttachmentRole[];
  /** Storyboard = plan → confirm gate → render. Direct = one POST /jobs. */
  driver: "storyboard" | "direct";
};

export const VIDEO_METHOD_RULES: Record<VideoMethod, MethodRules> = {
  // The PRD default: learn the reference's pacing/camera/rhythm, keep the
  // product's identity. The storyboard exists precisely to carry that recipe.
  reference: {
    wire: "reference",
    // The one method that blends several references: the storyboard learns
    // pacing/camera from them and the recipe is distilled from the first.
    roleCaps: {
      product: 9,
      referenceVideo: MAX_REFERENCE_VIDEOS,
      referenceAudio: 1,
      // A still to imitate says nothing about pacing, and every video method
      // already has a motion reference for the look. Explicit 0 rather than
      // omitted: an absent budget falls back to the role's own ceiling.
      styleReference: 0,
    },
    uses: ["product", "referenceVideo", "referenceAudio"],
    wants: ["referenceVideo"],
    driver: "storyboard",
  },
  // Animate exactly this image. A storyboard would re-imagine every frame,
  // which is the opposite of the request, so it goes direct.
  imageToVideo: {
    wire: "imageToVideo",
    roleCaps: { product: 9, referenceVideo: 0, referenceAudio: 1, styleReference: 0 },
    uses: ["product", "referenceAudio"],
    wants: ["product"],
    driver: "direct",
  },
  textToVideo: {
    wire: "textToVideo",
    roleCaps: { product: 0, referenceVideo: 0, referenceAudio: 0, styleReference: 0 },
    uses: [],
    wants: [],
    driver: "direct",
  },
  // The one mode that reuses the reference's own footage. Kept distinct and
  // separately labelled precisely because it contradicts `reference`.
  videoToVideo: {
    wire: "videoToVideo",
    // Stays ONE whatever the request budget is: this mode restyles a single
    // source clip, and what "restyle these three clips" should produce is
    // undefined. The backend would forward them all, so the limit belongs here.
    roleCaps: { product: 0, referenceVideo: 1, referenceAudio: 0, styleReference: 0 },
    uses: ["referenceVideo"],
    wants: ["referenceVideo"],
    driver: "direct",
  },
};

export const rulesFor = (method: VideoMethod): MethodRules =>
  VIDEO_METHOD_RULES[method] ?? VIDEO_METHOD_RULES.reference;

/** True when this method reads assets of that role at all.
 *
 * A method the user switched to may not use something they already attached.
 * The attachment is kept — they picked a dropdown, they did not delete a file —
 * but it is left out of the request, so the strip has to say so; dropping it
 * silently looks like the reference was ignored. */
export const methodUsesRole = (
  method: VideoMethod,
  role: AttachmentRole,
): boolean => rulesFor(method).uses.includes(role);

/** Role budget for a tab+method pair: the stricter of the two. */
export function roleCapsFor(
  tabCaps: RoleCaps,
  method: VideoMethod | null,
): RoleCaps {
  if (!method) return tabCaps;
  const methodCaps = rulesFor(method).roleCaps;
  const merged: RoleCaps = { ...tabCaps };
  for (const [role, cap] of Object.entries(methodCaps) as [
    AttachmentRole,
    number,
  ][]) {
    const existing = merged[role];
    merged[role] = existing === undefined ? cap : Math.min(existing, cap);
  }
  return merged;
}
