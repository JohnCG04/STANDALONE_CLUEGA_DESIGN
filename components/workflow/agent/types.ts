import type { Edge, Node } from "@xyflow/react";
import type { WorkflowAgentActions } from "@dogclaw-ad/workflow-agent";

/** The one string the host owns for a Plan-mode turn; the model writes the rest. */
export interface PlanCopy {
  /** Shown when the service could not produce a proposal. */
  unavailable: string;
}

/**
 * The package contract plus `previewNodes`, which older package builds don't declare.
 * TODO: drop the extension once the pinned package version declares the method.
 */
export type HostActions = WorkflowAgentActions & {
  previewNodes?(nodeIds: readonly string[]): void;
};

/** As much of a message as the conversation store handles. Mirrors the package's own type. */
export interface StoredMessage {
  id: string;
  role: string;
  text: string;
  [key: string]: unknown;
}

export interface StoredConversation {
  id: string;
  title?: string;
  updatedAt: number;
  messages: StoredMessage[];
  /** Memory of everything before `summarizedCount`; only recent turns travel verbatim. */
  summary?: string;
  /** How many leading messages the summary already accounts for. */
  summarizedCount?: number;
}

/** The server's shape. `body` carries every field the store does not read. */
export interface WireMessage {
  id: string;
  role: string;
  text: string;
  body?: Record<string, unknown>;
}

export interface WireConversation {
  id: string;
  title?: string;
  summary?: string;
  summarized_count?: number;
  messages?: WireMessage[];
  updated_at?: number;
}

/** How the conversation store reaches the gateway; injected so it can be tested offline. */
export type FlowRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<{ data?: T }>;

export interface ClarifyQuestion {
  id: string;
  question: string;
  hint?: string;
  required?: boolean;
  input_type?: "text" | "textarea" | "select" | "number";
  options?: string[];
  /** Whether `options` are suggestions the user may write past. */
  allow_custom?: boolean;
  /** Canvas nodes this question is about, marked while the form is up. */
  about?: readonly string[];
  /** Canvas nodes each option would affect, paired with `options` by position. */
  option_nodes?: readonly (readonly string[])[];
}

/** One turn of the panel's thread, as much of it as `clarify` reads. */
export interface ThreadTurn {
  role: string;
  text: string;
}

/** One question as the agent panel draws it. Mirrors the package's own type. */
export interface AgentQuestion {
  /** Canvas nodes to mark while this question is on screen. */
  about?: readonly string[];
  /** Canvas nodes each option would affect, parallel to `options`. */
  optionNodes?: readonly (readonly string[])[];
  id: string;
  question: string;
  hint?: string;
  required?: boolean;
  inputType?: "text" | "textarea" | "select" | "number";
  options?: string[];
  allowCustom?: boolean;
}

/** One finished picture, named by the node that made it. */
export interface NodeImage {
  node_id: string;
  url: string;
}

/** One thing the `@` list can offer. Mirrors the package's own type. */
export interface Mentionable {
  /** The node id, so a pick can point straight back at the canvas. */
  id: string;
  label: string;
  kind?: string;
  /** The node's finished picture: how a user tells near-identical cards apart. */
  thumbnailUrl?: string;
}

/** One event off the job's SSE stream, already JSON-parsed. */
export interface JobEvent {
  type: string;
  data?: Record<string, unknown>;
}

/** The subset of `AgentChunk` this bridge emits. Structurally the package's. */
export type PlanChunk =
  | { type: "thinking"; label: string }
  | { type: "step"; id: string; label: string; status: "running" | "done" | "error" }
  | { type: "text"; delta: string }
  | {
      type: "questions";
      questions: {
        id: string;
        question: string;
        hint?: string;
        required?: boolean;
        inputType?: "text" | "textarea" | "select" | "number";
        options?: string[];
      }[];
    }
  | {
      /** Plan mode only: a settled plan rewritten as the message that would build it. */
      type: "offer";
      brief: string;
    }
  | { type: "workflow"; document: unknown }
  | { type: "error"; message: string; retryable?: boolean }
  | { type: "done" };

