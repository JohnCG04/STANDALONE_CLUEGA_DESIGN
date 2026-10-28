"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import type { WorkflowGraphApi } from "@dogclaw-ad/workflow";

import {
  JobPollTimeoutError,
  JobStoppedError,
  pollJobImageResult,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { pollJobVideoUrl } from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobVideoUrl";
import { delay } from "@/lib/delay";
import { notifyGeneratedAssets } from "../../shared/generatedAssets";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { GRAPH_API_POLL_MS, GRAPH_API_WAIT_MS, RESUMED_FEATURE } from "../constants";
import { promptOf, toGenResult } from "../helpers";
import type { FlowJobsLedger, FlowJobWatcher } from "../types";

async function waitForGraphApi(
  ref: MutableRefObject<WorkflowGraphApi | null>,
  signal: AbortSignal,
): Promise<WorkflowGraphApi | null> {
  const deadline = Date.now() + GRAPH_API_WAIT_MS;
  while (!ref.current && Date.now() < deadline) {
    await delay(GRAPH_API_POLL_MS, signal);
  }
  return ref.current;
}

/**
 * Resume polling the rehydrated `queued`/`running` jobs and draw landed results onto their nodes.
 * A poll timeout or transport error means *unknown*, never `failed`: the next page open resumes.
 */
export function useFlowJobWatcher(opts: {
  ledger: FlowJobsLedger;
  graphApi: MutableRefObject<WorkflowGraphApi | null>;
  /** The page under watch (`project:page`); changing it aborts every poll. */
  scope: string;
}): FlowJobWatcher {
  const { ledger, graphApi, scope } = opts;
  const { resumable, markApplied, discard, noteStatus } = ledger;

  // One controller per job, kept across effect re-runs so a ledger publish restarts no poll.
  const watching = useRef(new Map<string, AbortController>());

  useEffect(() => {
    for (const job of resumable) {
      if (watching.current.has(job.job_id)) continue;
      const controller = new AbortController();
      watching.current.set(job.job_id, controller);

      void (async () => {
        const { signal } = controller;
        try {
          let urls: string[] | null;
          let reason = "";
          if (job.kind === "video") {
            const url = await pollJobVideoUrl(job.job_id, signal);
            urls = url ? [url] : null;
          } else {
            const settled = await pollJobImageResult(job.job_id, signal);
            urls = settled.urls;
            reason = settled.reason;
          }

          // Video's poller returns `null` on an exhausted budget: unknown, as a poll timeout.
          if (urls === null) return;

          if (urls.length === 0) {
            // Succeeded with no artifact: fail the card, as an open tab would show it.
            noteStatus(job.job_id, "failed");
            const failed = await waitForGraphApi(graphApi, signal);
            failed?.failNode(
              job.node_id,
              reason
                ? MEDIA_JOB_MESSAGES.noImageUrlBecause(RESUMED_FEATURE, reason)
                : MEDIA_JOB_MESSAGES.noImageUrl(RESUMED_FEATURE),
            );
            discard([job.job_id]);
            return;
          }

          noteStatus(job.job_id, "succeeded");
          // The asset exists even if its node is gone, so the Assets panel hears first.
          notifyGeneratedAssets();
          const api = await waitForGraphApi(graphApi, signal);
          if (!api) return;

          if (api.applyResult(job.node_id, toGenResult(urls, job.kind), promptOf(job))) {
            // The editor's autosave persists the node write; the ledger records the drawing.
            markApplied([job.job_id]);
          } else {
            // The node was deleted mid-render: dropping the terminal row deletes it on next flush.
            discard([job.job_id]);
          }
        } catch (err) {
          if (signal.aborted) return;
          if (err instanceof JobPollTimeoutError) return; // unknown ≠ failed
          if (err instanceof JobStoppedError) {
            noteStatus(job.job_id, "stopped");
            return;
          }
          const message =
            err instanceof Error ? err.message : "generation failed";
          // Failure and transport blip throw alike: drop the row, never write `failed` (rule 2).
          const api = graphApi.current;
          if (api?.hasNode(job.node_id)) api.failNode(job.node_id, message);
          discard([job.job_id]);
        } finally {
          // Only this watch's own entry: a stopped job may be watched again.
          if (watching.current.get(job.job_id) === controller) {
            watching.current.delete(job.job_id);
          }
        }
      })();
    }
  }, [resumable, markApplied, discard, noteStatus, graphApi]);

  // Abort everything when the page under watch changes or the editor goes away.
  useEffect(() => {
    const map = watching.current;
    return () => {
      for (const controller of map.values()) controller.abort();
      map.clear();
    };
  }, [scope]);

  const stop = useCallback((jobId: string) => {
    watching.current.get(jobId)?.abort();
    watching.current.delete(jobId);
  }, []);

  return useMemo(() => ({ stop }), [stop]);
}
