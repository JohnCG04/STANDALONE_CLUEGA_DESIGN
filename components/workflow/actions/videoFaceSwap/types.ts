import type { FACE_SWAP_EDIT_AXIS } from "./constants";

export type Rect = { x: number; y: number; width: number; height: number };

/** The wire options — media-ai's `VideoEditOptions` face-swap axis. */
export interface VideoFaceSwapJobOptions {
  edit_axis: typeof FACE_SWAP_EDIT_AXIS;
  face_swap_consent: true;
  face_swap_target: "prominent" | "all";
  /** ONE specific face and the frame where the detector found it. */
  face_swap_target_face?: { x: number; y: number; width: number; height: number };
  face_swap_target_time?: number;
  /** ONE face on the PHOTO: whose identity the swap donates. */
  face_swap_source_face?: { x: number; y: number; width: number; height: number };
}
