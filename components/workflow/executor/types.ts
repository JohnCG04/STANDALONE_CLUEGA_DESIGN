import type { FlowJobsLedger } from "../jobs/types";
import type { WorkflowGraphApi } from "../shared/workflowCompat";

export type NodeData = Record<string, unknown>;

/**
 * A graph run in progress: every card in `nodes` submits under `id` (`workflow_run_id`), so the
 * Library shows the run as one batch. A card clicked by hand meanwhile is its own run.
 */
export interface ActiveRun {
  id: string;
  nodes: ReadonlySet<string>;
}

export interface FingerprintGraph {
  getNode(id: string): { type?: string; data?: NodeData } | undefined;
}

export interface FingerprintEdge {
  source: string;
  target: string;
  targetHandle?: string | null;
}

/** The graph reads/writes a run needs — satisfied by `useReactFlow()`. */
export interface GraphAccess {
  getNode(id: string):
    | { type?: string; data?: Record<string, unknown> }
    | undefined;
  updateNodeData(id: string, data: Record<string, unknown>): void;
}

export interface RunGraphDeps {
  graph: GraphAccess;
  /** `stages[i]` may run together; every upstream sits in an earlier stage. */
  stages: string[][];
  /** Who depends on whom, as `target -> sources`. */
  upstream: Map<string, string[]>;
  /** `false` = no headless flow yet, not a failure; a stop rejects or leaves it `stopped`. */
  runNode(id: string): Promise<boolean>;
  signal?: AbortSignal;
  /** One render (default): `updateNodeData` lands a render later than `getNode` reads. */
  tick?(): Promise<void>;
  /** Per-stage in-flight cap: past its slots a provider fails a call rather than queueing it. */
  concurrency?: number;
  /** How long to wait for a stage's writes to become readable. */
  settleTimeoutMs?: number;
  /** Called after every stage settles, for an autosave that survives a stop. */
  onStageSettled?(stageIndex: number): void | Promise<void>;
  /** The key of what is wired into a node now; saved after its run, compared on the next. */
  fingerprint?(id: string): string;
  /** A node that could not run because `failedId` upstream failed — not called after a stop. */
  onBlocked?(id: string, failedId: string): void;
}

export type NodeOutcome =
  | "ran"
  | "skipped-done"
  | "skipped-upstream"
  | "unsupported"
  | "failed"
  | "stopped";

export interface RunGraphResult {
  outcomes: Map<string, NodeOutcome>;
  aborted: boolean;
  /** Convenience views over `outcomes`, in stage order. */
  ran: string[];
  failed: string[];
  stopped: string[];
  skipped: string[];
  /** Skipped because an upstream FAILED (a subset of `skipped`; a stop blocks nothing here). */
  blocked: string[];
}

/** Cancel one job. Injected so a test never reaches the network. */
export type CancelJob = (jobId: string) => Promise<void>;

/** Every media-ai job this session has live, so Stop can cancel it. */
export interface LiveJobs {
  /** Record ids as a submit reports them (`FlowJobTrack.onCreated`). */
  remember(jobIds: readonly string[]): void;
  /** Drop ids that settled on their own — a cancel afterwards is noise. */
  forget(jobIds: readonly string[]): void;
  /** Cancel everything live and clear the list; never rejects, a lost race answers 404/409. */
  cancelAll(): Promise<{ cancelled: string[]; failed: string[] }>;
  /** What is live right now, in the order it was submitted. */
  readonly ids: string[];
}

/** The submit methods alone: identity-stable, while the ledger object changes per row update. */
export type JobSubmitter = Pick<
  FlowJobsLedger,
  "beginSubmit" | "completeSubmit" | "stopSubmit"
>;

export interface UseRunGraph {
  /** Run the whole graph, or only `opts.only`; resolves with what ran, failed, stopped, skipped. */
  run(opts?: RunOptions): Promise<RunGraphResult>;
  /** Pause the nodes in flight, start no new stage, and cancel every job this session has live. */
  stop(): void;
  running: boolean;
}

export interface UseRunGraphOptions {
  /** A ref: the editor hands the handle out on mount and clears it on unmount. */
  graphApi: React.RefObject<WorkflowGraphApi | null>;
  /** Absent means only the local half of a stop happens; pass it wherever a ledger exists. */
  liveJobs?: LiveJobs;
  /** Autosave here, so a run stopped mid-way keeps its finished stages on the server. */
  onStageSettled?(stageIndex: number): void | Promise<void>;
  /** Filled while a graph run is in progress, so the job ledger files its jobs under that run. */
  activeRun?: React.RefObject<ActiveRun | null>;
}

/** What one run covers. */
export interface RunOptions {
  /** Run only these ids, in graph order; absent means the whole graph (the Run button). */
  only?: readonly string[];
}
