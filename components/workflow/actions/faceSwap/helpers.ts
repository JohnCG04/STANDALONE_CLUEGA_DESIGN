import {
  COLOR_STRENGTH_RANGE,
  CROP_PAD_RANGE,
  FEATHER_RANGE,
  MASK_SCALE_RANGE,
  type FaceSwapRequest,
  type FaceSwapTargetFace,
} from "@dogclaw-ad/workflow";
import {
  detectFaces,
  type FaceRect,
} from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";
import { FACE_SWAP_DEFAULTS } from "./constants";
import { FACE_SWAP_WARNINGS } from "./messages";
import { faceDetectErrorMessage } from "./response";
import { toJobInputUrl } from "../../shared/mediaProxy";
import type { FaceSwapOptions } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function clamp(
  value: number | undefined,
  range: { min: number; max: number },
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
}

function normalizeRect(rect: FaceRect | undefined): FaceRect | null {
  if (!rect) return null;

  const { x, y, width, height } = rect;
  if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  if (x > 1 || y > 1 || width > 1 || height > 1) return null;

  const left = clamp01(x);
  const top = clamp01(y);
  const right = clamp01(x + width);
  const bottom = clamp01(y + height);
  if (right <= left || bottom <= top) return null;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

const detectedFaces = new Map<string, Promise<FaceRect | null>>();

/** Largest detected face in an image, memoised per url. */
export function resolveLargestFace(url: string): Promise<FaceRect | null> {
  const cached = detectedFaces.get(url);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const res = await detectFaces({ imageUrl: url });
      let best: FaceRect | null = null;
      let bestArea = 0;

      for (const face of res.faces ?? []) {
        const rect = face.normalizedRect;
        if (!rect) continue;
        const area = rect.width * rect.height;
        if (area > bestArea) {
          best = rect;
          bestArea = area;
        }
      }

      return best;
    } catch (err) {
      detectedFaces.delete(url);
      throw new Error(faceDetectErrorMessage(err));
    }
  })();

  detectedFaces.set(url, pending);
  return pending;
}

/** The faces the user clicked, kept only when they were measured on this frame. */
export function pickedTargetFaces(
  faces: FaceSwapTargetFace[] | undefined,
  targetUrl: string,
): FaceRect[] {
  if (!faces?.length) return [];

  const elsewhere = faces.find(
    (face) => face.measuredOn && toJobInputUrl(face.measuredOn) !== targetUrl,
  );
  if (elsewhere) {
    console.warn(FACE_SWAP_WARNINGS.measuredElsewhere, elsewhere.measuredOn);
    return [];
  }

  const rects: FaceRect[] = [];
  for (const face of faces) {
    const rect = normalizeRect(face.rect);
    if (rect) rects.push(rect);
    else console.warn(FACE_SWAP_WARNINGS.unusableRect, face);
  }
  return rects;
}

export function buildFaceSwapOptions(
  req: FaceSwapRequest,
  targetFaces: FaceRect[],
  sourceFace: FaceRect | null,
): FaceSwapOptions {
  return {
    composite: req.composite !== false && targetFaces.length > 0,
    feather: clamp(req.feather, FEATHER_RANGE, FACE_SWAP_DEFAULTS.feather),
    mask_scale: clamp(req.maskScale, MASK_SCALE_RANGE, FACE_SWAP_DEFAULTS.maskScale),
    color_strength: clamp(
      req.colorStrength,
      COLOR_STRENGTH_RANGE,
      FACE_SWAP_DEFAULTS.colorStrength,
    ),
    crop_pad: clamp(req.cropPad, CROP_PAD_RANGE, FACE_SWAP_DEFAULTS.cropPad),
    ...(targetFaces.length ? { target_faces: targetFaces } : {}),
    ...(sourceFace ? { source_face: sourceFace } : {}),
  };
}
