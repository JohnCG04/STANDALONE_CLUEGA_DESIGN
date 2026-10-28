import { isAbortError } from "../shared/jobStop";
import { DEFAULT_CONCURRENCY, RUN_INPUTS_KEY } from "./constants";
import { str } from "./helpers";
import type { NodeOutcome, RunGraphDeps, RunGraphResult } from "./types";

/** How a node that ran says it ended — read off the status its flow wrote. */
function settledOutcome(data: Record<string, unknown> | undefined): NodeOutcome {
  const status = str(data?.status);
  if (status === "error") return "failed";
  if (status === "stopped") return "stopped";
  return "ran";
}

/** One render, which is when React Flow drains its batch. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });

/** Whether a node's ending is committed — a result, an error, or a stop. */
function isVisible(data: Record<string, unknown> | undefined): boolean {
  return isFinished(data) || settledOutcome(data) !== "ran";
}

/** In flight, as the editor counts it (`loading` dispatched, `queued` at the host). */
function isWorking(data: Record<string, unknown> | undefined): boolean {
  const status = str(data?.status);
  return status === "loading" || status === "queued";
}

/**
 * The run order narrowed to `only`, kept in graph order; `undefined` means the whole graph.
 * An automatic run names its cards so it does not start every unfinished card on the canvas.
 */
export function narrowStages(
  stages: readonly (readonly string[])[],
  only?: readonly string[],
): string[][] {
  if (!only) return stages.map((stage) => [...stage]);
  const wanted = new Set(only);
  return stages
    .map((stage) => stage.filter((id) => wanted.has(id)))
    .filter((stage) => stage.length > 0);
}


/** Whether a node already holds a result, and so has nothing left to do. */
export function isFinished(
  data: Record<string, unknown> | undefined,
): boolean {
  if (!data) return false;
  if (str(data.status) === "error") return false;
  const result = data.result as
    | { url?: unknown; urls?: unknown[] }
    | null
    | undefined;
  if (!result) return false;
  return Boolean(str(result.url)) || (Array.isArray(result.urls) && result.urls.length > 0);
}

/**
 * Walk `stages`: finished nodes are skipped unless their inputs moved, a failure skips only its
 * descendants, and a stop is not a failure. Never throws for a node that fails.
 */
