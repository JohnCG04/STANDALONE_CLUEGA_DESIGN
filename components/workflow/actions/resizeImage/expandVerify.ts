import {
  ALPHA_EMPTY,
  MIN_EXPAND_BAND,
  NATURAL_FLOOR,
  SEAM_REFERENCE_DEPTH,
  SEAM_SAMPLES,
  VERIFY_EDGE,
} from "./constants";
import { createCanvas } from "./expandCanvas";
import { clamp } from "./helpers";
import { RESIZE_MESSAGES } from "./messages";
import { decodeImage } from "./pixelSource";
import type { ExpandGeometry, SeamReport } from "./types";

/** Reads the ENCODED PNG back (the encode is where alpha gets lost): the original's area must be
 *  opaque, the band transparent in `"alpha"`. Throws, or the original comes back rewritten. */
export async function verifyExpandCanvas(
  blob: Blob,
  geo: ExpandGeometry,
): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const decoded = await decodeImage(objectUrl, false);
    const scale = Math.min(
      1,
      VERIFY_EDGE / Math.max(geo.canvasWidth, geo.canvasHeight),
    );
    const sw = Math.max(1, Math.round(geo.canvasWidth * scale));
    const sh = Math.max(1, Math.round(geo.canvasHeight * scale));

    const sample = createCanvas(sw, sh);
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) return; // No context to verify with — don't fail the run over it.
    ctx.drawImage(decoded, 0, 0, sw, sh);

    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, sw, sh).data;
    } catch {
      // A blob: source cannot taint — only a blocked pixel read lands here.
      return;
    }

    const alphaAt = (x: number, y: number): number => {
      const px = clamp(Math.round(x * scale), 0, sw - 1);
      const py = clamp(Math.round(y * scale), 0, sh - 1);
      return data[(py * sw + px) * 4 + 3];
    };

    const keep = alphaAt(
      geo.offsetX + geo.imageWidth / 2,
      geo.offsetY + geo.imageHeight / 2,
    );
    if (keep <= ALPHA_EMPTY) {
      throw new Error(RESIZE_MESSAGES.sourceAreaTransparent);
    }

    const probe = fillProbe(geo);
    if (!probe) return; // No band wide enough to sample after downscaling.
    const fill = alphaAt(probe.x, probe.y);

    if (geo.fill === "alpha" && fill > ALPHA_EMPTY) {
      throw new Error(RESIZE_MESSAGES.lostAlpha);
    }
    if (geo.fill === "gray" && fill <= ALPHA_EMPTY) {
      throw new Error(RESIZE_MESSAGES.grayPlateTransparent);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** A point guaranteed to sit in the added band — the widest one. */
function fillProbe(geo: ExpandGeometry): { x: number; y: number } | null {
  const left = geo.offsetX;
  const right = geo.canvasWidth - (geo.offsetX + geo.imageWidth);
  const top = geo.offsetY;
  const bottom = geo.canvasHeight - (geo.offsetY + geo.imageHeight);

  const widest = Math.max(left, right, top, bottom);
  if (widest < MIN_EXPAND_BAND) return null;

  const midY = geo.offsetY + geo.imageHeight / 2;
  const midX = geo.offsetX + geo.imageWidth / 2;
  if (widest === left) return { x: left / 2, y: midY };
  if (widest === right) return { x: geo.canvasWidth - right / 2, y: midY };
  if (widest === top) return { x: midX, y: top / 2 };
  return { x: midX, y: geo.canvasHeight - bottom / 2 };
}

/** Cross-seam change ÷ the change just inside the original: a continued scene scores near 1,
 *  since an absolute colour difference can't tell a real horizon from a mismatch. */
export function seamStep(
  outside: Uint8ClampedArray,
  inside: Uint8ClampedArray,
  deeper: Uint8ClampedArray,
): number {
  const across = meanAbsDiff(outside, inside);
  const natural = meanAbsDiff(inside, deeper);
  return across / (natural + NATURAL_FLOOR);
}

/** Mean per-channel difference of two RGBA runs, alpha ignored. */
function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const pixels = Math.min(a.length, b.length) / 4;
  if (pixels < 1) return 0;
  let total = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    total +=
      Math.abs(a[o] - b[o]) +
      Math.abs(a[o + 1] - b[o + 1]) +
      Math.abs(a[o + 2] - b[o + 2]);
  }
  return total / (pixels * 3);
}

/** Catches a re-imagined frame: the paste-back leaves a VISIBLE STEP around the original. */
export function measureSeamDiscontinuity(
  canvas: HTMLCanvasElement,
  geo: ExpandGeometry,
): SeamReport {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { side: "none", score: 0 };

  const right = geo.canvasWidth - (geo.offsetX + geo.imageWidth);
  const bottom = geo.canvasHeight - (geo.offsetY + geo.imageHeight);
  const deep = Math.min(
    SEAM_REFERENCE_DEPTH,
    Math.max(1, Math.min(geo.imageWidth, geo.imageHeight) - 1),
  );

  // Per side: the band's last line, the original's first, and a reference line deeper inside.
  const edges: Array<{
    side: SeamReport["side"];
    band: number;
    lines: [number, number, number];
  }> = [
    { side: "top", band: geo.offsetY, lines: [geo.offsetY - 1, geo.offsetY, geo.offsetY + deep] },
    {
      side: "bottom",
      band: bottom,
      lines: [
        geo.offsetY + geo.imageHeight,
        geo.offsetY + geo.imageHeight - 1,
        geo.offsetY + geo.imageHeight - 1 - deep,
      ],
    },
    { side: "left", band: geo.offsetX, lines: [geo.offsetX - 1, geo.offsetX, geo.offsetX + deep] },
    {
      side: "right",
      band: right,
      lines: [
        geo.offsetX + geo.imageWidth,
        geo.offsetX + geo.imageWidth - 1,
        geo.offsetX + geo.imageWidth - 1 - deep,
      ],
    },
  ];

  let worst: SeamReport = { side: "none", score: 0 };
  for (const edge of edges) {
    if (edge.band < MIN_EXPAND_BAND) continue;
    const horizontal = edge.side === "top" || edge.side === "bottom";
    try {
      const [outside, inside, deeper] = edge.lines.map((at) =>
        horizontal
          ? ctx.getImageData(geo.offsetX, at, geo.imageWidth, 1).data
          : ctx.getImageData(at, geo.offsetY, 1, geo.imageHeight).data,
      ) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
      const score = seamStep(
        sampleLine(outside, SEAM_SAMPLES),
        sampleLine(inside, SEAM_SAMPLES),
        sampleLine(deeper, SEAM_SAMPLES),
      );
      if (score > worst.score) worst = { side: edge.side, score };
    } catch {
      // Blocked pixel read — nothing to report rather than a failed run.
      return { side: "none", score: 0 };
    }
  }
  return worst;
}

/** Evenly spaced samples, so the metric costs the same on any size. */
function sampleLine(line: Uint8ClampedArray, count: number): Uint8ClampedArray {
  const pixels = line.length / 4;
  if (pixels <= count) return line;
  const out = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const from = Math.min(pixels - 1, Math.round((i * (pixels - 1)) / (count - 1))) * 4;
    out.set(line.subarray(from, from + 4), i * 4);
  }
  return out;
}
