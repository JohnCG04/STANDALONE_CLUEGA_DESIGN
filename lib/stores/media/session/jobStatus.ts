// One-shot job status read — "what actually happened to this job?"
//
// The fourth persistence-adjacent surface of a media session, and the one that
// answers the question a reload cannot answer on its own. `resume.ts` decides
// WHICH unfinished turns are worth chasing; the store live-streams the freshest
// few (each costs an SSE connection); everything else needs a single cheap read
// instead of being left spinning. That read is this module.
//
// Why one-shot rather than always re-attaching: the block stream replays a job's
// whole event buffer, which is exactly right for the turn the user is looking at
// and wasteful for five older ones. A status read is one request and tells us the
// three things a settle needs — did it finish, did it fail, is it still going.
//
// The media job client is loaded LAZILY, matching `lib/media-library/mediaJobs.ts`
// and for the same reason: `…/Conversation/apis/apis.ts` re-exports a type without
// `import type`, which the repo's `node --test` transpiler cannot resolve, so a
// static import would make this module — and anything importing it, including the
// store — unloadable in tests. Deferring it keeps `classifyJobStatus` testable as
// the pure function it is.

// A pure module with no transitive types, so a static import here is safe —
// the lazy rule above is about `…/Conversation/apis/apis.ts` specifically.
import { explainProviderFailure } from "@/lib/media/providerFailure";

/** What a single status read tells us about a turn. */
export type JobSettleOutcome =
  /** Finished. `mediaUrls` may be empty if the job produced no output refs. */
  | { kind: "done"; mediaUrls: string[] }
  /** Finished badly, or was cancelled. `message` is safe to show. */
  | { kind: "error"; message: string }
  /** Still queued or running on the service — leave the turn alone. */
  | { kind: "running" }
  /**
   * The service has no record of it. Its job store is in-memory with a TTL, so
   * this is what a job older than that window — or one whose service restarted —
   * looks like. NOT a failure: the generation may well have succeeded, we simply
   * cannot find out any more.
   */
  | { kind: "gone" }
  /** The read itself failed (offline, 5xx). Change nothing and try again later. */
  | { kind: "unknown" };

/**
 * The normalized snapshot `classifyJobStatus` reasons over, so the pure decision
 * is not entangled with the many shapes a media job result can take.
 */
export interface JobStatusSnapshot {
  status?: string;
  error?: string | null;
  mediaUrls?: string[];
}

export interface MediaJobStatusFetcher {
  /** Read a job's status once and say what it means for the turn. Never throws. */
  settle(jobId: string): Promise<JobSettleOutcome>;
}

/**
 * True when an error text means "the service has no such job" rather than "the
 * job failed".
 *
 * This is a string match because it is the only signal the transport leaves us:
 * `fetchJobStatus` collapses a non-2xx into `new Error(await response.text())`,
 * so the 404's body (FastAPI's `{"detail":"job <id> not found"}`) is all that
 * survives — and the SSE stream reports the same condition as an `error` FRAME
 * with HTTP 200, where there is no status code at all.
 *
 * Exported so the stream driver classifies it identically. Two matchers would
 * drift, and the consequence of drifting is telling a user their generation
 * failed when it did not.
 */
export function isJobGoneMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return /not\s*found/i.test(text) || /\b404\b/.test(text);
}

/** Longest upstream error text worth showing a user verbatim. */
const MAX_DISPLAYABLE_ERROR_LENGTH = 300;

/**
 * Reduce a raw transport error body to something a person can be shown.
 *
 * Every non-2xx on the media path collapses into `new Error(await
 * response.text())`, and that message is rendered as the turn's failure text
 * with no further processing. When the failing hop is not media-ai — a CDN
 * returning its own 502 page is the case users actually hit — that puts a
 * Cloudflare incident report, zone and ray id included, where the explanation
 * of their generation should be.
 *
 * The gateway also drops those bodies now; this is the second half of the same
 * fix, because the browser talks to more than one origin (the Next.js route
 * pipes to CDP, and either hop can fail on its own).
 *
 * Kept next to `isJobGoneMessage` deliberately: both inspect the same strings,
 * and a sanitizer that stripped the "not found" text the classifier matches on
 * would tell users a finished generation had failed.
 */
/**
 * media-ai error codes this surface has its own words for.
 *
 * `lane_queue_full` is the one refusal media-ai still answers a submission
 * with: it queues work when a lane is busy, so this means the wait list itself
 * overflowed. Saying "at capacity (32/32 jobs running)" — which is what the
 * raw body used to put in a chat bubble — describes the server's bookkeeping,
 * not anything the reader can act on.
 */
const MEDIA_ERROR_CODES: Record<string, string> = {
  lane_queue_full:
    "Too much is running right now, so this one wasn’t started. Nothing was charged — send it again in a moment.",
};

