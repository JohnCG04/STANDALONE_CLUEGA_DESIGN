"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { WorkflowRun, WorkflowRunsConfig } from "@dogclaw-ad/workflow";

import {
  FlowApiError,
  isTerminalFlowJobStatus,
  syncPageJobs,
  type FlowJob,
  type FlowJobKind,
  type FlowJobStatus,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { runIdForSubmit } from "../../executor/helpers";
import type { ActiveRun } from "../../executor/types";
import type { FlowJobTrack } from "../../shared/types";
import { toProxiedMediaUrl } from "../../shared/mediaProxy";
import { FLUSH_DEBOUNCE_MS } from "../constants";
import { pruneForFlush, runStatusOf, stopRows, toWrite } from "../helpers";
import type { FlowJobsLedger } from "../types";

const noopLedger: FlowJobsLedger = {
  enabled: false,
  adopt: () => {},
  beginSubmit: () => undefined,
  completeSubmit: () => {},
  stopSubmit: () => {},
  markStopped: () => {},
  markApplied: () => {},
  discard: () => {},
  resumable: [],
  noteStatus: () => {},
  runsConfig: undefined,
};

/**
 * The per-page job ledger, a local mirror of `GET/PUT …/pages/:id/jobs`; the server owns `status`
 * and `outputs`. A transport error never terminal-izes a job: a timeout means *unknown*.
 */
export function useFlowJobs(opts: {
  projectId?: string;
  pageId?: string | null;
  /** The graph run in progress (`useRunGraph` fills it); a ref so `beginSubmit` stays stable. */
  activeRun?: RefObject<ActiveRun | null>;
}): FlowJobsLedger {
  const { projectId, pageId, activeRun } = opts;
  const enabled = Boolean(projectId && pageId);

  // The ref is the source of truth; the state copy only re-renders `resumable`/`runsConfig`.
  const rowsRef = useRef<Map<string, FlowJob>>(new Map());
  const [rows, setRows] = useState<ReadonlyMap<string, FlowJob>>(new Map());
  // Rehydrated rows (from adopt()) the watcher and Runs panel own; the editor tracks live ones.
  const foreignRef = useRef<Set<string>>(new Set());
  // Highest seq handed out per node, so two rapid submits can't collide before a row exists.
  const seqRef = useRef<Map<string, number>>(new Map());
  const createdByTrack = useRef(new WeakMap<FlowJobTrack, string[]>());
  // Paused submits: a batch's 202 landing AFTER the stop must be born stopped, not queued.
  const stoppedTracks = useRef(new WeakSet<FlowJobTrack>());

  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);
  const pendingSync = useRef(false);
  // A 404 from the ledger route can't heal within this visit, so flushing stops.
  const routeGone = useRef(false);

  // Reset everything when the page under the ledger changes.
  const scopeKey = `${projectId ?? ""}:${pageId ?? ""}`;
  const [adoptedScope, setAdoptedScope] = useState(scopeKey);
  if (adoptedScope !== scopeKey) {
    setAdoptedScope(scopeKey);
    rowsRef.current = new Map();
    foreignRef.current = new Set();
    seqRef.current = new Map();
    routeGone.current = false;
    setRows(new Map());
  }

  const publish = useCallback(() => {
    setRows(new Map(rowsRef.current));
  }, []);

  const runSync = useCallback(async () => {
    if (!projectId || !pageId || routeGone.current) return;
    if (syncing.current) {
      pendingSync.current = true;
      return;
    }
    syncing.current = true;
    try {
      // Rows born mid-flight survive the response; known rows it dropped must not resurrect.
      const knownAtSend = new Set(rowsRef.current.keys());
      const pruned = pruneForFlush([...rowsRef.current.values()]);
      const canonical = await syncPageJobs(
        projectId,
        pageId,
        pruned.map(toWrite),
      );
      // The response is the truth; rows born while the PUT was in flight go back on top.
      const next = new Map(canonical.map((job) => [job.job_id, job]));
      for (const [id, job] of rowsRef.current) {
        if (!next.has(id) && !knownAtSend.has(id)) next.set(id, job);
      }
      rowsRef.current = next;
      publish();
    } catch (err) {
      // Keep local state for the next flush; the ledger is bookkeeping, never a user-facing error.
      if (err instanceof FlowApiError && err.status === 404) {
        routeGone.current = true;
      }
      console.error("[workflow] flow-jobs sync failed", err);
    } finally {
      syncing.current = false;
      if (pendingSync.current) {
        pendingSync.current = false;
        void runSync();
      }
    }
  }, [projectId, pageId, publish]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void runSync();
    }, FLUSH_DEBOUNCE_MS);
  }, [runSync]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

  const adopt = useCallback(
    (adopted: FlowJob[]) => {
      const next = new Map(adopted.map((job) => [job.job_id, job]));
      // Live rows recorded before the read landed survive the replace.
      for (const [id, job] of rowsRef.current) {
        if (!next.has(id)) next.set(id, job);
      }
      rowsRef.current = next;
      foreignRef.current = new Set(adopted.map((job) => job.job_id));
      publish();
    },
    [publish],
  );

  const beginSubmit = useCallback(
    (nodeId: string | undefined, kind: FlowJobKind) => {
      if (!enabled || !nodeId || !pageId) return undefined;

      let maxSeq = seqRef.current.get(nodeId) ?? -1;
      for (const job of rowsRef.current.values()) {
        if (job.node_id === nodeId && job.seq > maxSeq) maxSeq = job.seq;
      }
      const seq = maxSeq + 1;
      seqRef.current.set(nodeId, seq);

      let groupId: string | undefined;
      const created: string[] = [];
      const track: FlowJobTrack = {
        target: {
          page_id: pageId,
          node_id: nodeId,
          seq,
          workflow_run_id: runIdForSubmit(activeRun?.current, nodeId),
        },
        // May fire several times per submit; every id lands under one seq and the FIRST group id.
        onCreated: (jobIds, gid) => {
          groupId ??= gid;
          created.push(...jobIds);
          const stopped = stoppedTracks.current.has(track);
          for (const id of jobIds) {
            rowsRef.current.set(id, {
              job_id: id,
              group_id: groupId,
              node_id: nodeId,
              seq,
              kind,
              status: stopped ? "stopped" : "queued",
            });
          }
          publish();
          if (stopped) scheduleFlush();
        },
      };
      createdByTrack.current.set(track, created);
      return track;
    },
    [activeRun, enabled, pageId, publish, scheduleFlush],
  );

  const completeSubmit = useCallback(
    (track: FlowJobTrack | undefined) => {
      if (!track) return;
      const ids = createdByTrack.current.get(track);
      if (!ids?.length) return;
      const appliedAt = new Date().toISOString();
      for (const id of ids) {
        const job = rowsRef.current.get(id);
        if (!job) continue;
        rowsRef.current.set(id, {
          ...job,
          status: "succeeded",
          applied_at: job.applied_at ?? appliedAt,
        });
      }
      publish();
      scheduleFlush();
    },
    [publish, scheduleFlush],
  );

  const stopSubmit = useCallback(
    (track: FlowJobTrack | undefined) => {
      if (!track) return;
      stoppedTracks.current.add(track);
      const ids = createdByTrack.current.get(track);
      if (!ids?.length || !stopRows(rowsRef.current, ids)) return;
      publish();
      scheduleFlush();
    },
    [publish, scheduleFlush],
  );

  const markStopped = useCallback(
    (jobIds: string[]) => {
      if (!stopRows(rowsRef.current, jobIds)) return;
      publish();
      scheduleFlush();
    },
    [publish, scheduleFlush],
  );

  const markApplied = useCallback(
    (jobIds: string[]) => {
      if (jobIds.length === 0) return;
      const appliedAt = new Date().toISOString();
      let touched = false;
      for (const id of jobIds) {
        const job = rowsRef.current.get(id);
        if (!job || job.applied_at) continue;
        rowsRef.current.set(id, { ...job, applied_at: appliedAt });
        touched = true;
      }
      if (!touched) return;
      publish();
      scheduleFlush();
    },
    [publish, scheduleFlush],
  );

  const discard = useCallback(
    (jobIds: string[]) => {
      let touched = false;
      for (const id of jobIds) {
        touched = rowsRef.current.delete(id) || touched;
        foreignRef.current.delete(id);
      }
      if (!touched) return;
      publish();
      scheduleFlush();
    },
    [publish, scheduleFlush],
  );

  const noteStatus = useCallback(
    (jobId: string, status: FlowJobStatus, error?: string) => {
      const job = rowsRef.current.get(jobId);
      if (!job || job.status === status) return;
      rowsRef.current.set(jobId, { ...job, status, ...(error ? { error } : {}) });
      publish();
    },
    [publish],
  );

  const resumable = useMemo(
    () =>
      [...rows.values()].filter(
        (job) =>
          foreignRef.current.has(job.job_id) &&
          !isTerminalFlowJobStatus(job.status),
      ),
    [rows],
  );

  const runsConfig = useMemo<WorkflowRunsConfig | undefined>(() => {
    if (!enabled) return undefined;
    const foreign = [...rows.values()]
      .filter((job) => foreignRef.current.has(job.job_id))
      .sort(
        (a, b) =>
          (Date.parse(b.created_at ?? "") || 0) -
          (Date.parse(a.created_at ?? "") || 0),
      );
    if (foreign.length === 0) return undefined;
    const runs: WorkflowRun[] = foreign.map((job) => {
      // A discarded stop kept nothing, so there is nothing to show either.
      const thumb = job.discarded ? undefined : job.outputs?.[0]?.url;
      return {
        id: job.job_id,
        label:
          job.kind === "video"
            ? "Video"
            : job.kind === "audio"
              ? "Audio"
              : "Image",
        status: runStatusOf(job),
        nodeId: job.node_id,
        kind: job.kind,
        ...(thumb
          ? {
              // Only a picture goes through the image proxy; it drops `Range`.
              thumbnailUrl:
                job.kind === "video" || job.kind === "audio"
                  ? thumb
                  : toProxiedMediaUrl(thumb),
            }
          : {}),
        ...(job.error ? { detail: job.error } : {}),
      };
    });
    return {
      runs,
      onClearRun: (run: WorkflowRun) => discard([run.id]),
    };
  }, [enabled, rows, discard]);

  return useMemo<FlowJobsLedger>(() => {
    if (!enabled) return noopLedger;
    return {
      enabled,
      adopt,
      beginSubmit,
      completeSubmit,
      stopSubmit,
      markStopped,
      markApplied,
      discard,
      resumable,
      noteStatus,
      runsConfig,
    };
  }, [
    enabled,
    adopt,
    beginSubmit,
    completeSubmit,
    stopSubmit,
    markStopped,
    markApplied,
    discard,
    resumable,
    noteStatus,
    runsConfig,
  ]);
}
