import type { GenResult, VideoFaceSwapRequest } from "@dogclaw-ad/workflow";
import {
  isFatalPollError,
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { fetchJobStatus } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { outputUrlsFromResult } from "@/resources/app/pages/app/components/Conversation/apis/fetch.api";
import { waitForPollSlot } from "@/resources/app/pages/app/components/Conversation/apis/stream/jobPollPacer";
import {
  isStoppedJobStatus,
  stoppedJobUrls,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { resolveVideoUrl } from "@/resources/app/pages/app/components/Conversation/apis/video.helper";
import { delay } from "@/lib/delay";
import type { FlowJobTarget, FlowJobTrack } from "../../shared/types";
import { MEDIA_JOB_TYPE_VIDEO, STOP_CANCEL, VIDEO_EDIT_OPERATION } from "../../shared/constants";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { watchJob } from "../../shared/jobStop";
import { toJobInputUrl, unproxyImageInput } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { readCreatedJobId } from "../../shared/response";
import {
  FACE_SWAP_EDIT_AXIS,
  MAX_CONSECUTIVE_ERRORS,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
  VIDEO_FACE_SWAP_FEATURE,
} from "./constants";
import { VIDEO_FACE_SWAP_MESSAGES } from "./messages";
import {
  jobFailedError,
  timeoutError,
  videoFaceSwapSubmitError,
} from "./response";
import { faceTargetJobOptions, sourceFaceJobOptions } from "./helpers";
import type { VideoFaceSwapJobOptions } from "./types";

export async function createVideoFaceSwapJob(
  videoUrl: string,
  faceUrl: string,
  options: VideoFaceSwapJobOptions,
  workflowId?: string,
  // Ledger seed, TOP-LEVEL: inside `options` it 422s (`extra="forbid"`). See FlowJobTarget.
  flow?: FlowJobTarget,
): Promise<string> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);

  const response = await mediaFetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: MEDIA_JOB_TYPE_VIDEO,
      // The lane swaps in its own template; the `options` axis is the opt-in, not wording.
      prompt: "",
      // Roles come from sniffed media KIND, not position; video first so the log reads in order.
      input_files: [videoUrl, faceUrl],
      style: null,
      operation: VIDEO_EDIT_OPERATION,
      options,
      ...(workflowId ? { workflow_id: workflowId } : {}),
      ...(flow ?? {}),
    }),
  });

  // Object `detail` gate bodies would render as raw JSON: map them before the shared reader.
  if (response.status !== 202) throw await videoFaceSwapSubmitError(response);
  return readCreatedJobId(response, VIDEO_FACE_SWAP_FEATURE);
}

/** A near-twin of `pollFaceSwapUrls` with the 15-minute video budget: the clip is re-rendered. */
export async function pollVideoFaceSwapUrls(
  jobId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;

  for (;;) {
    // Shared pacing: concurrent pollers interleave instead of bursting the gateway into a 429.
    await waitForPollSlot(signal);
    let job: Awaited<ReturnType<typeof fetchJobStatus>>;
    try {
      job = await fetchJobStatus(jobId, signal);
      consecutiveErrors = 0;
    } catch (err) {
      if (isFatalPollError(err) || ++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw err;
      }
      if (Date.now() - startedAt > POLL_BUDGET_MS) throw timeoutError();
      await delay(POLL_INTERVAL_MS, signal);
      continue;
    }

    const status = job.status ?? "";
    if (status === "succeeded") {
      // Result urls may be storage-relative — resolve like `pollJobVideoUrl`.
      return job.result
        ? outputUrlsFromResult(job.result).map(resolveVideoUrl)
        : [];
    }
    if (status === "failed") throw jobFailedError(job.error);
    if (isStoppedJobStatus(status)) {
      return stoppedJobUrls(jobId, job).map(resolveVideoUrl);
    }

    if (Date.now() - startedAt > POLL_BUDGET_MS) throw timeoutError();
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** Swap a video's face for a still's identity. Refuses without `consent: true` (media-ai 409s);
 *  `face_swap_target` rides up-front so the multi-face clarification never happens. */
export async function swapFaceVideo(
  req: VideoFaceSwapRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // Both inputs are fetched server-side. Folded `transforms` aren't applied there yet.
  const video = req.video?.url
    ? toJobInputUrl(unproxyImageInput(req.video).url)
    : undefined;
  const face = req.face?.url
    ? toJobInputUrl(unproxyImageInput(req.face).url)
    : undefined;
  if (!video) throw new Error(VIDEO_FACE_SWAP_MESSAGES.noVideo);
  if (!face) throw new Error(VIDEO_FACE_SWAP_MESSAGES.noFace);
  if (req.consent !== true) {
    throw new Error(VIDEO_FACE_SWAP_MESSAGES.noConsent);
  }

  // Before the submit: an in-browser bake (Trim/Combine) hands out blob: urls media-ai can't fetch.
  assertPubliclyFetchable([video, face], VIDEO_FACE_SWAP_FEATURE);

  req.signal?.throwIfAborted();
  const jobId = await createVideoFaceSwapJob(
    video,
    face,
    {
      edit_axis: FACE_SWAP_EDIT_AXIS,
      face_swap_consent: true,
      face_swap_target: req.faceSwapTarget === "all" ? "all" : "prominent",
      ...faceTargetJobOptions(req.faceTarget),
      ...sourceFaceJobOptions(req.sourceFace),
    },
    workflowId,
    track?.target,
  );
  track?.onCreated?.([jobId], jobId);

  const urls = await watchJob(
    req.signal,
    () => cancelJobGroup(jobId, STOP_CANCEL),
    (signal) => pollVideoFaceSwapUrls(jobId, signal),
  );
  if (urls.length === 0) {
    throw new Error(VIDEO_FACE_SWAP_MESSAGES.noVideoUrl);
  }

  // One clip per run, unproxied like `generateVideo`'s: the media proxy path is image-only.
  const asset = {
    id: globalThis.crypto?.randomUUID?.() ?? `video-face-swap-${Date.now()}`,
    url: urls[0],
    kind: "video" as const,
  };
  return { asset, assets: [asset] } as GenResult;
}
