"use client";

import { useCallback, useRef, useState } from "react";
import { translateStatic } from "@/hooks/useTranslate";
import { describeWorkflowIO } from "../../shared/workflowCompat";

import { newRunId } from "../helpers";
import { inputFingerprint } from "../inputFingerprint";
import { narrowStages, runGraph, upstreamMap } from "../runGraph";
import type { ActiveRun, RunOptions, UseRunGraph, UseRunGraphOptions } from "../types";

/**
 * Wire {@link runGraph} to the live editor through `WorkflowGraphApi`, not `useReactFlow()`:
 * React Flow's provider lives inside `<WorkflowEditor>`, so this host would be outside it.
 */
export function useRunGraph({
  graphApi,
  liveJobs,
  onStageSettled,
  activeRun,
}: UseRunGraphOptions): UseRunGraph {
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    // Fire-and-forget: `cancelAll` never rejects, and the UI must not wait on the network.
    void liveJobs?.cancelAll();
  }, [liveJobs]);

  const run = useCallback(async (opts?: RunOptions) => {
    const api = graphApi.current;
    if (!api) {
      throw new Error("The editor is not ready yet. Please try again.");
    }

    const ac = new AbortController();
    controller.current = ac;
    setRunning(true);
    let named: ActiveRun | null = null;
    try {
      const nodes = api.getNodes();
      const edges = api.getEdges();

      const io = describeWorkflowIO({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          config: n.data,
          parent_group: n.parentId,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          source_handle: e.sourceHandle ?? undefined,
          target_handle: e.targetHandle ?? undefined,
        })),
      });

      // The editor refuses to draw a cycle, but a hand-edited or imported document can carry one.
      if (io.cyclic) {
        throw new Error(
          "This workflow contains a loop and cannot be run. Remove the circular connection and try again.",
        );
      }

      const stages = narrowStages(io.stages, opts?.only);
      if (activeRun) {
        named = { id: newRunId(), nodes: new Set(stages.flat()) };
        activeRun.current = named;
      }

      const graph = {
        getNode: (id: string) => api.getNode(id),
        updateNodeData: (id: string, patch: Record<string, unknown>) =>
          api.updateNodeData(id, patch),
      };
      return await runGraph({
        graph,
        stages,
        upstream: upstreamMap(edges),
        runNode: (id) => api.runNode(id, { signal: ac.signal }),
        signal: ac.signal,
        onStageSettled,
        // The wiring is fixed for the run; what flows through it is read when each node starts.
        fingerprint: (id) => inputFingerprint(id, graph, edges),
        // Said on the card, so a blocked step reads as blocked rather than as never touched.
        onBlocked: (id, failedId) => {
          const failed = api.getNode(failedId);
          const name = String(failed?.data?.label ?? failed?.type ?? failedId);
          api.updateNodeData(id, {
            status: "error",
            error: translateStatic("appChat.flow.run.blocked").replace("{name}", name),
          });
        },
      });
    } finally {
      setRunning(false);
      controller.current = null;
      if (activeRun && named && activeRun.current === named) activeRun.current = null;
    }
  }, [activeRun, graphApi, onStageSettled]);

  return { run, stop, running };
}
