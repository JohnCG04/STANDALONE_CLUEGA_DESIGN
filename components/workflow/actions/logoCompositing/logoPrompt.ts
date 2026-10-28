import {
  BLEND_MODE_LABELS,
  BLEND_MODE_PROSE,
  FRACTIONS,
} from "./constants";
import { pct, px } from "./helpers";
import type { LogoCompositeGeometry, NormalizedLogoComposite } from "./types";

function nearestFraction(value: number): string {
  let best = FRACTIONS[0];
  for (const entry of FRACTIONS) {
    if (Math.abs(entry[0] - value) < Math.abs(best[0] - value)) best = entry;
  }
  return best[1];
}

/** The part that differs between a 20% and a 40% logo in the output. */
function sizeScale(widthRatio: number): string {
  if (widthRatio < 0.12)
    return "VERY SMALL — a discreet mark, easy to miss at a glance";
  if (widthRatio < 0.22)
    return "SMALL — a modest brand mark that sits quietly on the surface";
  if (widthRatio < 0.35)
    return "MEDIUM — immediately visible, but the product still dominates";
  if (widthRatio < 0.55)
    return "LARGE — a prominent brand mark that reads as the product's main branding";
  if (widthRatio < 0.8)
    return "VERY LARGE — it dominates the product's visible surface";
  return "MAXIMAL — it spans nearly the entire width of the product";
}

/** The intended look, plus what it must NOT look like. */
function opacityLook(opacity: number): { label: string; guidance: string } {
  if (opacity >= 95)
    return {
      label: "FULLY OPAQUE — solid ink",
      guidance:
        "The product's surface does not show through the logo's colored areas at all. Only its transparent areas reveal what is beneath.",
    };
  if (opacity >= 80)
    return {
      label: "NEARLY SOLID",
      guidance:
        "Only the faintest surface texture and shading read through it. It is clearly a printed mark, not a watermark.",
    };
  if (opacity >= 60)
    return {
      label: "CLEARLY TRANSLUCENT",
      guidance:
        "The product's color, texture and highlights must read through the logo noticeably. An observer must be able to tell at a glance that it is see-through.",
    };
  if (opacity >= 40)
    return {
      label: "HALF TRANSPARENT",
      guidance:
        "The logo reads plainly as a translucent overlay. The surface beneath is clearly visible through every part of it.",
    };
  if (opacity >= 20)
    return {
      label: "FAINT WATERMARK",
      guidance:
        "Subtle and easily overlooked. The surface dominates; the logo is little more than a soft tint over it.",
    };
  if (opacity >= 5)
    return {
      label: "BARELY PERCEPTIBLE GHOST",
      guidance:
        "Only just visible on close inspection. It must not draw the eye.",
    };
  return {
    label: "ESSENTIALLY INVISIBLE",
    guidance: "Apply it at the very edge of perceptibility.",
  };
}

/** Keyed off INTENT, not a measured rect: object mode with a failed measure is still "product". */
function surfaceNoun(batch: NormalizedLogoComposite): string {
  return batch.placeRelativeTo === "object" ? "product" : "image";
}

/** For the degraded path, where no absolute rectangle resolved. */
function horizontalMarginLine(
  batch: NormalizedLogoComposite,
  noun: string,
): string {
  switch (batch.placement.anchorX) {
    case 0:
      return `Left margin: ${batch.margin}% of the ${noun}'s width, inset from the ${noun}'s LEFT edge.`;
    case 1:
      return `Right margin: ${batch.margin}% of the ${noun}'s width, inset from the ${noun}'s RIGHT edge.`;
    default:
      return `Horizontal alignment: centered on the ${noun}. No horizontal margin applies.`;
  }
}

function verticalMarginLine(
  batch: NormalizedLogoComposite,
  noun: string,
): string {
  switch (batch.placement.anchorY) {
    case 0:
      return `Top margin: the same distance as the horizontal one (${batch.margin}% of the ${noun}'s width), inset from the ${noun}'s TOP edge.`;
    case 1:
      return `Bottom margin: the same distance as the horizontal one (${batch.margin}% of the ${noun}'s width), inset from the ${noun}'s BOTTOM edge.`;
    default:
      return `Vertical alignment: centered on the ${noun}. No vertical margin applies.`;
  }
}

/** One EDIT prompt PER JOB: measured constants over formulas, the product as the frame, the logo
 *  as a CUT-OUT; preservation LAST (weighs most). `cutout` false never claims a missing alpha. */
