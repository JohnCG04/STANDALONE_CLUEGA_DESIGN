import type { GenAudioRequest, GenResult } from "@dogclaw-ad/workflow";
import {
  mediaBaseUrl,
  mediaFetch,
  upstreamErrorMessage,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { throwIfInsufficientPoints } from "@/resources/app/pages/app/components/Conversation/apis/billing.api";
import {
  JobPollTimeoutError,
  pollJobImageResult,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import {
  FEATURES,
  JOB_ACCEPTED_STATUS,
  MEDIA_JOB_TYPE_AUDIO,
  STOP_CANCEL,
} from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { watchJob } from "../../shared/jobStop";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { audioOptions } from "./helpers";

/** `POST /jobs` `type: "audio"`, for every audio action (`./speechAudio` too). One track per job,
 *  so the job is its own group: the id Stop cancels. */
export async function submitAudioJob(
  body: Record<string, unknown>,
): Promise<{ jobId: string; groupId: string }> {
  const response = await mediaFetch(`${mediaBaseUrl()}/jobs`, {
    method: "POST",
    body: JSON.stringify({ type: MEDIA_JOB_TYPE_AUDIO, ...body }),
  });
  await throwIfInsufficientPoints(response);
  if (response.status !== JOB_ACCEPTED_STATUS) {
    throw new Error(await upstreamErrorMessage(response));
  }

  const payload = (await response.json()) as {
    job_id?: string;
    group_id?: string;
  };
  if (!payload.job_id) throw new Error(MEDIA_JOB_MESSAGES.missingJobId);
  return { jobId: payload.job_id, groupId: payload.group_id || payload.job_id };
}

/** The workflow page/node/seq ride top-level, as on every flow submit, to seed the job ledger. */
function createAudioJob(
  req: GenAudioRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<{ jobId: string; groupId: string }> {
  return submitAudioJob({
    prompt: req.prompt,
    // Empty means media-ai's own lane default, so an absent model is left out.
    ...(req.model ? { model: req.model } : {}),
    options: audioOptions(req),
    ...(workflowId ? { workflow_id: workflowId } : {}),
    ...(track?.target ?? {}),
  });
}

/** The finished track's url; a timeout says the job is still running, not that it failed. */
export async function resolveAudioUrl(
  jobId: string,
  signal?: AbortSignal,
  feature: string = FEATURES.audio,
): Promise<string> {
  try {
    const { urls } = await pollJobImageResult(jobId, signal);
    if (!urls[0]) throw new Error(MEDIA_JOB_MESSAGES.noAudio(feature));
    return urls[0];
  } catch (err) {
    if (err instanceof JobPollTimeoutError) {
      throw new Error(MEDIA_JOB_MESSAGES.stillRunning(feature, err.budgetMs));
    }
    throw err;
  }
}

/** Voice / Music / Sound Effects, routed by media-ai to the lane's model. Comes back as
 *  `kind: "video"` + audio MIME (no audio `AssetKind`), never image-proxied so it can seek. */
export async function generateAudio(
  req: GenAudioRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  req.signal?.throwIfAborted();
  const job = await createAudioJob(req, workflowId, track);
  track?.onCreated?.([job.jobId], job.groupId);

  const url = await watchJob(
    req.signal,
    () => cancelJobGroup(job.groupId, STOP_CANCEL),
    (signal) => resolveAudioUrl(job.jobId, signal),
  );
  return {
    asset: {
      id: globalThis.crypto?.randomUUID?.() ?? `gen-audio-${job.jobId}`,
      url,
      kind: "video",
      // media-ai renders every lane to mp3.
      mimeType: "audio/mpeg",
    },
  };
}
