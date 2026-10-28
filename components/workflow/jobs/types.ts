import type { WorkflowRunsConfig } from "@dogclaw-ad/workflow";

import type {
  FlowDocument,
  FlowJob,
  FlowJobKind,
  FlowJobStatus,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import type { FlowJobTrack } from "../shared/types";

/** Mirror of the editor's `MediaHistoryEntry` in @dogclaw-ad/workflow. */
export interface HistoryEntry {
  id: string;
  url: string;
  assetId?: string;
  prompt: string;
  createdAt: number;
}

export interface ApplyJobsResult {
  /** The document with results folded in — the input object when nothing applied. */
  document: FlowDocument;
  /** Ledger rows that were drawn and should now have `applied_at` closed. */
  appliedJobIds: string[];
}

/** The page's job ledger as the host sees it; when off, every method is a no-op. */
export interface FlowJobsLedger {
  /** False for a legacy project without pages — there is no ledger to write. */
  enabled: boolean;
  /** Seed from a `GET …/jobs` read, replacing state; live rows become {@link resumable}. */
  adopt(rows: FlowJob[]): void;
  /** Open a submit on `nodeId` with the node's next `seq`; `undefined` when the ledger is off. */
  beginSubmit(
    nodeId: string | undefined,
    kind: FlowJobKind,
  ): FlowJobTrack | undefined;
  /** The submit resolved and its result is drawn: its jobs go succeeded + applied, flushed. */
  completeSubmit(track: FlowJobTrack | undefined): void;
  /** The user paused the submit: its rows, even one whose 202 lands later, end `stopped`. */
  stopSubmit(track: FlowJobTrack | undefined): void;
  /** A rehydrated row the user paused (`runs.onStopRun`): `stopped`, flushed. */
  markStopped(jobIds: string[]): void;
  /** Close `applied_at` on rows whose results are now in the graph document. */
  markApplied(jobIds: string[]): void;
  /** Drop rows: terminal ones go server-side on the next flush, live ones are kept (rule 2). */
  discard(jobIds: string[]): void;
  /** Rehydrated rows still `queued`/`running` — what the watcher resumes. */
  resumable: FlowJob[];
  /** Update a resumable row's local status (watcher bookkeeping only). */
  noteStatus(jobId: string, status: FlowJobStatus, error?: string): void;
  /** The editor's `runs` prop: rehydrated rows only, since the editor lists this session's. */
  runsConfig: WorkflowRunsConfig | undefined;
}

/** The watcher's handle, for the host's `runs.onStopRun`. */
export interface FlowJobWatcher {
  /** Stop polling one job now — the user paused it; its row is closed elsewhere. */
  stop(jobId: string): void;
}
