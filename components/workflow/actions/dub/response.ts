import { readJobError } from "../../shared/response";
import { DUB_FEATURE } from "./constants";
import { DUB_CODE_MESSAGES, DUB_MESSAGES } from "./messages";

/** A rejected submit as a sentence. The dub gates answer with an OBJECT `detail` the shared reader
 *  would dump as raw JSON; other shapes go to it via a reconstructed Response. */
export async function dubSubmitError(res: Response): Promise<Error> {
  const raw = await res.text().catch(() => "");

  try {
    const body = JSON.parse(raw) as {
      detail?: { code?: string; message?: string } | string | unknown[];
    };
    const detail = body.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      if (detail.code) {
        const msg = DUB_CODE_MESSAGES[detail.code];
        if (msg) return new Error(msg);
      }
      if (detail.message) return new Error(detail.message);
    }
  } catch {
    /* Not JSON — the shared reader's fallback handles it below. */
  }

  return new Error(
    await readJobError(new Response(raw, { status: res.status }), DUB_FEATURE),
  );
}

/** The ONE language's job id from `/avatars/dub`'s `{jobs: [{job_id, language}]}` body. */
export async function readCreatedDubJobId(res: Response): Promise<string> {
  if (res.status !== 202) throw await dubSubmitError(res);

  const payload = (await res.json()) as {
    jobs?: { job_id?: string; language?: string }[];
  };
  const jobId = payload.jobs?.[0]?.job_id;
  if (!jobId) throw new Error(DUB_MESSAGES.missingJobId);
  return jobId;
}

/** Mapped code copy beats the operator-facing message; an unmapped code keeps the service's
 *  message, since a safety refusal names the filter that fired. */
export function jobFailedError(error?: string | null, code?: string | null): Error {
  return new Error(
    (code ? DUB_CODE_MESSAGES[code] : "") || error || DUB_MESSAGES.jobFailed,
  );
}

export function timeoutError(): Error {
  return new Error(DUB_MESSAGES.timeout);
}
