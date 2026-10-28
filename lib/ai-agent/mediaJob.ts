/**
 * The media-generation job a chat turn started, as the chat surface holds it.
 *
 * Kept out of cluega-ai-client.ts on purpose: the reducer, the poller, the card
 * and the session-resume path all need this shape, and the client module is
 * already the largest file in the lane.
 *
 * The card outlives its turn. `generate_media` returns the job HANDLE in under a
 * second and the turn ends there (holding the turn open would keep the session
 * lock and answer the user's next prompt with `409 session_busy`), so everything
 * after "queued" arrives on a poll the browser owns — not on the SSE stream.
 */

/** Pipeline vocabulary from media-ai (`app/jobs/events.py:JobStatus`). */
export type MediaJobStatus = "queued" | "running" | "succeeded" | "failed" | "stopped";

export type MediaJobKind = "image" | "video";

export interface MediaJobInfo {
  jobId: string;
  /** Sibling group, for a group cancel. A solo job is its own group. */
  groupId: string;
  kind: MediaJobKind;
  status: MediaJobStatus;
  /** Deliverables asked for. Images render as variants inside this one job. */
  count: number;
  /** "1:1" | "16:9" | … or "" — media-ai derives it from the prompt itself. */
  aspect: string;
  /** The prompt as submitted, for the card caption. */
  prompt: string;
  /** Same-origin CDP path to poll. Producer-supplied so the FE owns no route. */
  pollPath: string;
  /** Seconds this kind is allotted before the FE stops polling. */
  pollBudgetSec: number;
  /** 0–100. Real and monotonic — derived by media-ai from the job's own event
   *  stream, never synthesized here. 0 means "not reported yet", not "0% done". */
  progress: number;
  /** Wall-clock estimate priced at submit; 0 when the job shape has none. */
  estimateSec: number;
  outputUrls: string[];
  /** Media-library artifact ids, aligned by index with outputUrls. */
  outputRefs: string[];
  error: string;
  /** Epoch ms this card first appeared, for the elapsed counter. */
  startedAt: number;
}

/** Statuses after which nothing more will change — stop polling. */
export function isTerminalMediaJobStatus(status: MediaJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "stopped";
}

/**
 * Map a raw status onto the five states the card renders.
 *
 * media-ai serves TWO vocabularies for one truth (`status` is the pipeline's,
 * `state` is the PRD's: generating/done) and both reach clients, so both are
 * accepted here rather than trusting whichever field a caller happened to read.
 *
 * An unrecognised value resolves to "running", i.e. keep polling: treating an
 * unknown as terminal would abandon a job that is still rendering and leave the
 * user with a permanently pulsing card. The poll budget bounds the cost of being
 * wrong; a wrong "terminal" has no such bound.
 */
export function normalizeMediaJobStatus(raw: unknown): MediaJobStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "succeeded" || value === "done") return "succeeded";
  if (value === "failed" || value === "error") return "failed";
  if (value === "stopped" || value === "cancelled" || value === "canceled") return "stopped";
  if (value === "queued" || value === "pending") return "queued";
  return "running";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v) : [];
}

function asKind(value: unknown): MediaJobKind {
  return String(value ?? "") === "video" ? "video" : "image";
}

/**
 * Parse a `media_job_started` payload (the producer sends it as a JSON string in
 * `content`, like `document_created`).
 *
 * Returns null without a job id: the id IS the card — there is nothing to poll,
 * cancel or upsert by without it, and a card stuck at "queued" forever is worse
 * than no card at all.
 */
