import type { FaceDetectRequest, FaceDetectResult } from "@dogclaw-ad/workflow";
import { detectFaces } from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";
import { toJobInputUrl, toProxiedMediaUrl } from "../../shared/mediaProxy";
import { FACE_DETECT_MESSAGES } from "./messages";
import { faceDetectErrorMessage } from "./response";

/** Detect faces in ONE image: a synchronous DATA answer, so no job to poll and no `workflow_id`. */
export async function detectFacesInImage(
  req: FaceDetectRequest,
): Promise<FaceDetectResult> {
  // EXACTLY ONE of image_url/artifact_id; an upload's id is CDP's, not media-ai's, so send the url.
  const source = req.image?.url ? toJobInputUrl(req.image.url) : undefined;
  if (!source) throw new Error(FACE_DETECT_MESSAGES.noSource);

  try {
    const result = await detectFaces({
      imageUrl: source,
      maxFaces: req.maxFaces,
    });

    return {
      ...result,
      // The boxes are relative to the frame the detector measured, so keep the node on it.
      source: result.source ? toProxiedMediaUrl(result.source) : undefined,
    };
  } catch (err) {
    // The node renders `err.message` verbatim, and that is a raw JSON envelope.
    throw new Error(faceDetectErrorMessage(err));
  }
}
