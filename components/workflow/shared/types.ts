/** Seeds the page's job ledger row (flow-builder.service.ts "Flow jobs"). Spread verbatim at the
 *  TOP LEVEL of `POST /media/jobs`: media-ai models are `extra="forbid"`. */
export interface FlowJobTarget {
  /** A node id is only unique per page, so the project id is not enough. */
  page_id: string;
  node_id: string;
  /** Which submit on that node this is (0,1,2…). */
  seq: number;
  /** The whole-workflow run this submit belongs to; absent for a single card run. */
  workflow_run_id?: string;
}

/** An action's ledger hookup. `onCreated` fires on every 202, maybe more than once per submit
 *  (Logo Compositing, AI Resize re-rolls), so the ledger knows a job even if the tab dies. */
export interface FlowJobTrack {
  target: FlowJobTarget;
  onCreated?: (jobIds: string[], groupId: string) => void;
}

export type UrlTransform = (url: string) => string;

/** The three node fields that can hold a media url. */
export type GraphNodeMedia = {
  config?: Record<string, unknown>;
  asset_ref?: unknown;
  output?: unknown;
};
