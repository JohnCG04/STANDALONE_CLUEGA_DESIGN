import type { ActiveRun } from "./types";

/** A non-blank string, returned untrimmed. */
export const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

/** A fresh run id; a UUID wherever the browser can make one. */
export function newRunId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

/** The graph run a submit on `nodeId` belongs to, or `undefined` for none. */
export function runIdFor(
  run: ActiveRun | null | undefined,
  nodeId: string,
): string | undefined {
  return run && run.nodes.has(nodeId) ? run.id : undefined;
}

/** The run id a submit on `nodeId` carries: its graph run's, else a fresh one per submit. */
export function runIdForSubmit(run: ActiveRun | null | undefined, nodeId: string): string {
  return runIdFor(run, nodeId) ?? newRunId();
}
