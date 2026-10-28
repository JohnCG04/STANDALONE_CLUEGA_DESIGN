import type { Asset } from "@dogclaw-ad/workflow";
import {
  JobPollTimeoutError,
  pollJobImageResult,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { JOB_ACCEPTED_STATUS } from "./constants";
import { toImageAssets } from "./helpers";
import { MEDIA_JOB_MESSAGES } from "./messages";

/** The gateway's reason for a rejected job: `detail` as string or as a list. */
export async function readJobError(
  res: Response,
  feature: string,
): Promise<string> {
  const raw = await res.text().catch(() => "");

  try {
    const body = JSON.parse(raw) as {
      detail?: string | { loc?: unknown[]; msg?: string }[];
    };
    if (typeof body.detail === "string") return body.detail;

    const first = Array.isArray(body.detail) ? body.detail[0] : undefined;
    if (first?.msg) {
      const path = (first.loc ?? [])
        .filter((p) => typeof p === "string" && p !== "body")
        .join(".");
      return path ? `${path}: ${first.msg}` : first.msg;
    }
  } catch {
    /* Not JSON — fall through to the raw text, which is all we have. */
  }

  return raw || MEDIA_JOB_MESSAGES.rejected(feature, res.status);
}

/** The job id, or the rejection's real reason. */
export async function readCreatedJobId(
  res: Response,
  feature: string,
): Promise<string> {
  if (res.status !== JOB_ACCEPTED_STATUS) {
    throw new Error(await readJobError(res, feature));
  }

  const payload = (await res.json()) as { job_id?: string; jobID?: string };
  const jobId = payload.job_id ?? payload.jobID;
  if (!jobId) throw new Error(MEDIA_JOB_MESSAGES.missingJobId);
  return jobId;
}

/** An empty result throws, flipping the node to error. A poll TIMEOUT says the job is still
 *  running; a STOP (abort, `JobStoppedError`) passes through untouched, as it is not a failure. */
export async function resolveJobImageAssets(
  jobId: string,
  feature: string,
  signal?: AbortSignal,
): Promise<Asset[]> {
  let urls: string[];
  let reason = "";
  try {
    ({ urls, reason } = await pollJobImageResult(jobId, signal));
  } catch (err) {
    if (err instanceof JobPollTimeoutError) {
      throw new Error(MEDIA_JOB_MESSAGES.stillRunning(feature, err.budgetMs));
    }
    throw err;
  }

  if (urls.length === 0) {
    // An empty job almost always said why; the generic sentence alone would bury that reason.
    throw new Error(
      reason
        ? MEDIA_JOB_MESSAGES.noImageUrlBecause(feature, reason)
        : MEDIA_JOB_MESSAGES.noImageUrl(feature),
    );
  }
  return toImageAssets(urls);
}
