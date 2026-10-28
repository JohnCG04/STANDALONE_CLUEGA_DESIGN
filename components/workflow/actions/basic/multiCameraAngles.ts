import type {
  Asset,
  GenResult,
  MultiCameraAnglesRequest,
} from "@dogclaw-ad/workflow";
import { createMediaJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import {
  DEFAULT_IMAGE_MODEL,
  FEATURES,
  MEDIA_JOB_TYPE_IMAGE,
  STOP_CANCEL,
} from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { watchJob } from "../../shared/jobStop";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { resolveJobImageAssets } from "../../shared/response";

const NO_SOURCE = "Multiple Camera Angles received no source image.";

/** Re-shoot ONE image from a new angle. POST /jobs is prompt-driven (`params` angles unused) and
 *  has no `negative_prompt`, so it folds in as an "Avoid:" clause, as `createVideoJob` does. */
export async function multiCameraAngles(
  req: MultiCameraAnglesRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  const source = req.image?.url ? toJobInputUrl(req.image.url) : undefined;
  if (!source) throw new Error(NO_SOURCE);

  const negativePrompt = req.negativePrompt?.trim();
  const prompt = negativePrompt
    ? `${req.prompt}\n\nAvoid: ${negativePrompt}`
    : req.prompt;

  req.signal?.throwIfAborted();
  const group = await createMediaJobGroup(
    prompt,
    undefined,
    DEFAULT_IMAGE_MODEL,
    [source],
    MEDIA_JOB_TYPE_IMAGE,
    undefined, // one re-shot image per angle; the node has no variant count
    req.params?.aspectRatio as string | undefined,
    workflowId,
    undefined,
    undefined,
    undefined,
    undefined,
    track?.target,
  );
  track?.onCreated?.(group.jobIds, group.groupId);

  const assets = await watchJob(
    req.signal,
    () => cancelJobGroup(group.groupId, STOP_CANCEL),
    (signal) => resolveJobImageAssets(group.jobId, FEATURES.cameraAngles, signal),
  );
  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
