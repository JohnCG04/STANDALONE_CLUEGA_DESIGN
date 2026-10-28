import type { FlowJobsLedger } from "../jobs/types";

/** The ledger methods the actions need: identity-stable per page, so `actions` doesn't churn. */
export type FlowJobSubmitter = Pick<
  FlowJobsLedger,
  "beginSubmit" | "completeSubmit" | "stopSubmit"
>;

/** What the ledger reads off a request: the node that placed it, and its pause. */
export interface TrackedRequest {
  nodeId?: string;
  signal?: AbortSignal;
}
