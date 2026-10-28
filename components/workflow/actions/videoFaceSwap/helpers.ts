import type { Rect } from "./types";

/** Keep the picked face and its sample time together on the job wire. */
export function faceTargetJobOptions(
  face?: { rect?: Rect; measuredAt?: number },
): { face_swap_target_face?: Rect; face_swap_target_time?: number } {
  const rect = face?.rect;
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    return {};
  }
  const time = face?.measuredAt;
  return {
    face_swap_target_face: {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    },
    ...(typeof time === "number" && Number.isFinite(time) && time >= 0 && time <= 60
      ? { face_swap_target_time: time }
      : {}),
  };
}

/** Whose face is donated: the node's pick on the photo (absent, stage 1 takes its detector's
 *  first face). No time field: a still has one frame. */
export function sourceFaceJobOptions(
  face?: { rect?: Rect },
): { face_swap_source_face?: Rect } {
  const rect = face?.rect;
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    return {};
  }
  return {
    face_swap_source_face: {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    },
  };
}
