import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import {
  MEDIA_JOB_TYPE_IMAGE,
  REMOVE_BACKGROUND_OPERATION,
  REMOVE_BACKGROUND_OPTIONS,
  DESIGN_LAYERS_OPERATION,
} from "./constants";
import type { FlowJobTarget } from "./types";
import { MEDIA_JOB_MESSAGES } from "./messages";
import { readCreatedJobId } from "./response";

/** A deterministic image OPERATION: NO top-level `model`, which the backend would read as the
 *  session model and reject. `flow` rides at the TOP LEVEL: inside `options` it would 422. */
async function createOperationJob(
  feature: string,
  operation: string,
  options: Record<string, unknown>,
  inputFileUrl: string,
  workflowId?: string,
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
      input_files: [inputFileUrl],
      style: null,
      operation,
      options,
      ...(workflowId ? { workflow_id: workflowId } : {}),
      ...(flow ?? {}),
    }),
  });

  return readCreatedJobId(response, feature);
}

export function createRemoveBackgroundJob(
  inputFileUrl: string,
  workflowId?: string,
  flow?: FlowJobTarget,
): Promise<string> {
  return createOperationJob(
    "Remove Background",
    REMOVE_BACKGROUND_OPERATION,
    REMOVE_BACKGROUND_OPTIONS,
    inputFileUrl,
    workflowId,
    flow,
  );
}

export function createDesignLayersJob(
  inputFileUrl: string,
  workflowId?: string,
  flow?: FlowJobTarget,
): Promise<string> {
  return createOperationJob(
    "Magic Layer",
    DESIGN_LAYERS_OPERATION,
    {},
    inputFileUrl,
    workflowId,
    flow,
  );
}