export function displayableErrorMessage(
  text: string | null | undefined,
  status?: number,
): string {
  const suffix = status ? ` (HTTP ${status})` : "";
  const generic = `The media service returned an unexpected response${suffix}.`;
  const trimmed = (text ?? "").trim();
  if (!trimmed) return generic;
  // Before anything else: a body this long and JSON-shaped would collapse into
  // the generic line below, and on dev that is exactly what buried "Model …
  // does not exist" — the one sentence that told the user what to do next.
  const explained = explainProviderFailure(trimmed);
  if (explained) return explained.message;
  // Markup is never a message.
  if (/^\s*</.test(trimmed) || /<\/?(html|head|body|div|title)\b/i.test(trimmed)) {
    return generic;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return trimmed.length > MAX_DISPLAYABLE_ERROR_LENGTH ? generic : trimmed;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return generic;
    const body = parsed as Record<string, unknown>;
    // media-ai names its own refusals with a token so a client can branch
    // without matching English. Read those BEFORE the edge-error heuristic
    // below, which treats any `error_code` as a CDN page — true of Cloudflare,
    // and now false of the one upstream whose errors we deliberately forward.
    const known = MEDIA_ERROR_CODES[String(body.error_code ?? "")];
    if (known) return known;
    // A CDN error page carries a "detail" of its own, so the shape has to be
    // recognised by what ELSE is in it, not by that one key.
    const isEdgeError =
      "cloudflare_error" in body ||
      "error_code" in body ||
      "error_name" in body ||
      "zone" in body;
    if (isEdgeError) return generic;
    const detail = body.detail ?? (body.error as Record<string, unknown> | undefined)?.message;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim().slice(0, MAX_DISPLAYABLE_ERROR_LENGTH);
    }
    return generic;
  }
  return trimmed.length > MAX_DISPLAYABLE_ERROR_LENGTH ? generic : trimmed;
}

/**
 * Decide what a status snapshot means for the turn.
 *
 * `stopped` is read by what it PRODUCED, not by the fact that it was cancelled.
 * media-ai keeps every artifact that finished before the stop landed and settles
 * the billing hold pro-rata for exactly those, so a cancelled job that delivered
 * two of three clips is a turn with two clips in it — folding it into `error`
 * (as this did) threw away media the user had already paid for. Only a stop that
 * beat the first output has nothing to show, and that one still reads as a
 * terminal non-result rather than a failure.
 */
export function classifyJobStatus(
  snapshot: JobStatusSnapshot | null | undefined,
): JobSettleOutcome {
  if (!snapshot) return { kind: "unknown" };

  switch ((snapshot.status || "").trim().toLowerCase()) {
    case "succeeded":
      return { kind: "done", mediaUrls: snapshot.mediaUrls ?? [] };
    case "failed":
      return {
        kind: "error",
        message: snapshot.error?.trim() || "The generation job failed.",
      };
    case "stopped":
    case "cancelled": {
      const mediaUrls = snapshot.mediaUrls ?? [];
      if (mediaUrls.length > 0) return { kind: "done", mediaUrls };
      return {
        kind: "error",
        message: snapshot.error?.trim() || "The generation was cancelled.",
      };
    }
    case "queued":
    case "running":
      return { kind: "running" };
    default:
      // An unrecognised status is NOT treated as terminal: we do not know that
      // the job stopped, and abandoning a live job is worse than checking again.
      return { kind: "unknown" };
  }
}

async function loadJobClient() {
  const [apis, fetchApi] = await Promise.all([
    import("@/resources/app/pages/app/components/Conversation/apis/apis"),
    import("@/resources/app/pages/app/components/Conversation/apis/fetch.api"),
  ]);
  return {
    fetchJobStatus: apis.fetchJobStatus,
    outputUrlsFromResult: fetchApi.outputUrlsFromResult,
  };
}

/**
 * The configured one-shot status reader.
 *
 * Best-effort like the sibling storage modules: every failure resolves to an
 * outcome rather than throwing, because a settle pass runs over several turns at
 * once and one unreachable job must not abort the rest.
 */
export function createMediaJobStatusFetcher(): MediaJobStatusFetcher {
  return {
    async settle(jobId: string): Promise<JobSettleOutcome> {
      if (!jobId) return { kind: "unknown" };
      try {
        const { fetchJobStatus, outputUrlsFromResult } = await loadJobClient();
        const raw = await fetchJobStatus(jobId);
        return classifyJobStatus({
          status: raw?.status,
          error: raw?.error,
          mediaUrls: raw?.result ? outputUrlsFromResult(raw.result) : [],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // A job the service has forgotten is not a failed job — see the type docs.
        return isJobGoneMessage(message) ? { kind: "gone" } : { kind: "unknown" };
      }
    },
  };
}
