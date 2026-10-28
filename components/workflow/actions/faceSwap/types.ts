import type { FaceRect } from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";

export interface FaceSwapOptions {
  composite: boolean;
  feather: number;
  mask_scale: number;
  color_strength: number;
  crop_pad: number;
  target_faces?: FaceRect[];
  source_face?: FaceRect;
}