export function parseMediaJobStarted(content: string, now = Date.now()): MediaJobInfo | null {
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
  const jobId = String(p.job_id ?? "");
  if (!jobId) return null;
  return {
    jobId,
    groupId: String(p.group_id ?? "") || jobId,
    kind: asKind(p.kind),
    status: normalizeMediaJobStatus(p.status ?? "queued"),
    count: typeof p.count === "number" && p.count > 0 ? p.count : 1,
    aspect: String(p.aspect ?? ""),
    prompt: String(p.prompt ?? ""),
    // Producer-supplied, but never blank in practice; the fallback keeps a card
    // pollable if an older producer omits it rather than wedging it at "queued".
    pollPath: String(p.poll_path ?? "") || `/api/v1/media/jobs/${jobId}`,
    pollBudgetSec:
      typeof p.poll_budget_sec === "number" && p.poll_budget_sec > 0 ? p.poll_budget_sec : 360,
    progress: 0,
    estimateSec: typeof p.estimate_sec === "number" && p.estimate_sec > 0 ? p.estimate_sec : 0,
    outputUrls: [],
    outputRefs: [],
    error: "",
    startedAt: now,
  };
}

/**
 * One job snapshot, as the card reads it.
 *
 * The same type serves the live poll (`GET /api/v1/media/jobs/{id}`) and the
 * CDP-side mirror row (`GET /api/v1/media/job-history`) because both carry the
 * PRD `outputs[]` shape. `result.output_urls` is the pipeline's older shape,
 * still served on the poll, and read as a fallback so neither source needs its
 * own parser.
 */
export type MediaJobPoll = {
  status?: unknown;
  state?: unknown;
  progress?: unknown;
  estimate_sec?: unknown;
  error?: unknown;
  outputs?: unknown;
  result?: { output_urls?: unknown; output_refs?: unknown } | null;
};

/** URLs and library ids from either output shape, aligned by index. */
function readOutputs(poll: MediaJobPoll): { urls: string[]; refs: string[] } {
  if (Array.isArray(poll.outputs) && poll.outputs.length) {
    const rows = poll.outputs.filter((o): o is Record<string, unknown> => !!o && typeof o === "object");
    const urls = rows.map((o) => String(o.url ?? "")).filter(Boolean);
    if (urls.length) return { urls, refs: rows.map((o) => String(o.id ?? "")) };
  }
  return {
    urls: asStringArray(poll.result?.output_urls),
    refs: asStringArray(poll.result?.output_refs),
  };
}

/**
 * Fold a status poll onto the card.
 *
 * Never walks backwards: progress is monotonic upstream and the outputs are
 * kept once seen, so a late poll that answers with an empty result (a replayed
 * event, a mirror that has not caught up) cannot blank a finished image.
 */
export function mergeMediaJobPoll(info: MediaJobInfo, poll: MediaJobPoll): MediaJobInfo {
  const status = normalizeMediaJobStatus(poll.status ?? poll.state ?? info.status);
  const { urls, refs } = readOutputs(poll);
  const progress = typeof poll.progress === "number" ? poll.progress : info.progress;
  const errorText = poll.error == null ? "" : String(poll.error);
  return {
    ...info,
    status,
    progress: Math.max(info.progress, Math.min(100, Math.max(0, progress))),
    estimateSec:
      typeof poll.estimate_sec === "number" && poll.estimate_sec > 0
        ? poll.estimate_sec
        : info.estimateSec,
    outputUrls: urls.length ? urls : info.outputUrls,
    outputRefs: refs.length ? refs : info.outputRefs,
    error: errorText || info.error,
  };
}

/**
 * Rebuild a card from one `/api/v1/media/job-history` row on session resume.
 *
 * The history row is the mirror the CDP backend keeps precisely for this — "a
 * returning user has the conversation, not the ids" — so it carries the final
 * status and outputs of a job whose SSE turn is long gone.
 */
export function mediaJobFromHistoryRow(row: Record<string, unknown>): MediaJobInfo | null {
  const jobId = String(row.job_id ?? "");
  if (!jobId) return null;
  const base = parseMediaJobStarted(
    JSON.stringify({
      job_id: jobId,
      kind: row.type ?? "image",
      status: row.status ?? "queued",
      estimate_sec: row.estimate_sec ?? 0,
    }),
    Date.parse(String(row.created_at ?? "")) || Date.now(),
  );
  return base ? mergeMediaJobPoll(base, row as MediaJobPoll) : null;
}