/** Copy shown in the panel. Passed in so the host owns its own localization. */
export interface PlanStepLabels {
  understand: string;
  plan: string;
  check: string;
}

/** One node as the planner emits it. */
export interface PlanNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

/** A change to a node the canvas already holds. */
export interface PlanUpdateInput {
  id?: unknown;
  config?: Record<string, unknown>;
}

/** One wire as the planner emits it. */
export interface PlanEdge {
  source: string;
  target: string;
  target_handle: string;
  source_handle?: string | null;
}

export interface PlanDocument {
  nodes?: PlanNode[];
  edges?: PlanEdge[];
  /** What the agent says about what it built. Not read by `planToGraph`. */
  reply?: string;
  /** Changes to nodes the canvas already holds. */
  updates?: PlanUpdateInput[];
}

/** A change to a node that is already on the canvas. */
export interface PlanPatch {
  id: string;
  /** Fields to MERGE onto the node's data. Placed where the card reads them. */
  data: Record<string, unknown>;
}

export interface PlanToGraphResult {
  nodes: Node[];
  edges: Edge[];
  /** Edits to existing nodes, kept apart: a node is mounted, a patch is merged. */
  patches: PlanPatch[];
  /** What was dropped and why. Empty when the plan converted cleanly. */
  dropped: string[];
}

export interface PlanWorkflowRequest {
  prompt: string;
  /** The thread so far: the service keeps no session, so earlier answers travel here. */
  history?: readonly ThreadTurn[];
  /** The canvas, from the editor's `digestGraph`; without it the assistant cannot see it. */
  digest?: unknown;
  /** Finished canvas pictures, kept out of the digest: the service resolves them to bytes. */
  images?: readonly { node_id: string; url: string }[];
  /** Canvas node ids the user `@`-mentioned; the planner gets them too, to target edits. */
  mentions?: readonly string[];
  /** Panel language, for the one question the service writes itself (ask-rule fallback). */
  locale?: string;
  /** Memory of the turns older than `history`, as one paragraph. */
  summary?: string;
  /** Values the caller already settled, so the planner treats them as decided. */
  params?: Record<string, unknown>;
  /** Pin the planning model for this turn; otherwise the service's config wins. */
  model?: string;
  /** `plan` proposes a campaign and builds nothing; `approve` currently behaves as `auto`. */
  planMode?: "plan" | "approve" | "auto";
  /** This turn answers the last one's questions: the request is the brief plus answers. */
  answering?: boolean;
}

/** How the pipeline reaches media-ai; injected so browser, server route and tests share it. */
export interface MediaTransport {
  /** The media-ai root every endpoint URL is built from. */
  baseUrl: string;
  fetch(
    url: string,
    init?: RequestInit,
    accept?: string,
  ): Promise<Response>;
}

export interface PlanWorkflowOptions {
  transport: MediaTransport;
  signal?: AbortSignal;
  labels?: PlanStepLabels;
  /** Overrides the service's own catalogue, for tests or an editor build it doesn't know. */
  manifest?: unknown;
  /** Copy the host owns for a Plan-mode turn. Host-localized. */
  planCopy?: PlanCopy;
}

/** What one streamed chat turn amounts to. */
export interface RoutedTurn {
  route: string;
  reply: string;
  /** What the turn still needs before a graph is worth planning. */
  questions?: AgentQuestion[];
  /** The brief tidied into one instruction, answers folded in; what the planner builds from. */
  request?: string;
  /** Plan mode only: the plan rewritten as the message that would build it. */
  brief?: string;
  /** Node types the router says this build needs; empty means it could not choose. */
  nodes: string[];
  /** Whether the planner must look at the canvas's finished media. */
  needsImages: boolean;
}

export interface SseFrame {
  /** The `event:` name, or `"message"` when the frame omits one. */
  event: string;
  /** The `data:` payload, with multi-line data rejoined by newline. */
  data: string;
}
