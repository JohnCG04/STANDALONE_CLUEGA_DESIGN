import type { BurnCaptionsRequest, GenResult } from "@dogclaw-ad/workflow";
import {
  isFatalPollError,
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { fetchJobStatus } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { outputUrlsFromResult } from "@/resources/app/pages/app/components/Conversation/apis/fetch.api";
import { waitForPollSlot } from "@/resources/app/pages/app/components/Conversation/apis/stream/jobPollPacer";
import { resolveVideoUrl } from "@/resources/app/pages/app/components/Conversation/apis/video.helper";
import { delay } from "@/lib/delay";
import type { FlowJobTarget, FlowJobTrack } from "../../shared/types";
import { MEDIA_JOB_TYPE_VIDEO, VIDEO_EDIT_OPERATION } from "../../shared/constants";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { toJobInputUrl, unproxyImageInput } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { readCreatedJobId } from "../../shared/response";
import {
  CAPTIONS_EDIT_OP,
  CAPTIONS_FEATURE,
  MAX_CONSECUTIVE_ERRORS,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
} from "./constants";
import { CAPTIONS_MESSAGES } from "./messages";

/** Generic `video_edit` job with the captions axis; its errors are plain FastAPI shapes. */
export async function createCaptionsJob(
  videoUrl: string,
  req: BurnCaptionsRequest,
  workflowId?: string,
  flow?: FlowJobTarget,
): Promise<string> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);

  const response = await mediaFetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: MEDIA_JOB_TYPE_VIDEO,
      prompt: "",
      input_files: [videoUrl],
      style: null,
      operation: VIDEO_EDIT_OPERATION,
      options: {
        video_edit_op: CAPTIONS_EDIT_OP,
        caption_script: req.scriptText,
        ...(req.burnIn ? { caption_burn_in: true } : {}),
        ...(req.language ? { caption_language: req.language } : {}),
      },
      ...(workflowId ? { workflow_id: workflowId } : {}),
      ...(flow ?? {}),
    }),
  });

  return readCreatedJobId(response, CAPTIONS_FEATURE);
}

/** A near-twin of `pollVideoFaceSwapUrls` with the captions budget. */
export async function pollCaptionsUrl(
  jobId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;

  for (;;) {
    await waitForPollSlot(signal);
    let job: Awaited<ReturnType<typeof fetchJobStatus>>;
    try {
      job = await fetchJobStatus(jobId, signal);
      consecutiveErrors = 0;
    } catch (err) {
      if (isFatalPollError(err) || ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw err;
      }
      if (Date.now() - startedAt > POLL_BUDGET_MS) {
        throw new Error(CAPTIONS_MESSAGES.timeout);
      }
      await delay(POLL_INTERVAL_MS, signal);
      continue;
    }

    const status = job.status ?? "";
    if (status === "succeeded") {
      return job.result
        ? outputUrlsFromResult(job.result).map(resolveVideoUrl)
        : [];
    }
    if (status === "failed") {
      throw new Error(job.error || CAPTIONS_MESSAGES.jobFailed);
    }

    if (Date.now() - startedAt > POLL_BUDGET_MS) {
      throw new Error(CAPTIONS_MESSAGES.timeout);
    }
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** Write timed captions for a clip, optionally burned in. `req.video.transforms` aren't applied. */
export async function burnCaptions(
  req: BurnCaptionsRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  const video = req.video?.url
    ? toJobInputUrl(unproxyImageInput(req.video).url)
    : undefined;
  if (!video) throw new Error(CAPTIONS_MESSAGES.noVideo);
  if (!req.scriptText?.trim()) throw new Error(CAPTIONS_MESSAGES.noScript);

  assertPubliclyFetchable([video], CAPTIONS_FEATURE);

  const jobId = await createCaptionsJob(video, req, workflowId, track?.target);
  track?.onCreated?.([jobId], jobId);

  const urls = await pollCaptionsUrl(jobId);
  if (urls.length === 0) throw new Error(CAPTIONS_MESSAGES.noVideoUrl);

  const asset = {
    id: globalThis.crypto?.randomUUID?.() ?? `captions-${Date.now()}`,
    url: urls[0],
    kind: "video" as const,
  };
  return { asset, assets: [asset] } as GenResult;
}
