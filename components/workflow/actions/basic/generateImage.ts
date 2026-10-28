import type { Asset, GenImageRequest, GenResult } from "@dogclaw-ad/workflow";
import { createMediaJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { brandOnJobs } from "@/lib/media/defaultBrand";
import {
  DEFAULT_IMAGE_MODEL,
  FEATURES,
  MEDIA_JOB_TYPE_IMAGE,
  STOP_CANCEL,
} from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { watchJob } from "../../shared/jobStop";
import { unproxyImageInput } from "../../shared/mediaProxy";
import { resolveJobImageAssets } from "../../shared/response";

/** `params.runs` → the job's `n` (non-positive → one image). `applyBrandKit` is the rail
 *  switch: off posts `use_brand: false`, on posts `true` only when there is a default brand. */
export async function generateImage(
  req: GenImageRequest,
  workflowId?: string,
  track?: FlowJobTrack,
  applyBrandKit = true,
): Promise<GenResult> {
  const runsParam = Number(req.params?.runs);
  const runs =
    Number.isFinite(runsParam) && runsParam > 0 ? runsParam : undefined;

  // The BACKEND rewrite is the fallback: the editor enhances client-side first, then sends `false`.
  const isPromptEnhance = req.params?.isPromptEnhance === true;

  // Sent verbatim as `options.resolution`: media-ai checks the tier against the model.
  const resolution =
    typeof req.params?.resolution === "string"
      ? req.params.resolution.trim()
      : "";

  // Read BEFORE the stop check: awaited in the argument list, a press during it would still post.
  const useBrand = applyBrandKit ? (await brandOnJobs()) || undefined : false;
  req.signal?.throwIfAborted();
  const group = await createMediaJobGroup(
    req.prompt,
    undefined,
    req.model || DEFAULT_IMAGE_MODEL,
    // The backend fetches these server-side and needs the real R2 url.
    (req.references || []).map(unproxyImageInput),
    MEDIA_JOB_TYPE_IMAGE,
    runs,
    req.params?.aspectRatio as string | undefined,
    workflowId,
    isPromptEnhance,
    undefined,
    undefined,
    undefined,
    track?.target,
    undefined, // aspectExplicit — the node's ratio field is not a chat pill
    undefined, // intentOptions — the intent gate is a chat-surface retry
    undefined, // style — the node has no Style pill
    resolution || undefined,
    useBrand,
  );
  track?.onCreated?.(group.jobIds, group.groupId);

  // `asset` only satisfies a stale `.d.ts`; the runtime reads `assets`.
  const assets = await watchJob(
    req.signal,
    () => cancelJobGroup(group.groupId, STOP_CANCEL),
    (signal) => resolveJobImageAssets(group.jobId, FEATURES.image, signal),
  );
  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
