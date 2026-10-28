import type { DubCapabilities, DubVideoRequest, DubVoice, GenResult } from "@dogclaw-ad/workflow";
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
import type { FlowJobTrack } from "../../shared/types";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { toJobInputUrl, unproxyImageInput } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import {
  DUB_DISABLED,
  DUB_FEATURE,
  MAX_CONSECUTIVE_ERRORS,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
} from "./constants";
import { DUB_MESSAGES } from "./messages";
import { jobFailedError, readCreatedDubJobId, timeoutError } from "./response";
import { dubRequestBody, dubResultAsset } from "./helpers";

/** POST /avatars/dub with ONE target language, wrapped in the one-element `targets` array. */
export async function createDubJob(
  videoUrl: string,
  req: DubVideoRequest,
  workflowId = "",
  flowTarget?: Record<string, unknown>,
): Promise<string> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);

  // Fresh key when the node sent none: a payload-derived one collides with the failed attempt.
  const response = await mediaFetch(`${baseUrl}/avatars/dub`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": req.idempotencyKey ?? globalThis.crypto.randomUUID() },
    body: JSON.stringify(dubRequestBody(videoUrl, req, workflowId, flowTarget)),
  });

  return readCreatedDubJobId(response);
}

export async function getDubCapabilities(): Promise<DubCapabilities> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);
  const response = await mediaFetch(`${baseUrl}/avatars/dub/capabilities`);
  // 404 = dub is off here, not a failure; thrown, it would read as "model unavailable".
  if (response.status === 404) return DUB_DISABLED;
  if (!response.ok) throw new Error(`Dub capabilities request failed (${response.status})`);
  return await response.json() as DubCapabilities;
}

export async function listDubVoices(language: string): Promise<DubVoice[]> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(MEDIA_JOB_MESSAGES.notConfigured);
  const response = await mediaFetch(`${baseUrl}/avatars/dub/voices?language=${encodeURIComponent(language)}`);
  if (!response.ok) throw new Error(`Dub voices request failed (${response.status})`);
  const payload = await response.json() as { voices?: DubVoice[] };
  return Array.isArray(payload.voices) ? payload.voices : [];
}

/** A near-twin of `pollVideoFaceSwapUrls` with a shorter budget: a dub does no re-render. */
export async function pollDubUrl(
  jobId: string,
  signal?: AbortSignal,
): Promise<{ urls: string[]; fileIds: string[]; metadata?: Record<string, unknown> }> {
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
      if (Date.now() - startedAt > POLL_BUDGET_MS) throw timeoutError();
      await delay(POLL_INTERVAL_MS, signal);
      continue;
    }

    const status = job.status ?? "";
    if (status === "succeeded") {
      return job.result ? {
        urls: outputUrlsFromResult(job.result).map(resolveVideoUrl),
        fileIds: Array.isArray(job.result.output_file_ids) ? job.result.output_file_ids : [],
        metadata: job.result.metadata,
      } : { urls: [], fileIds: [] };
    }
    if (status === "failed" || status === "stopped") {
      throw jobFailedError(job.error ?? status, job.error_code);
    }

    if (Date.now() - startedAt > POLL_BUDGET_MS) throw timeoutError();
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** Translate a clip's speech and dub it back in (transcribe/translate/TTS + mux, no re-render).
 *  `req.video.transforms` are not applied server-side. */
export async function dubVideo(
  req: DubVideoRequest,
  workflowId = "",
  track?: FlowJobTrack,
): Promise<GenResult> {
  const video = req.video?.url
    ? toJobInputUrl(unproxyImageInput(req.video).url)
    : undefined;
  if (!video) throw new Error(DUB_MESSAGES.noVideo);
  if (!req.targetLanguage) throw new Error(DUB_MESSAGES.noLanguage);

  // Before the submit: an in-browser bake (Trim/Combine) hands out blob: urls media-ai can't fetch.
  assertPubliclyFetchable([video], DUB_FEATURE);

  const jobId = await createDubJob(video, req, workflowId, track?.target as unknown as Record<string, unknown> | undefined);
  track?.onCreated?.([jobId], jobId);

  const output = await pollDubUrl(jobId, req.signal);
  if (output.urls.length === 0) throw new Error(DUB_MESSAGES.noVideoUrl);

  // One clip per run, unproxied like `generateVideo`'s: the media proxy path is image-only.
  const asset = dubResultAsset({ output_file_ids: output.fileIds, metadata: output.metadata }, output.urls, req.pipelineVersion);
  return { asset, assets: [asset] } as GenResult;
}
