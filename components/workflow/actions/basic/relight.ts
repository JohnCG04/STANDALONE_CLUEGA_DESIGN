import type { Asset, GenResult, RelightRequest } from "@dogclaw-ad/workflow";
import { createMediaJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import {
  DEFAULT_IMAGE_MODEL,
  FEATURES,
  MEDIA_JOB_TYPE_IMAGE,
  STOP_CANCEL,
} from "../../shared/constants";
import { runCount } from "../../shared/helpers";
import type { FlowJobTrack } from "../../shared/types";
import { watchJob } from "../../shared/jobStop";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { resolveJobImageAssets } from "../../shared/response";
import { normalizeRelightLights, relightPrompt, text } from "./helpers";

const NO_SOURCE = "Relight received no source image.";

/** Relight `[0]`, optionally matching the lighting of `[1]`; the rig goes out as prose.
 *  `DEFAULT_IMAGE_MODEL`: the node's `Relight` badge is a route label, not a catalog model id. */
export async function relight(
  req: RelightRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // The backend fetches these server-side, so hand it urls IT can reach.
  const source = req.image?.url ? toJobInputUrl(req.image.url) : undefined;
  if (!source) throw new Error(NO_SOURCE);
  const lightSource = req.lightSource?.url
    ? toJobInputUrl(req.lightSource.url)
    : undefined;

  const lights = normalizeRelightLights(req);
  const prompt = relightPrompt(req, lights, Boolean(lightSource));

  req.signal?.throwIfAborted();
  const group = await createMediaJobGroup(
    prompt,
    undefined,
    DEFAULT_IMAGE_MODEL,
    lightSource ? [source, lightSource] : [source],
    MEDIA_JOB_TYPE_IMAGE,
    runCount(req.params?.runs),
    text(req.params?.aspectRatio),
    workflowId,
    // The rig IS the prompt: a backend rewrite would reword the lighting placed by hand.
    undefined,
    undefined, // skills
    undefined, // creative
    undefined, // locale
    track?.target,
    undefined, // aspectExplicit — the node has no ratio pill
    undefined, // intentOptions
    undefined, // style
    text(req.params?.resolution),
  );
  track?.onCreated?.(group.jobIds, group.groupId);

  const assets = await watchJob(
    req.signal,
    () => cancelJobGroup(group.groupId, STOP_CANCEL),
    (signal) => resolveJobImageAssets(group.jobId, FEATURES.relight, signal),
  );
  return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
}
