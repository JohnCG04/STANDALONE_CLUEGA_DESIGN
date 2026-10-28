import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";

export type FaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedFace = {
  index: number;
  label: string | null;
  /** 0..1 fractions of the image, top-left origin. */
  normalizedRect: FaceRect;
  pixelRect: FaceRect;
};

export type FacesDetectResponse = {
  width: number;
  height: number;
  source: string;
  model: string;
  latency_ms: number;
  faces: DetectedFace[];
};

export type FacesDetectInput =
  | { imageUrl: string; maxFaces?: number }
  | { artifactId: string; maxFaces?: number };

export class FacesDetectError extends Error {
  constructor(
    public status: number,
    detail?: string,
  ) {
    super(detail || `faces_detect_${status}`);
    this.name = "FacesDetectError";
  }
}

/**
 * POST /api/v1/media/faces/detect — the backend requires EXACTLY ONE of
 * image_url / artifact_id. Note: ids returned by the artifact upload are
 * CDP-hosted file ids, not media-ai artifact-store ids, so uploaded images
 * must be sent by their public `url` (image_url), not by id.
 */
export async function detectFaces(
  input: FacesDetectInput,
): Promise<FacesDetectResponse> {
  const body: Record<string, unknown> =
    "imageUrl" in input
      ? { image_url: input.imageUrl }
      : { artifact_id: input.artifactId };
  if (input.maxFaces != null) body.max_faces = input.maxFaces;

  const res = await mediaFetch(`${mediaBaseUrl()}/faces/detect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new FacesDetectError(res.status, detail);
  }

  return (await res.json()) as FacesDetectResponse;
}

export type FaceDetectErrorKey =
  | "badImage"
  | "artifactNotFound"
  | "invalidRequest"
  | "modelFailed"
  | "serviceUnavailable"
  | "generic";

export const faceDetectErrorKey = (status: number): FaceDetectErrorKey => {
  switch (status) {
    case 400:
      return "badImage";
    case 404:
      return "artifactNotFound";
    case 422:
      return "invalidRequest";
    case 502:
      return "modelFailed";
    case 503:
      return "serviceUnavailable";
    default:
      return "generic";
  }
};
