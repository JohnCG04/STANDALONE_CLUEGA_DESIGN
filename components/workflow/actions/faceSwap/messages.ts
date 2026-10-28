import type { FaceDetectErrorKey } from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";

export const FACE_DETECT_ERROR_MESSAGES: Record<FaceDetectErrorKey, string> = {
  badImage: "Could not load that image. Check the URL and try again.",
  artifactNotFound: "The uploaded image was not found. Upload it again.",
  invalidRequest: "Provide exactly one image: an upload or a URL.",
  modelFailed: "The face detection model failed. Try again.",
  serviceUnavailable: "Face detection is unavailable right now.",
  generic: "Face detection failed. Try again.",
};

export const FACE_SWAP_MESSAGES = {
  noTarget: "Face Swap received no target image.",
  noSource: "Face Swap received no face source image.",
  noTargetFace:
    "No face found in the target image. Connect an image with a visible face, or turn off Keep Original Framing to let the model rewrite the whole image.",
  jobFailed: "Face swap job failed.",
  timeout:
    "Face swap is still running after 5 minutes. It may still finish — check your media library shortly.",
} as const;

export const FACE_DETECT_MESSAGES = {
  noSource: "Face Detect received no source image.",
} as const;

export const FACE_SWAP_WARNINGS = {
  measuredElsewhere:
    "[workflow] face swap: picked faces were measured on a different frame — detecting instead.",
  unusableRect: "[workflow] face swap: dropping an unusable picked face box.",
  noSourceFace:
    "[workflow] face swap: no face detected in the source image — using the whole image as the identity crop.",
} as const;
