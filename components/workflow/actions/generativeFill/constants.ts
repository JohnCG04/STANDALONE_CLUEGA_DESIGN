/** The INPAINT contract, static: the CUT-OUT states the region, so prose could only contradict it.
 *  Guards redrawing the whole picture ("unchanged" per axis) and painting the hole's own shape. */
export const INPAINT_PROMPT_BASE =
  "This is a photograph with one region cut out of it. The transparent region " +
  // A provider that flattens the PNG hands over a filled hole: the expand prompt's same hedge.
  "— which may reach you flattened to flat black, white or grey — is the ONLY " +
  "part of the picture you may change. " +
  "Return the same photograph with that region filled in. Every pixel outside it " +
  "must come back exactly as it is: same framing, same dimensions, same aspect " +
  "ratio, same subject, same colours, same lighting, same grain. " +
  "Blend the filled region into what surrounds it so the cut-out leaves no trace: " +
  "match the perspective, the lighting direction, the shadows, the colour tone, " +
  "the focus and the noise of the pixels around it, and never draw the cut-out's " +
  "own shape, edge, outline or halo into the picture. " +
  "Never output a mask, a side-by-side, a grid or a crop — the answer is one " +
  "picture, the same size as the input.";

/** No typed prompt = content-aware erase; an empty prompt invites the model to invent a subject. */
export const INPAINT_PROMPT_ERASE =
  "Fill the cut-out region with a plausible continuation of the BACKGROUND " +
  "behind it, as if whatever stood there had never been in the photograph. Do " +
  "not add any new subject, object, person, text or logo.";

/** The user's own words, last — an addition to the contract, never a rewrite. */
export const INPAINT_PROMPT_FILL = (prompt: string): string =>
  `Paint this into the cut-out region, and only into it: ${prompt}`;
