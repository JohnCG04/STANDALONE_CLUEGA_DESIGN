import type { Asset, FaceSwapRequest, GenResult } from "@dogclaw-ad/workflow";
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
import type { FaceRect } from "@/resources/app/pages/app/components/SuggestionPills/options/faceDetect/api";
import type { FlowJobTarget, FlowJobTrack } from "../../shared/types";
import { toJobInputUrl, unproxyImageInput } from "../../shared/mediaProxy";
import { MEDIA_JOB_TYPE_IMAGE, STOP_CANCEL } from "../../shared/constants";
import { delay } from "@/lib/delay";
import {
  assertPubliclyFetchable,
  toImageAssets,
} from "../../shared/helpers";
import { watchJob } from "../../shared/jobStop";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { readCreatedJobId } from "../../shared/response";
import {
  FACE_SWAP_FEATURE,
  FACE_SWAP_OPERATION,
  MAX_CONSECUTIVE_ERRORS,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
} from "./constants";
import {
  buildFaceSwapOptions,
  pickedTargetFaces,
  resolveLargestFace,
} from "./helpers";
import { FACE_SWAP_MESSAGES, FACE_SWAP_WARNINGS } from "./messages";
import { jobFailedError, timeoutError } from "./response";
import type { FaceSwapOptions } from "./types";

export async function createFaceSwapJob(
  targetUrl: string,
  sourceUrl: string,
  options: FaceSwapOptions,
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
      type: MEDIA_JOB_TYPE_IMAGE,
      prompt: "",
      input_files: [targetUrl, sourceUrl],
      style: null,
      operation: FACE_SWAP_OPERATION,
      options,
      ...(workflowId ? { workflow_id: workflowId } : {}),
      ...(flow ?? {}),
    }),
  });

  return readCreatedJobId(response, FACE_SWAP_FEATURE);
}

/** A near-twin of `pollJobImageUrls` (same budget and cadence) with the swap-specific wording. */
export async function pollFaceSwapUrls(
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
      return job.result ? outputUrlsFromResult(job.result) : [];
    }
    if (status === "failed") throw jobFailedError(job.error);
    if (isStoppedJobStatus(status)) return stoppedJobUrls(jobId, job);

    if (Date.now() - startedAt > POLL_BUDGET_MS) throw timeoutError();
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** Swap a face; rects (picked, else the largest detected) make the service COMPOSITE, not rewrite.
 *  A detect failure throws: the whole-image path would look like a broken swap. */
export async function swapFace(
  req: FaceSwapRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // Both images are fetched server-side. Folded `transforms` aren't applied there yet.
  const target = req.target?.url
    ? toJobInputUrl(unproxyImageInput(req.target).url)
    : undefined;
  const source = req.source?.url
    ? toJobInputUrl(unproxyImageInput(req.source).url)
    : undefined;
  if (!target) throw new Error(FACE_SWAP_MESSAGES.noTarget);
  if (!source) throw new Error(FACE_SWAP_MESSAGES.noSource);

  // Checked before the detect call, which this would otherwise burn first.
  assertPubliclyFetchable([target, source], FACE_SWAP_FEATURE);

  let targetFaces: FaceRect[] = [];
  let sourceFace: FaceRect | null = null;
  if (req.composite !== false) {
    const picked = pickedTargetFaces(req.targetFaces, target);

    // The TARGET's detect is skipped when the user picked: it could only disagree with them.
    const [detectedTarget, detectedSource] = await Promise.all([
      picked.length ? null : resolveLargestFace(target),
      resolveLargestFace(source),
    ]);

    targetFaces = picked.length ? picked : detectedTarget ? [detectedTarget] : [];
    sourceFace = detectedSource;

    if (targetFaces.length === 0) {
      throw new Error(FACE_SWAP_MESSAGES.noTargetFace);
    }
    // Not fatal: the service falls back to the whole source as the identity crop.
    if (!sourceFace) console.warn(FACE_SWAP_WARNINGS.noSourceFace);
  }

  const options = buildFaceSwapOptions(req, targetFaces, sourceFace);
  // After the detect, which a stop may have outlasted; never inside the create.
  req.signal?.throwIfAborted();
  const jobId = await createFaceSwapJob(
    target,
    source,
    options,
    workflowId,
    track?.target,
  );
  track?.onCreated?.([jobId], jobId);

  const urls = await watchJob(
    req.signal,
    () => cancelJobGroup(jobId, STOP_CANCEL),
    (signal) => pollFaceSwapUrls(jobId, signal),
  );
  if (urls.length === 0) {
    throw new Error(MEDIA_JOB_MESSAGES.noImageUrl(FACE_SWAP_FEATURE));
  }

  // One image per run — the node has no carousel.
  const [asset] = toImageAssets(urls.slice(0, 1));
  return { asset, assets: [asset] } as GenResult & { assets: Asset[] };
}
