import type { Asset, GenResult, WorkflowRun } from "@dogclaw-ad/workflow";

import {
  isTerminalFlowJobStatus,
  type FlowJob,
  type FlowJobWrite,
  MAX_FLOW_JOBS_PER_PAGE,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { hostedFileIdFromUrl } from "../shared/helpers";
import { proxyImageAsset } from "../shared/mediaProxy";
import { KEEP_APPLIED_ROWS } from "./constants";

export function runStatusOf(job: FlowJob): WorkflowRun["status"] {
  if (job.status === "failed") return "failed";
  // A pause is its own ending in the Runs panel, not a finished run.
  if (job.status === "stopped") return "stopped";
  if (isTerminalFlowJobStatus(job.status)) return "done";
  return job.status === "queued" ? "queued" : "running";
}

export function toWrite(job: FlowJob): FlowJobWrite {
  const {
    outputs: _outputs,
    discarded: _discarded,
    created_at: _c,
    updated_at: _u,
    ...write
  } = job;
  return write;
}

/** Mark the live rows among `ids` stopped; a settled row keeps its truth. `true` = changed. */
export function stopRows(rows: Map<string, FlowJob>, ids: readonly string[]): boolean {
  let touched = false;
  for (const id of ids) {
    const job = rows.get(id);
    if (!job || isTerminalFlowJobStatus(job.status)) continue;
    rows.set(id, { ...job, status: "stopped" });
    touched = true;
  }
  return touched;
}

/**
 * Keep settled rows (terminal and drawn, or nothing to draw) {@link KEEP_APPLIED_ROWS} deep, then
 * shed the oldest terminal rows past the server cap. Live rows are never dropped.
 */
export function pruneForFlush(rows: FlowJob[]): FlowJob[] {
  const stamp = (job: FlowJob) =>
    Date.parse(job.applied_at ?? job.updated_at ?? job.created_at ?? "") || 0;
  const newestFirst = [...rows].sort((a, b) => stamp(b) - stamp(a));

  const kept: FlowJob[] = [];
  let historyKept = 0;
  for (const job of newestFirst) {
    const terminal = isTerminalFlowJobStatus(job.status);
    if (terminal && (job.applied_at || !job.outputs?.length)) {
      if (historyKept >= KEEP_APPLIED_ROWS) continue;
      historyKept += 1;
    }
    kept.push(job);
  }
  while (kept.length > MAX_FLOW_JOBS_PER_PAGE) {
    const idx = kept
      .map((job, i) => ({ job, i }))
      .reverse()
      .find(({ job }) => isTerminalFlowJobStatus(job.status))?.i;
    if (idx === undefined) break;
    kept.splice(idx, 1);
  }
  return kept;
}

/** A stable id per asset (hosted id, else the url), never a uuid: history dedupes by id. */
export function stableAsset(url: string, kind: Asset["kind"]): Asset {
  const asset: Asset = { id: hostedFileIdFromUrl(url) ?? url, url, kind };
  // Images go through the same-origin proxy; proxying videos would stream them through ours.
  return kind === "image" ? proxyImageAsset(asset) : asset;
}

export function toGenResult(urls: string[], kind: Asset["kind"]): GenResult {
  const assets = urls.map((url) => stableAsset(url, kind));
  return { asset: assets[0], assets };
}

/** The prompt the job actually ran with, echoed on the row at submit. */
export function promptOf(job: FlowJob): string | undefined {
  const p = job.request?.prompt;
  return typeof p === "string" && p ? p : undefined;
}
