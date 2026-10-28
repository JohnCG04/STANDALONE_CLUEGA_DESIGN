import type { Asset, GenResult, RemoveBackgroundRequest } from "@dogclaw-ad/workflow";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { FEATURES, STOP_CANCEL } from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { watchJob } from "../../shared/jobStop";
import { createRemoveBackgroundJob } from "../../shared/mediaJob";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { resolveJobImageAssets } from "../../shared/response";

const NO_SOURCE = "Remove Background received no source image.";

/** A deterministic OPERATION, so `createRemoveBackgroundJob` rather than `createMediaJob`.
 *  Folded `transforms` aren't applied server-side yet. */
export async function removeBackground(
  req: RemoveBackgroundRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // The backend fetches the source server-side, so hand it a url IT can reach.
  const source = req.image?.url ? toJobInputUrl(req.image.url) : undefined;
  if (!source) throw new Error(NO_SOURCE);

  req.signal?.throwIfAborted();
  const jobId = await createRemoveBackgroundJob(source, workflowId, track?.target);
  track?.onCreated?.([jobId], jobId);
  const assets = await watchJob(
    req.signal,
    () => cancelJobGroup(jobId, STOP_CANCEL),
    (signal) => resolveJobImageAssets(jobId, FEATURES.removeBackground, signal),
  );
  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