export function buildLogoCompositePrompt(
  batch: NormalizedLogoComposite,
  geometry: LogoCompositeGeometry,
  { cutout = false }: { cutout?: boolean } = {},
): string {
  const noun = surfaceNoun(batch);
  // Whether the clauses about a physical object (silhouette, visible face) apply.
  const onObject = batch.placeRelativeTo === "object";
  const { rect, pixels, frame, artwork } = geometry;

  const intro =
    "You are performing a LOCAL, MASKED edit on Input Image 1. You are NOT generating a new image, re-rendering a scene, or re-photographing a product.";

  const inputMapping = [
    "INPUT MAPPING:",
    "",
    "* Input Image 1 is the immutable source photograph. It is LOCKED.",
    `* Input Image 2 is the exact logo artwork to apply${
      cutout ? " — a background-removed PNG with a transparent alpha channel" : ""
    }.`,
  ].join("\n");

  // Stated FIRST and repeated as VERIFY: the two positions that weigh most.
  const editScope = [
    "EDIT SCOPE — READ BEFORE ANYTHING ELSE:",
    "Return Input Image 1 with exactly ONE change: the logo now appears on the product.",
    "",
    "Treat every pixel of Input Image 1 outside the logo's own footprint as a LOCKED MASK you are forbidden to touch. Copy those pixels through unchanged.",
    "",
    "All of the following must come back IDENTICAL to Input Image 1:",
    "",
    "- camera angle, framing, crop, perspective and canvas dimensions",
    "- the product's shape, silhouette, position, proportions, color and material",
    "- every highlight, shadow, reflection, droplet, blemish and surface texture",
    "- the background, floor, surrounding objects, and depth of field",
    "- global color grade, white balance, exposure, contrast, grain and sharpness",
    "",
    "Do not improve, clean up, re-light, re-shoot, re-stage, straighten, denoise, upscale or restyle anything. Do not redraw the product. If you are regenerating the scene rather than copying it, you have already failed this task.",
  ].join("\n");

  const task = [
    "TASK:",
    onObject
      ? `Edit Input Image 1 by branding the main product in it with the logo from Input Image 2, applied to the ${batch.position} area OF THE PRODUCT ITSELF.`
      : `Edit Input Image 1 by applying the logo from Input Image 2 to the ${batch.position} area of the image.`,
    ...(onObject
      ? [
          "",
          `The position refers to the product, not to the photograph. Do NOT place the logo in the ${batch.position} of the CANVAS.`,
        ]
      : []),
    "",
    "The placement below is already computed. Do not re-derive it, re-balance it, or substitute a composition you find more pleasing.",
  ].join("\n");

  // Either the measured rect, or prose that asks the model to find the product.
  const targetSurface = geometry.anchoredToObject
    ? [
        "TARGET SURFACE — the product's bounding box is already measured. Use these numbers; do not re-detect it:",
        "",
        ...(frame
          ? [
              `Input Image 1 is ${frame.width} x ${frame.height} pixels.`,
              "",
              `The product occupies the rectangle x: ${px(geometry.box.x * frame.width)} to ${px((geometry.box.x + geometry.box.width) * frame.width)} px, y: ${px(geometry.box.y * frame.height)} to ${px((geometry.box.y + geometry.box.height) * frame.height)} px.`,
              `As percentages of the frame: it starts ${pct(geometry.box.x)} across and ${pct(geometry.box.y)} down, and spans ${pct(geometry.box.width)} of the width and ${pct(geometry.box.height)} of the height.`,
            ]
          : [
              `The product starts ${pct(geometry.box.x)} across and ${pct(geometry.box.y)} down the frame, and spans ${pct(geometry.box.width)} of the frame's width and ${pct(geometry.box.height)} of its height.`,
            ]),
        "",
        "Every placement number below is measured against THAT box, not against the canvas.",
        "",
        "The logo must land on the product's own visible surface. It must not sit on the background, the floor, the table, the shadow, or any negative space around the product, and it must not cross the product's silhouette edge.",
      ].join("\n")
    : [
        "TARGET SURFACE:",
        batch.placeRelativeTo === "object"
          ? "No subject rectangle could be measured for this creative, so identify it yourself: find the main product or subject in Input Image 1 — the dominant physical object the photograph is about — and establish its bounding box."
          : "The placement frame for this creative is the whole canvas of Input Image 1.",
        "",
        ...(batch.placeRelativeTo === "object"
          ? [
              "Every placement number below is measured against THAT bounding box, not against the canvas.",
              "",
              "The logo must land on the product's own visible surface. It must not sit on the background, the floor, the table, the shadow, or any negative space around the product, and it must not cross the product's silhouette edge.",
              "",
              "FALLBACK: only if Input Image 1 contains no clear product or subject — a flat background, a texture, a pattern, an empty scene — treat the whole canvas as the target surface.",
            ]
          : [
              "Measure the position, the size and the margins against the full frame.",
            ]),
      ].join("\n");

  // Without this, a logo on a white card gets stamped WITH the card.
  const logoArtwork = [
    "LOGO ARTWORK — Input Image 2 is a CUT-OUT:",
    "",
    cutout
      ? "* It has already been background-removed. Its alpha channel is the mask: opaque pixels ARE the logo, transparent pixels are NOT part of it."
      : "* Treat it as a cut-out. Only the mark itself is the logo; if the file carries any background around the mark — white, colored, a card, a checkerboard — cut it away first and composite the mark alone.",
    "* Composite ONLY the mark's own pixels. Never stamp Input Image 2's rectangular frame, and never paint its background area as white, black, grey, a checkerboard, a card, a plate, a sticker edge, a border or a box.",
    "* Do not add a drop shadow, glow, outline, halo, bevel, gradient or contact shadow that the artwork does not already contain.",
    "* Keep the cut-out's edges clean. No white or dark fringe, no matte halo, no visible seam against the product's surface.",
    ...(artwork?.trimmed
      ? [
          "",
          `* The file carries transparent padding around the mark: the actual artwork occupies only the region from ${pct(artwork.content.x)} to ${pct(artwork.content.x + artwork.content.width)} across and ${pct(artwork.content.y)} to ${pct(artwork.content.y + artwork.content.height)} down Input Image 2. Every size below refers to that VISIBLE ARTWORK, not to the padded file — ignore the padding entirely when you scale and place the mark.`,
        ]
      : []),
  ].join("\n");

  // Corners, span and center in both units — models latch onto different forms.
  const placement =
    rect && pixels && frame
      ? [
          "PLACEMENT — this rectangle is the answer. Fill it exactly:",
          "",
          `* The logo's visible artwork must occupy the rectangle x: ${px(pixels.left)} to ${px(pixels.right)} px, y: ${px(pixels.top)} to ${px(pixels.bottom)} px, in a ${frame.width} x ${frame.height} px image.`,
          `* That is ${px(pixels.width)} px wide and ${px(pixels.height)} px tall — ${pct(rect.width)} of the image's width and ${pct(rect.height)} of its height.`,
          `* Its center sits at x: ${px(pixels.left + pixels.width / 2)} px, y: ${px(pixels.top + pixels.height / 2)} px — ${pct(rect.x + rect.width / 2)} across the frame and ${pct(rect.y + rect.height / 2)} down it.`,
          "",
          `In words: the logo is anchored to the ${batch.position} of the ${noun}.`,
          `* ${horizontalMarginLine(batch, noun)}`,
          `* ${verticalMarginLine(batch, noun)}`,
          "",
          "* Preserve the logo's original aspect ratio — the rectangle above already has it.",
          "* Do not rotate the logo within the image plane. It may only follow the orientation of the surface it is printed on.",
          "* Do not re-center, re-balance or nudge the rectangle for visual taste.",
        ].join("\n")
      : [
          "PLACEMENT:",
          "",
          `* Position anchor: ${batch.position} of the ${noun}.`,
          `* The logo's width is ${batch.size}% of the ${noun}'s width. Its height follows from the logo's own aspect ratio.`,
          `* ${horizontalMarginLine(batch, noun)}`,
          `* ${verticalMarginLine(batch, noun)}`,
          "* Preserve the logo's original aspect ratio.",
          "* Do not rotate the logo within the image plane. It may only follow the orientation of the surface it is printed on.",
          "",
          `Anchor the logo's own edges, not its center: its anchored edges sit at the stated inset from the anchored edges of the ${noun}.`,
        ].join("\n");

  const logoSize = [
    "LOGO SIZE — this is a strict requirement, not a suggestion:",
    "",
    `* The logo's width is ${batch.size}% of the ${noun}'s width.`,
    `* In plain terms: the logo is ${nearestFraction(batch.placement.widthRatio)} as wide as the ${noun} is wide.`,
    `* Intended scale: ${sizeScale(batch.placement.widthRatio)}.`,
    ...(pixels
      ? [`* Concretely: ${px(pixels.width)} px wide in this image.`]
      : []),
    ...(artwork?.trimmed
      ? [
          `* That width is the VISIBLE MARK's width. Input Image 2's transparent padding does not count toward it — scaling the padded file to ${batch.size}% would render the mark too small.`,
        ]
      : []),
    "",
    ...(onObject
      ? [
          `Measure this against the PRODUCT, not the photograph: if the product occupies only part of the frame, ${batch.size}% means ${batch.size}% of the PRODUCT's width, never ${batch.size}% of the canvas.`,
          "",
        ]
      : []),
    "Do not default to a comfortable-looking size. Hit the stated width even when it looks unusually small or unusually large on the surface.",
  ].join("\n");

  // The alpha rule makes the slider act on the mark, not on a pasted rectangle.
  const look = opacityLook(batch.opacity);
  const opacityAndBlending = [
    "OPACITY AND BLENDING — also strict:",
    "",
    `* Logo opacity: ${batch.opacity}%.`,
    `* Intended look: ${look.label}.`,
    `* ${look.guidance}`,
    "",
    `* Blend mode: ${BLEND_MODE_LABELS[batch.blendMode]} — ${BLEND_MODE_PROSE[batch.blendMode]}.`,
    "",
    `* Opacity and blend mode apply PER PIXEL, over the mark's own shape only. Where the artwork is opaque the logo reads at ${batch.opacity}%; everywhere outside the mark nothing is drawn at all and the product shows through untouched. A ${batch.opacity}% logo is never a ${batch.opacity}% rectangle.`,
    ...(batch.opacity >= 95
      ? []
      : [
          "",
          `The difference between ${batch.opacity}% and a fully opaque logo must be obvious. Do not render a solid, fully opaque decal and call it done.`,
        ]),
  ].join("\n");

  // Moving resolves an overflow; resizing is a last resort: size is the knob the user checks first.
  const fitConstraint = [
    "FIT CONSTRAINT:",
    onObject
      ? [
          "The logo must sit entirely on the product's visible surface, without crossing its silhouette.",
          "",
          "CURVATURE IS NOT AN OVERFLOW. On a curved product — a can, a bottle, a jar, a tube — the stated width is measured ACROSS THE PRODUCT AS PHOTOGRAPHED, silhouette edge to silhouette edge, not along the flattened surface. A wide logo therefore wraps: its outer parts compress toward the edges as the surface turns away. That compression is the correct result and is NOT a reason to make the logo narrower. A logo that ends well short of both silhouette edges when the stated width says otherwise is wrong.",
          "",
          "If part of the rectangle would land past the silhouette, or on a face that is not visible from this camera, slide the logo inward along the shortest direction that fixes it — keeping its width exactly as specified and staying as close to the requested anchor as possible.",
        ].join("\n")
      : [
          "The logo must sit entirely inside the frame.",
          "",
          "If part of the rectangle would fall outside the canvas, slide the logo inward along the shortest direction that fixes it — keeping its width exactly as specified and staying as close to the requested anchor as possible.",
        ].join("\n"),
    "",
    "Scaling the logo down is a LAST RESORT, permitted only when sliding cannot make it fit at all. Do not shrink it to make the composition look more balanced, more typical, or more like a normal product label.",
  ].join("\n");

  // Bounded: an unbounded "move it if needed" turns a computed rectangle back into a suggestion.
  const contentAvoidance = [
    "CONTENT AVOIDANCE:",
    ...(batch.avoidContent
      ? [
          `Inspect the target rectangle on the ${noun}'s surface before applying the logo.`,
          "",
          `If it lands on existing branding, a label, readable text, or a critical product detail, move the logo by the minimum distance necessary — keeping its size unchanged, keeping it ON the ${noun}, and keeping it inside the ${batch.position} region of that surface.`,
          "",
          ...(onObject
            ? [
                "Never move the logo off the product, onto the background, or outside its silhouette in order to resolve an overlap. Staying on the product outranks avoiding the detail.",
                "",
              ]
            : []),
          "If there is no critical overlap, use the exact rectangle above. Do not move the logo unnecessarily.",
        ]
      : [
          "Place the logo at exactly the rectangle above.",
          "",
          "Do not shift, re-anchor, or re-balance the placement for any reason, including overlap with existing branding or product detail. The only permitted adjustment is the FIT CONSTRAINT above.",
        ]),
  ].join("\n");

  // The one section that grants latitude, which is why LOGO IDENTITY fences the rest.
  const surfaceIntegration = [
    "SURFACE INTEGRATION:",
    onObject
      ? "Apply the logo as if it were PRINTED on the product's surface, not pasted flat over the photograph."
      : "Apply the logo as if it were PRINTED on whatever surface it lands on, not pasted flat over the photograph.",
    "",
    "Conform it to that surface: follow the curvature, perspective, and orientation of the face it lands on, so it wraps and foreshortens the way real printing would.",
    "",
    `Let the ${onObject ? "product" : "scene"}'s own lighting act on it — highlights, shading, shadow falloff, reflections, and surface texture must read through the logo so it belongs to the object rather than floating above it.`,
    "",
    "It must look like part of the packaging, photographed in the same shot.",
    "",
    "Wrapping may change the logo's silhouette slightly; it must NOT change how much of the surface the logo covers. The rectangle above still bounds it.",
    "",
    "This section is ONE-DIRECTIONAL. Everything in it describes how the LOGO is drawn. None of it licenses a change to the photograph: the product's existing highlights, shadows, reflections and texture must not be redrawn, moved, strengthened or softened. You are only making the logo respond to light that is already there.",
  ].join("\n");

  const logoIdentity = [
    "LOGO IDENTITY:",
    "Use the actual artwork of Input Image 2. Its shapes, proportions, colors, typography, spacing, and transparency define the mark.",
    "",
    "Surface conforming and lighting are the ONLY things that may change its appearance. Do not redraw, reinterpret, regenerate, simplify, restyle, recolor, crop, re-letter, or add effects to the mark itself, and do not change its aspect ratio beyond the foreshortening the surface requires.",
    "",
    "The result must remain immediately recognizable as the same logo.",
  ].join("\n");

  const sourcePreservation = [
    "SOURCE PRESERVATION:",
    "Preserve Input Image 1 exactly outside the branded area.",
    "",
    "Do not regenerate, redraw, crop, resize, extend, retouch, relight, recolor, sharpen, blur, or alter any existing element of the source image.",
    "",
    "Preserve the original canvas dimensions, aspect ratio, composition, colors, lighting, background, texture, and image quality.",
    "",
    "The product's own shape, silhouette, position, proportions, material, and lighting must stay exactly as they are. Only its surface gains the logo — the object itself is not re-rendered, re-posed, or re-designed.",
  ].join("\n");

  // Checks on its own output: "preserve the source" as a bare rule is agreed to and then violated.
  const verify = [
    "VERIFY — run these checks on your result before returning it:",
    "",
    ...(pixels
      ? [
          `1. Measure the logo's width in the result. It must be ${px(pixels.width)} px, i.e. ${batch.size}% of the ${noun}'s width. If it is noticeably smaller or larger, redo it at the stated size.`,
          `2. Measure where it sits. Its center must be at x: ${px(pixels.left + pixels.width / 2)} px, y: ${px(pixels.top + pixels.height / 2)} px.`,
        ]
      : [
          `1. Measure the logo's width against the ${noun}'s width in the result. It must be ${batch.size}%. If it is noticeably smaller or larger, redo it at the stated size.`,
          `2. Check the anchor: the logo must sit in the ${batch.position} of the ${noun}, at the stated inset.`,
        ]),
    "3. Check the cut-out: there must be no rectangle, card, plate, box, halo or fringe around the mark — only the artwork itself over the product's surface.",
    batch.opacity >= 95
      ? `4. Check the opacity: at ${batch.opacity}% the mark reads as solid ink over the surface.`
      : `4. Check the opacity: the result must read as ${look.label.toLowerCase()}, not as a solid decal.`,
    "5. Compare the result against Input Image 1 region by region. Only the logo's own footprint may differ. If anything else changed — a shifted crop, a different shade of the product, a moved highlight or droplet, a re-rendered background, a softer or sharper image — the edit is wrong.",
    "",
    "If any check fails, discard the result and redo the edit as a pure local overlay on an otherwise byte-identical copy of Input Image 1.",
  ].join("\n");

  const output = [
    "OUTPUT:",
    "Return exactly one final composited image at the same resolution and aspect ratio as Input Image 1.",
    "",
    "Return only the edited image. Do not return explanations, captions, annotations, borders, masks, guides, or additional variants.",
  ].join("\n");

  return [
    intro,
    inputMapping,
    editScope,
    task,
    targetSurface,
    logoArtwork,
    placement,
    logoSize,
    opacityAndBlending,
    fitConstraint,
    contentAvoidance,
    surfaceIntegration,
    logoIdentity,
    sourcePreservation,
    verify,
    output,
  ].join("\n\n");
}
