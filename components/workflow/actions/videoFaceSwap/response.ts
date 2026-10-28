import { readJobError } from "../../shared/response";
import { VIDEO_FACE_SWAP_FEATURE } from "./constants";
import {
  VIDEO_FACE_SWAP_CODE_MESSAGES,
  VIDEO_FACE_SWAP_CONFLICT_MESSAGES,
  VIDEO_FACE_SWAP_MESSAGES,
} from "./messages";

/** A rejected submit as a sentence. Runs BEFORE `readCreatedJobId`: an OBJECT `detail` would be
 *  dumped as raw JSON by the shared reader, which gets other shapes via a rebuilt Response. */
export async function videoFaceSwapSubmitError(res: Response): Promise<Error> {
  const raw = await res.text().catch(() => "");

  try {
    const body = JSON.parse(raw) as {
      detail?: { code?: string; conflict?: string } | string | unknown[];
    };
    const detail = body.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      if (detail.code === "intent_conflict" && detail.conflict) {
        const msg = VIDEO_FACE_SWAP_CONFLICT_MESSAGES[detail.conflict];
        if (msg) return new Error(msg);
      }
      if (detail.code) {
        const msg = VIDEO_FACE_SWAP_CODE_MESSAGES[detail.code];
        if (msg) return new Error(msg);
      }
    }
  } catch {
    /* Not JSON — the shared reader's fallback handles it below. */
  }

  return new Error(
    await readJobError(
      new Response(raw, { status: res.status }),
      VIDEO_FACE_SWAP_FEATURE,
    ),
  );
}

/** Never rewrite the service's message: a safety refusal names the filter that fired. */
export function jobFailedError(error?: string | null): Error {
  return new Error(error || VIDEO_FACE_SWAP_MESSAGES.jobFailed);
}

export function timeoutError(): Error {
  return new Error(VIDEO_FACE_SWAP_MESSAGES.timeout);
}
