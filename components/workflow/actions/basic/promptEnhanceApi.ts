import {
  isFatalPollError,
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { fetchJobStatus } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { waitForPollSlot } from "@/resources/app/pages/app/components/Conversation/apis/stream/jobPollPacer";
import {
  isStoppedJobStatus,
  JobStoppedError,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { cancelMediaJob } from "@/lib/ai-agent/mediaJobPolling";
import { delay } from "@/lib/delay";
import { STOP_CANCEL } from "../../shared/constants";
import { watchJob } from "../../shared/jobStop";
import { PROMPT_ENHANCE_MESSAGES } from "../../shared/messages";
import { MAX_ERRORS, POLL_BUDGET_MS, POLL_INTERVAL_MS } from "./constants";
import type { ClonePreviewResult } from "./types";

/** `null` when the job succeeds without text or the budget runs out. */
async function pollJobPromptText(
  jobId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;

  for (;;) {
    // Shared pacing across every job poller — see jobPollPacer.
    await waitForPollSlot(signal);
    let job: Awaited<ReturnType<typeof fetchJobStatus>>;
    try {
      job = await fetchJobStatus(jobId, signal);
      consecutiveErrors = 0;
    } catch (err) {
      // Abort or a dead session is terminal; a transient auth error is not.
      if (isFatalPollError(err) || ++consecutiveErrors >= MAX_ERRORS) {
        throw err;
      }
      if (Date.now() - startedAt > POLL_BUDGET_MS) return null;
      await delay(POLL_INTERVAL_MS, signal);
      continue;
    }

    const status = job.status ?? "";
    if (status === "succeeded") {
      // `content`/`reply` carry a status blurb, not the prompt — read only `text`.
      return job.result?.text?.trim() || null;
    }
    if (status === "failed") {
      throw new Error(job.error || PROMPT_ENHANCE_MESSAGES.jobFailed);
    }
    if (isStoppedJobStatus(status)) {
      // A stop that kept its text still answered; a discarded one is a stop.
      const text = job.discarded ? "" : job.result?.text?.trim();
      if (text) return text;
      throw new JobStoppedError(jobId);
    }

    if (Date.now() - startedAt > POLL_BUDGET_MS) return null;
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/** Prompt enhancement via the ASYNC `POST /chat` (`{ job_id }`, text on `result.text`). `signal`
 *  stops the WAIT, never the create: an aborted create can orphan a job nobody knows the id of. */
export async function rewritePromptViaChat(
  args: {
    prompt: string;
    model?: string;
    style?: string;
    inputFiles?: string[];
    workflowId?: string;
  },
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const response = await mediaFetch(`${mediaBaseUrl()}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: args.prompt }],
      input_files: args.inputFiles ?? [],
      ...(args.style ? { style: args.style } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.workflowId ? { workflow_id: args.workflowId } : {}),
    }),
  });

  if (!response.ok) throw new Error(await response.text());

  const created = (await response.json()) as {
    job_id?: string;
    jobID?: string;
  };
  const jobId = created.job_id ?? created.jobID;
  if (!jobId) throw new Error(PROMPT_ENHANCE_MESSAGES.missingJobId);

  const enriched = await watchJob(
    signal,
    () => cancelMediaJob(jobId, STOP_CANCEL),
    (s) => pollJobPromptText(jobId, s),
  );
  if (!enriched) throw new Error(PROMPT_ENHANCE_MESSAGES.noText);
  return enriched;
}

/** A prompt that recreates `reference_artifact_id`; the endpoint needs `product_id` OR
 *  `product_description`. */
export async function clonePreviewImagePrompt(
  args: {
    referenceArtifactId: string;
    productDescription: string;
    productImageArtifactId?: string;
    styleOverrides?: Record<string, string>;
    toolPreference?: string;
  },
  signal?: AbortSignal,
): Promise<ClonePreviewResult> {
  const response = await mediaFetch(
    `${mediaBaseUrl()}/image-projects/clone/preview`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reference_artifact_id: args.referenceArtifactId,
        product_description: args.productDescription,
        ...(args.productImageArtifactId
          ? { product_image_artifact_id: args.productImageArtifactId }
          : {}),
        ...(args.styleOverrides ? { style_overrides: args.styleOverrides } : {}),
        ...(args.toolPreference ? { tool_preference: args.toolPreference } : {}),
      }),
      signal,
    },
  );

  if (!response.ok) throw new Error(await response.text());

  return response.json() as Promise<ClonePreviewResult>;
}
