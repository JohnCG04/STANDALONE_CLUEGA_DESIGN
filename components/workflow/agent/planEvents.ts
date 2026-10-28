// Job events to panel chunks. The steps are made up here so a long plan does not look hung.

import { toAgentQuestions } from "./clarify";
import { DEFAULT_STEP_LABELS, STEP_IDS } from "./constants";
import { hasGraph, str } from "./helpers";
import type { JobEvent, PlanChunk, PlanStepLabels } from "./types";

/** Stateful: `plan_built` closes two steps and opens a third; `done` closes the last. */
export function createPlanEventMapper(
  labels: PlanStepLabels = DEFAULT_STEP_LABELS,
) {
  let opened = false;
  let settled = false;
  /** Whether the answer arrived a piece at a time while the graph was planned. */
  let streamedReply = false;

  /** Open the first two steps once, whatever the first event turns out to be. */
  function opening(): PlanChunk[] {
    if (opened) return [];
    opened = true;
    return [
      { type: "step", id: STEP_IDS.understand, label: labels.understand, status: "done" },
      { type: "step", id: STEP_IDS.plan, label: labels.plan, status: "running" },
    ];
  }

  return function map(event: JobEvent): PlanChunk[] {
    // Ignore events after a terminal one: a second `done` would re-apply the workflow.
    if (settled) return [];

    switch (event.type) {
      case "job_accepted":
        return opening();

      // The planner's first key, so the reply streams well before the graph lands.
      case "reply_delta": {
        // Not `str`: it trims, and a delta's whitespace is part of the sentence.
        const raw = event.data?.delta;
        const delta = typeof raw === "string" ? raw : "";
        if (!delta) return [];
        streamedReply = true;
        return [...opening(), { type: "text", delta }];
      }

      case "thinking": {
        const label = str(event.data?.label);
        return label ? [...opening(), { type: "thinking", label }] : opening();
      }

      case "plan_built":
        return [
          ...opening(),
          { type: "step", id: STEP_IDS.plan, label: labels.plan, status: "done" },
          { type: "step", id: STEP_IDS.check, label: labels.check, status: "running" },
        ];

      case "done": {
        settled = true;
        const document = event.data ?? {};
        const chunks: PlanChunk[] = [
          ...opening(),
          { type: "step", id: STEP_IDS.plan, label: labels.plan, status: "done" },
          { type: "step", id: STEP_IDS.check, label: labels.check, status: "done" },
        ];
        // Only when the reply did not stream, or the same sentence would print twice.
        const reply = str((document as { reply?: unknown }).reply);
        if (reply && !streamedReply) chunks.push({ type: "text", delta: reply });
        // Held back by the service's ask rules. No graph: applying a patch clears card results.
        const held = (document as { questions?: unknown }).questions;
        if (Array.isArray(held) && held.length) {
          chunks.push({
            type: "questions",
            questions: toAgentQuestions(held as Parameters<typeof toAgentQuestions>[0]),
          });
          chunks.push({ type: "done" });
          return chunks;
        }
        // Only a graph that changes something, or the thread claims an update that never was.
        if (hasGraph(document)) chunks.push({ type: "workflow", document });
        chunks.push({ type: "done" });
        return chunks;
      }

      case "error":
      case "stopped": {
        settled = true;
        const message =
          str(event.data?.message) ??
          (event.type === "stopped" ? "Planning was stopped." : "Planning failed.");
        // A refusal is a verdict, not a fault, so it gets no Retry.
        const refused = event.data?.refused === true;
        return [
          ...opening(),
          { type: "step", id: STEP_IDS.plan, label: labels.plan, status: "error" },
          { type: "error", message, retryable: !refused },
        ];
      }

      default:
        // The job stream also carries render-job events; a planning turn ignores them.
        return [];
    }
  };
}