export async function runGraph(deps: RunGraphDeps): Promise<RunGraphResult> {
  const {
    graph,
    stages,
    upstream,
    runNode,
    signal,
    onStageSettled,
    fingerprint,
    onBlocked,
    tick = nextFrame,
    settleTimeoutMs = 3_000,
    concurrency = DEFAULT_CONCURRENCY,
  } = deps;
  // 0 or negative means "no limit", the only reading that cannot deadlock a run.
  const limit = concurrency > 0 ? concurrency : Number.MAX_SAFE_INTEGER;
  const outcomes = new Map<string, NodeOutcome>();
  // The failed node a skipped one traces back to; a node skipped by a stop has none.
  const failedRoot = new Map<string, string>();
  const ranWith = new Map<string, string>();
  let aborted = false;

  /** An upstream that produced nothing makes this node unrunnable. */
  const blocked = (id: string): boolean =>
    (upstream.get(id) ?? []).some((from) => {
      const o = outcomes.get(from);
      return o === "failed" || o === "stopped" || o === "skipped-upstream";
    });

  const rootOf = (id: string): string | undefined => {
    for (const from of upstream.get(id) ?? []) {
      if (outcomes.get(from) === "failed") return from;
      const root = failedRoot.get(from);
      if (root) return root;
    }
    return undefined;
  };

  /** A result made before its inputs changed: an upstream re-ran, or the wiring holds new data. */
  const stale = (id: string, data: Record<string, unknown> | undefined): boolean => {
    if ((upstream.get(id) ?? []).some((from) => outcomes.get(from) === "ran")) return true;
    const saved = str(data?.[RUN_INPUTS_KEY]);
    return Boolean(saved && fingerprint && saved !== fingerprint(id));
  };

  for (const [index, stage] of stages.entries()) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }

    // Decided before anything runs, so a node skipped here never occupies a slot.
    const runnable: string[] = [];
    for (const id of stage) {
      if (blocked(id)) {
        outcomes.set(id, "skipped-upstream");
        const root = rootOf(id);
        if (root) failedRoot.set(id, root);
        continue;
      }
      const data = graph.getNode(id)?.data;
      if (isFinished(data) && !stale(id, data)) {
        outcomes.set(id, "skipped-done");
        continue;
      }
      runnable.push(id);
    }

    // `limit` workers on one queue: a worker that finishes early picks up the next id.
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (signal?.aborted) return;
        const id = runnable[next++];
        if (id === undefined) return;
        await runOne(id);
      }
    };

    const runOne = async (id: string): Promise<void> => {
      // Read before the run: these are the inputs its result will be made from.
      const key = fingerprint?.(id);
      if (key) ranWith.set(id, key);
      try {
        const supported = await runNode(id);
        // Settled after the run was stopped: the editor paused it with the rest.
        if (signal?.aborted) {
          outcomes.set(id, "stopped");
          return;
        }
        if (!supported) {
          // `false` is also the editor declining a node its card is already running.
          outcomes.set(
            id,
            isWorking(graph.getNode(id)?.data) ? "skipped-upstream" : "unsupported",
          );
          return;
        }
        // Read back rather than assume, so a flow that recorded an error is not a success.
        outcomes.set(id, settledOutcome(graph.getNode(id)?.data));
      } catch (err) {
        // The editor already reset a stopped node; writing an error would repaint it.
        if (signal?.aborted || isAbortError(err)) {
          outcomes.set(id, "stopped");
          return;
        }
        // A flow may throw before writing its own error, so record one here too.
        outcomes.set(id, "failed");
        graph.updateNodeData(id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // `allSettled`: one rejection must not discard siblings that finished.
    await Promise.allSettled(
      Array.from({ length: Math.min(limit, runnable.length) }, worker),
    );

    // Wait until the stage's writes are READABLE, or the next stage reads a graph without them.
    // Bounded: a flow whose wire was removed settles to idle with no result.
    const produced = stage.filter((id) => outcomes.get(id) === "ran");
    if (produced.length) {
      const deadline = Date.now() + settleTimeoutMs;
      while (
        Date.now() < deadline &&
        !signal?.aborted &&
        !produced.every((id) => isVisible(graph.getNode(id)?.data))
      ) {
        await tick();
      }
    }
    // Re-read endings: a status written as the flow settled can trail its promise by a render.
    for (const id of produced) {
      const settled = settledOutcome(graph.getNode(id)?.data);
      if (settled !== "ran") outcomes.set(id, settled);
      else if (ranWith.has(id)) graph.updateNodeData(id, { [RUN_INPUTS_KEY]: ranWith.get(id) });
    }

    await onStageSettled?.(index);
  }

  // Nodes never reached (the run stopped first) read as not run, not as failed.
  for (const stage of stages) {
    for (const id of stage) {
      if (!outcomes.has(id)) outcomes.set(id, "skipped-upstream");
    }
  }

  const order = stages.flat();
  const pick = (...want: NodeOutcome[]) =>
    order.filter((id) => want.includes(outcomes.get(id)!));
  const wasAborted = aborted || signal?.aborted === true;
  // After a stop nothing is "blocked": the user paused it, and a red card would say otherwise.
  const blockedIds = wasAborted
    ? []
    : order.filter((id) => outcomes.get(id) === "skipped-upstream" && failedRoot.has(id));
  for (const id of blockedIds) onBlocked?.(id, failedRoot.get(id)!);

  return {
    outcomes,
    // Also when the stop landed inside the last stage, which no boundary saw.
    aborted: wasAborted,
    ran: pick("ran"),
    failed: pick("failed"),
    stopped: pick("stopped"),
    skipped: pick("skipped-done", "skipped-upstream", "unsupported"),
    blocked: blockedIds,
  };
}

/** `target -> sources`, the shape {@link runGraph} reads dependencies from. */
export function upstreamMap(
  edges: readonly { source: string; target: string }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    const list = map.get(e.target);
    if (list) list.push(e.source);
    else map.set(e.target, [e.source]);
  }
  return map;
}
