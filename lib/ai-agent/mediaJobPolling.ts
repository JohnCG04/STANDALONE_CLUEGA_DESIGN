/**
 * Poll one media-generation job to a terminal state.
 *
 * Interval-poll-with-terminal-stop, the same shape as
 * `lib/ai-agent/videoFixPolling.ts`, scoped to a single media job. Returns a
 * stop function; callers MUST call it when the session changes or the store
 * unmounts, or the interval leaks.
 *
 * Why the browser polls at all: `generate_media` hands back the job id and the
 * turn ENDS (an awaited job would hold the Redis session lock and the next
 * prompt would get `409 session_busy`). So the SSE stream is closed long before
 * the image exists, and this loop — not the stream — is what finishes the card.
 * It must therefore keep running after `done`.
 */

import { cdpFetchRaw } from "@/lib/cdp";
import {
  isTerminalMediaJobStatus,
  mergeMediaJobPoll,
  type MediaJobInfo,
  type MediaJobPoll,
} from "@/lib/ai-agent/mediaJob";

/**
 * Read this job out of the CDP-side mirror before polling media-ai.
 *
 * The mirror is the DURABLE record ("a returning user has the conversation, not
 * the ids"): media-ai's own job store can no longer answer for a job whose
 * record aged out or whose service restarted, and a 404 there is indistinguish-
 * able from a transient error to a poll loop — so a resumed card would pulse for
 * its whole budget and then time out on an image that finished yesterday.
 *
 * Returns the folded card, or the input untouched when the mirror has nothing to
 * say (it is best-effort: a mirror that is not wired must not break the card).
 */
export async function hydrateMediaJobFromHistory(
  info: MediaJobInfo,
  conversationId: string,
): Promise<MediaJobInfo> {
  if (!conversationId) return info;
  try {
    const { json } = await cdpFetchRaw("/api/v1/media/job-history", {
      auth: { kind: "auto" },
      searchParams: { conversation_id: conversationId },
    });
    const items = (json as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return info;
    const row = items.find(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && String((r as Record<string, unknown>).job_id ?? "") === info.jobId,
    );
    return row ? mergeMediaJobPoll(info, row as MediaJobPoll) : info;
  } catch {
    return info;
  }
}

const DEFAULT_INTERVAL_MS = 3000;

export type MediaJobPollCallbacks = {
  /** Every tick that changed something (progress, status, outputs). */
  onUpdate: (info: MediaJobInfo) => void;
  /** Succeeded / failed / stopped — the loop has already stopped itself. */
  onTerminal: (info: MediaJobInfo) => void;
  /** The poll budget ran out with the job still in flight. */
  onTimeout: (info: MediaJobInfo) => void;
};

type MediaJobPollOptions = {
  intervalMs?: number;
  fetchStatus?: (pollPath: string) => Promise<MediaJobPoll>;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
};

/**
 * One status read.
 *
 * `cdpFetchRaw` (not a bare fetch) because a 30-60s image and a multi-minute
 * video both outlive an access token, and it refreshes on 401 and retries. The
 * media routes are NOT the CDP envelope, so the parsed body is read directly.
 */
async function fetchJobStatus(pollPath: string): Promise<MediaJobPoll> {
  const { json } = await cdpFetchRaw(pollPath, { auth: { kind: "auto" } });
  return (json ?? {}) as MediaJobPoll;
}

export function pollMediaJob(
  initial: MediaJobInfo,
  callbacks: MediaJobPollCallbacks,
  options: MediaJobPollOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetchStatus = options.fetchStatus ?? fetchJobStatus;
  const setIntervalImpl = options.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;

  // Budget in ticks, derived from the producer's per-kind seconds so the FE
  // holds no per-kind number of its own (images and video differ by minutes).
  const maxAttempts = Math.max(1, Math.ceil((initial.pollBudgetSec * 1000) / intervalMs));

  let info = initial;
  let attempts = 0;
  let stopped = false;
  let handle: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    stopped = true;
    if (handle !== null) {
      clearIntervalImpl(handle);
      handle = null;
    }
  };

  const tick = async () => {
    if (stopped) return;
    attempts += 1;

    let poll: MediaJobPoll | null = null;
    try {
      poll = await fetchStatus(info.pollPath);
    } catch {
      // A transient non-2xx is not an answer about the job. Keep polling — only
      // a real terminal status or the budget stops this loop. (The picker card
      // learned the same thing: a single 502 mid-render must not read as
      // "generation failed".)
      poll = null;
    }

    if (poll) {
      const next = mergeMediaJobPoll(info, poll);
      const changed =
        next.status !== info.status ||
        next.progress !== info.progress ||
        next.outputUrls.length !== info.outputUrls.length ||
        next.error !== info.error;
      info = next;
      if (changed) callbacks.onUpdate(info);
      if (isTerminalMediaJobStatus(info.status)) {
        stop();
        callbacks.onTerminal(info);
        return;
      }
    }

    if (attempts >= maxAttempts) {
      stop();
      callbacks.onTimeout(info);
    }
  };

  handle = setIntervalImpl(() => {
    void tick();
  }, intervalMs);

  return stop;
}

/** How a job cancel is sent. Every field is off by default — the chat's plain cancel. */
export interface MediaJobCancelOptions {
  signal?: AbortSignal;
  /**
   * `?discard_outputs=true`: the job is still billed, but nothing it made is
   * kept. The response's own `discard_outputs` says whether it was honoured.
   */
  discardOutputs?: boolean;
  /** Let the request outlive the page — a Stop pressed just before a tab close. */
  keepalive?: boolean;
}

/**
 * Ask media-ai to stop a job (`POST /jobs/{id}/cancel`, proxied by the CDP
 * backend's `/jobs/*rest` route). The card does not assume it worked: the next
 * poll is what reports `stopped`, so a cancel that loses a race with a finishing
 * render still shows the truth.
 */
export async function cancelMediaJob(
  jobId: string,
  { signal, discardOutputs, keepalive }: MediaJobCancelOptions = {},
): Promise<void> {
  await cdpFetchRaw(`/api/v1/media/jobs/${encodeURIComponent(jobId)}/cancel`, {
    auth: { kind: "auto" },
    method: "POST",
    signal,
    keepalive,
    ...(discardOutputs ? { searchParams: { discard_outputs: true } } : {}),
  });
}
