import type {
  FlowDocument,
  FlowJob,
  FlowNode,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { HISTORY_CAP } from "../shared/constants";
import type { ApplyJobsResult, HistoryEntry } from "./types";

/** Mirror of the editor's `appendHistory`: a repeated id replaces its entry (idempotent). */
function appendHistory(
  prev: HistoryEntry[] | undefined,
  entries: HistoryEntry[],
): HistoryEntry[] {
  const incoming = new Map(entries.map((e) => [e.id, e]));
  const kept = (prev ?? []).filter((e) => !incoming.has(e.id));
  const next = [...kept, ...incoming.values()];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

/** Epoch millis off a ledger timestamp; `0` (sorts oldest) when unparsable. */
function epochOf(value?: string): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** The prompt echoed on the row at submit, for the history card's caption. */
function promptOf(job: FlowJob): string {
  const p = job.request?.prompt;
  return typeof p === "string" ? p : "";
}

/** The ledger's asset id, else the url — never a minted uuid, since history dedupes by id. */
function assetIdOf(out: { id?: string; url: string }): string {
  return out.id || out.url;
}

export function jobsForExistingNodes(
  document: FlowDocument,
  jobs: FlowJob[],
): FlowJob[] {
  const nodeIds = new Set((document.nodes ?? []).map((node) => node.id));
  return jobs.filter((job) => nodeIds.has(job.node_id));
}

function historyEntriesOf(job: FlowJob): HistoryEntry[] {
  const prompt = promptOf(job);
  const createdAt = epochOf(job.updated_at ?? job.created_at) || Date.now();
  return (job.outputs ?? [])
    .filter((out) => out.url)
    .map((out) => ({
      id: assetIdOf(out),
      url: out.url,
      assetId: out.id,
      prompt,
      createdAt,
    }));
}

/**
 * Fold finished-but-undrawn ledger jobs into the RAW document before the canvas mounts. Per node
 * the highest `seq` wins `config.result`; every output joins `config.history`.
 */
export function applyJobsToDocument(
  document: FlowDocument,
  jobs: FlowJob[],
): ApplyJobsResult {
  // `applied_at` is shared across devices; a stopped row with outputs counts unless discarded.
  const appliable = jobsForExistingNodes(document, jobs).filter(
    (job) =>
      !job.applied_at &&
      !job.discarded &&
      (job.outputs?.length ?? 0) > 0,
  );
  if (appliable.length === 0) return { document, appliedJobIds: [] };

  // node_id → seq → rows; rows sharing a seq (`n>1` fan-out, one per creative) are one submit.
  const byNode = new Map<string, Map<number, FlowJob[]>>();
  for (const job of appliable) {
    const bySeq = byNode.get(job.node_id) ?? new Map<number, FlowJob[]>();
    const rows = bySeq.get(job.seq) ?? [];
    rows.push(job);
    bySeq.set(job.seq, rows);
    byNode.set(job.node_id, bySeq);
  }

  const nodes = (document.nodes ?? []).map((node): FlowNode => {
    const bySeq = byNode.get(node.id);
    if (!bySeq) return node;

    // Oldest submit first, so the newest submit is the last to write the active result.
    const submits = [...bySeq.entries()].sort(([a], [b]) => a - b);

    const config: Record<string, unknown> = { ...(node.config ?? {}) };
    let history = config.history as HistoryEntry[] | undefined;

    let result: Record<string, unknown> | undefined;
    for (const [, rows] of submits) {
      rows.sort(
        (a, b) => epochOf(a.created_at) - epochOf(b.created_at),
      );
      const outputs = rows.flatMap((row) =>
        (row.outputs ?? []).filter((out) => out.url),
      );
      if (outputs.length === 0) continue;

      history = appendHistory(history, rows.flatMap(historyEntriesOf));

      // Mirrors the editor's write-back: video/audio keep a single-asset result, images a carousel.
      result =
        rows[0].kind === "video" || rows[0].kind === "audio"
          ? {
              url: outputs[0].url,
              ...(outputs[0].id ? { id: outputs[0].id } : {}),
              ...(outputs.length > 1
                ? {
                    urls: outputs.map((out) => out.url),
                    ids: outputs.map(assetIdOf),
                  }
                : {}),
            }
          : {
              url: outputs[0].url,
              urls: outputs.map((out) => out.url),
              ids: outputs.map(assetIdOf),
            };
    }

    if (!result) return node;
    config.result = result;
    if (history) config.history = history;
    return { ...node, config };
  });

  return {
    document: { ...document, nodes },
    appliedJobIds: appliable.map((job) => job.job_id),
  };
}
