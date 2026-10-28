import type { FlowNode } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { HISTORY_CAP } from "../shared/constants";
import type { HistoryEntry } from "./types";

const entriesOf = (value: unknown): HistoryEntry[] =>
  Array.isArray(value) ? value.filter((e) => e && typeof e === "object") : [];

const timeOf = (entry: HistoryEntry): number =>
  typeof entry.createdAt === "number" ? entry.createdAt : 0;

/** Union of two result histories by entry id, oldest first, capped to the newest entries. */
function mergeHistory(restored: unknown, current: unknown): HistoryEntry[] {
  const byId = new Map<unknown, HistoryEntry>();
  for (const entry of [...entriesOf(restored), ...entriesOf(current)]) {
    byId.set(entry.id ?? byId.size, entry);
  }
  const merged = [...byId.values()].sort((a, b) => timeOf(a) - timeOf(b));
  return merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged;
}

/** Restored nodes keep today's per-node result history: a project restore never rewinds it. */
export function withCurrentHistories(restored: FlowNode[], current: FlowNode[]): FlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return restored.map((node) => {
    const now = currentById.get(node.id)?.config?.history;
    if (!Array.isArray(now) || now.length === 0) return node;
    return {
      ...node,
      config: { ...node.config, history: mergeHistory(node.config?.history, now) },
    };
  });
}
