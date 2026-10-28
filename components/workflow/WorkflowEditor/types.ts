import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  AssetsPanelConfig,
  AssetsTab,
  WorkflowActions,
  WorkflowAsset,
  WorkflowGraphApi,
  WorkflowPagesConfig,
  WorkflowRunsConfig,
} from "@dogclaw-ad/workflow";
import type { AgentPlanMode, AgentRunMode } from "@dogclaw-ad/workflow-agent";

import type { Asset } from "@/lib/cdp/assetsClient";
import type {
  FlowDocument,
  FlowJob,
  FlowPage,
  FlowProject,
  FlowViewport,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import type { RunGraphResult, RunOptions } from "../executor/types";
import type {
  MediaImageModel,
  MediaTextModel,
  MediaVideoModel,
} from "@/resources/app/pages/app/components/Conversation/apis/types";

export type LeftPanelKey = "content" | "nodes" | "assets";

export type CanvasState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      nodes: Node[];
      edges: Edge[];
      viewport: FlowViewport | null;
      version: number;
      globalConfig?: Record<string, unknown>;
    };

/** Icons are the host's (`resolveModelIcon`); passed in so helpers stay importable in tests. */
export type IconFor = (name: string) => ReactNode;

export type CatalogRow = MediaImageModel | MediaVideoModel | MediaTextModel;

/** Everything the editor opens with; an optional member is `undefined` when its load failed. */
export interface WorkflowBootstrapData {
  project: FlowProject;
  /** `null` when the pages route isn't available: a legacy single-canvas project. */
  pages: FlowPage[] | null;
  /** The page whose graph is in `document`. */
  activePageId: string | null;
  document: FlowDocument;
  /** The open page's job ledger, read at open; `undefined` keeps the feature off this visit. */
  jobs?: FlowJob[];
  /** The Assets panel's first page (This project, raw rows) + its cursor. */
  assets?: AssetsPage;
  /** The project menu's "Open Project" submenu. */
  recentProjects?: FlowProject[];
}

export type WorkflowBootstrapState =
  | { status: "loading" }
  // A state, not a redirect: Material Center links here, and a silent bounce reads as nothing.
  | { status: "missing" }
  | { status: "ready"; data: WorkflowBootstrapData };

/** One fetched page: raw rows plus the cursor that continues past them. */
export interface AssetsPage {
  items: Asset[];
  /** `nextCursor` of this page — empty when it was also the last. */
  nextCursor: string;
}

export interface UseWorkflowAssetsOptions {
  /** The host owns what "select" does; the panel only surfaces the click. */
  onSelectAsset?: (asset: WorkflowAsset) => void;
  /** What "This project" narrows to (`source_ref.workflow_id`); without it, the whole library. */
  workflowId?: string;
  /** Bootstrap's first page: `undefined` = pending, `null` = failed (fetch here), else the seed. */
  initialAssets?: AssetsPage | null;
  /** Copy for the panel's empty state, so the host can localize it. */
  labels?: {
    tabs?: Partial<Record<AssetsTab, string>>;
    empty?: string;
    emptyDescription?: string;
    error?: string;
    errorDescription?: string;
  };
}

export interface UseWorkflowAssets {
  /** Hand this straight to `WorkflowEditor`'s `assets` prop. */
  config: AssetsPanelConfig;
  /** Re-run the current query (e.g. after an upload). */
  refetch: () => void;
  /** Show freshly uploaded assets immediately, before the refetch lands. */
  prepend: (assets: WorkflowAsset[]) => void;
}

export interface UseWorkflowPagesOptions {
  /** From the bootstrap (never fetched here): `undefined` while loading, `null` with no route. */
  pages?: FlowPage[] | null;
  /** Copy for the panel's empty state, so the host can localize it. */
  emptyLabel?: string;
  /** A refused page rename; the row keeps its old name, so say why. Keep it stable (memoized). */
  onRenameError?: (err: unknown) => void;
}

export interface UseWorkflowPages {
  /** Hand this straight to `WorkflowEditor`'s `pages` prop. */
  config: WorkflowPagesConfig;
  /** `isActiveMultiplePages`: false keeps the single canvas with the Content rail hidden. */
  enabled: boolean;
  /** The open page, or `null` for the project's legacy single document. */
  activePageId: string | null;
}

/** What one page adds to the editor props every page shares. */
export interface PageEditorProps {
  /** Remounts the editor on a version restore or an agent proposal. */
  editorKey: string;
  actions: WorkflowActions;
  defaultNodes: Node[];
  defaultEdges: Edge[];
  defaultViewport: FlowViewport | null;
  documentVersion: number;
  globalConfig?: Record<string, unknown>;
  brandKit: { enabled: boolean; onToggle: (enabled: boolean) => void };
  onGraphApiReady: (api: WorkflowGraphApi | null) => void;
  runs?: WorkflowRunsConfig;
  /** A page kept mounted off screen while it runs. */
  background: boolean;
  onRunNodes: (nodeIds: string[]) => void;
}

export interface ProposalOptions {
  runMode: AgentRunMode;
  planMode?: AgentPlanMode;
}

/** What the screen asks of one mounted page. */
export interface PageSessionHandle {
  /** The page's live editor handle; `null` around a remount. */
  graphApi: { readonly current: WorkflowGraphApi | null };
  /** Cards the last agent proposal touched on this page. */
  lastProposal: { readonly current: readonly string[] };
  /** Waits for the page to load, runs it (or `only`), then waits until its results are saved. */
  run(opts?: RunOptions): Promise<RunGraphResult>;
  stop(): void;
  propose(document: unknown, opts: ProposalOptions): void;
  /** Put a saved version back as this page's document. */
  restore(version: number): Promise<void>;
}

/** One row of the Run all pages confirmation. */
export interface RunAllPageRow {
  id: string;
  name: string;
  nodeCount: number;
}

/** Where Run all pages is; `pageId` stays mounted until its run ends. */
export interface RunAllProgress {
  index: number;
  total: number;
  pageId: string;
  name: string;
}

/** Several runs summed for one toast. */
export interface RunTotals {
  ran: number;
  failed: number;
  blocked: number;
  aborted: boolean;
}
