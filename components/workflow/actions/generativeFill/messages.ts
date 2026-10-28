export const FILL_MESSAGES = {
  noSource: "Generative Fill received no source image.",
  // The package uploads the mask before calling: absent = a failed upload, not an unpainted node.
  noMask: "Generative Fill received no mask for the painted region.",
  // The mask is folded INTO the picture, so both rasters must be readable back out of a canvas.
  noContext: "Generative Fill could not open a canvas to cut the mask into.",
  unreadableSource: "Generative Fill could not read the source image's pixels.",
  unreadableMask: "Generative Fill could not read the mask's pixels.",
  emptyMask:
    "Generative Fill has nothing to paint — no region is marked. Paint over the part of the picture you want changed.",
  // As in AI Resize: the mask matches the picture AFTER its crop/resize chain, not the base asset.
  unbakedEdits:
    "Generative Fill needs the upstream edits applied first — bake the crop or resize before filling.",
  noFrame:
    "Generative Fill received no outpaint frame. Drag the frame past the image's edge, or pick a wider ratio.",
  identityFrame:
    "Generative Fill has nothing to paint — the frame is the image. Drag its handles outwards, or pick a ratio wider or taller than the image.",
} as const;

/** Outpaint errors come from AI Resize's pipeline: swap only the LEADING label, as the rest of
 *  each message is a technical fact that holds either way. */
export function asFillFailure(err: unknown): unknown {
  if (!(err instanceof Error) || !err.message.startsWith("AI Resize")) return err;
  return new Error(err.message.replace("AI Resize", "Generative Fill"));
}
