import { NOT_CONTENT } from "./constants";
import type { FingerprintEdge, FingerprintGraph, NodeData } from "./types";

/** What a source hands downstream: its selected result, else its own settings (a prompt's text). */
function outputOf(data: NodeData | undefined): unknown {
  if (!data) return null;
  const result = data.result as { url?: unknown; urls?: unknown[] } | null | undefined;
  if (result) {
    const index = typeof data.index === "number" ? data.index : 0;
    return result.urls?.[index] ?? result.url ?? null;
  }
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !NOT_CONTENT.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** FNV-1a, 32-bit: short enough to save on every node, stable across sessions. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The key of everything wired into `id`, in a stable order, so a run can spot a stale result.
 * Only inputs count, never the node's own run state: a rename or status change is not new input.
 */
export function inputFingerprint(
  id: string,
  graph: FingerprintGraph,
  edges: readonly FingerprintEdge[],
): string {
  const inputs = edges
    .filter((e) => e.target === id)
    .map((e) => [e.targetHandle ?? "", e.source, outputOf(graph.getNode(e.source)?.data)] as const)
    .sort((a, b) => `${a[0]}\u0000${a[1]}`.localeCompare(`${b[0]}\u0000${b[1]}`));
  return hash(JSON.stringify(inputs));
}
