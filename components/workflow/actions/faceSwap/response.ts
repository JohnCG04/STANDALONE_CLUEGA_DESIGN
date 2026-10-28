import {
  faceDetectErrorKey,
  FacesDetectError,
} from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";
import { FACE_DETECT_ERROR_MESSAGES, FACE_SWAP_MESSAGES } from "./messages";

/** A detector failure as a sentence; anything else rethrows untouched. */
export function faceDetectErrorMessage(err: unknown): string {
  if (err instanceof FacesDetectError) {
    return FACE_DETECT_ERROR_MESSAGES[faceDetectErrorKey(err.status)];
  }
  throw err;
}

/** Never rewrite the service's message: a safety refusal names the filter that fired. */
export function jobFailedError(error?: string | null): Error {
  return new Error(error || FACE_SWAP_MESSAGES.jobFailed);
}

export function timeoutError(): Error {
  return new Error(FACE_SWAP_MESSAGES.timeout);
}
