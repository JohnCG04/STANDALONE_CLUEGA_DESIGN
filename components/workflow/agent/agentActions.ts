"use client";

// The host half of the headless `@dogclaw-ad/workflow-agent`: every outward effect lives here.

import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import type {
  AgentChunk,
  AgentMessage,
  AgentSendRequest,
  WorkflowAgentActions,
} from "@dogclaw-ad/workflow-agent";

import type { WorkflowGraphApi } from "@dogclaw-ad/workflow";

import { WINDOW } from "./constants";
import { conversationStore } from "./conversations";
import { digestFromApi, imagesFromApi } from "./graphDigest";
import { mentionActions } from "./mentions";
import { planWorkflow } from "./planWorkflow";
import type { HostActions, StoredMessage } from "./types";

/** media-ai via the CDP gateway; `mediaFetch` heals a 401 once, which long plans need. */
const transport = {
  get baseUrl() {
    // Read per turn, not at module load: the base can change with the environment.
    return mediaBaseUrl();
  },
  fetch: mediaFetch,
};

/**
 * Build the host half, bound to the editor on screen.
 * Handles are refs: the editor swaps them on mount and unmount, and a turn reads the current one.
 */
export function createWorkflowAgentActions(
  graphApi: { readonly current: WorkflowGraphApi | null },
  /** History is kept per workflow; absent (the Flow Home launcher) means no history at all. */
  workflowId?: string,
  /** Ref to the editor's runner for the panel's Run; absent (launcher) hides the button. */
  runGraph?: {
    readonly current:
      | ((opts?: { only?: readonly string[] }) => Promise<unknown>)
      | null;
  },
  /** Cards the last proposal touched: Run starts that work, not every abandoned branch. */
  lastProposal?: { readonly current: readonly string[] },
  /** Panel language, read only by the service's ask-rule fallback question. */
  locale?: string,
): HostActions {
  const store = workflowId ? conversationStore(workflowId) : null;
  const mentions = mentionActions(graphApi);

  /**
   * Fold aged-out turns into memory: a model call, so it lives here and not in the store.
   * On failure the memory comes back unchanged.
   */
  const fold = async (
    summary: string,
    dropped: readonly StoredMessage[],
  ): Promise<string> => {
    try {
      const res = await transport.fetch(`${transport.baseUrl}/workflow/summarize`, {
        method: "POST",
        body: JSON.stringify({
          summary,
          dropped: dropped.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      if (!res.ok) return summary;
      return ((await res.json()) as { summary?: string }).summary || summary;
    } catch {
      return summary;
    }
  };

  return {
    // `@`: the list makes a node nameable; the reveal confirms the user picked the right one.
    async listMentionables(query: string) {
      return mentions.list(query);
    },
    revealMention(mention: { id: string }) {
      mentions.reveal(mention.id);
    },
    highlightMentions(pending: readonly { id: string }[]) {
      mentions.highlight(pending.map((x) => x.id));
    },

    // Run from the thread, where the user learns the graph is waiting.
    ...(runGraph
      ? {
          async runWorkflow() {
            const only = lastProposal?.current;
            await runGraph.current?.(only?.length ? { only } : undefined);
          },
        }
      : {}),

  async *sendMessage(req: AgentSendRequest, { signal }) {
    // The panel's Stop and an unmount mid-stream both arrive as `signal`.
    yield* planWorkflow(
      {
        prompt: req.prompt,
        // Narrowed here, once, to the verbatim window; older turns travel as the summary.
        history: req.history
          .slice(-WINDOW)
          .map((m) => ({ role: m.role, text: m.text })),
        ...(() => {
          const summary = store?.memory(req.conversationId).summary;
          return summary ? { summary } : {};
        })(),
        ...(req.model ? { model: req.model } : {}),
        // `runMode` is not sent: it only governs what the host does with the graph.
        ...(req.planMode ? { planMode: req.planMode } : {}),
        // Answers continue their brief; read alone, "9:16" would be the whole request.
        ...(req.answering ? { answering: true } : {}),
        // Read per turn: the canvas asked about is the one on screen now.
        digest: digestFromApi(graphApi.current),
        // The service decides whether the turn needs the pictures.
        images: imagesFromApi(graphApi.current),
        ...(req.mentions?.length
          ? { mentions: req.mentions.map((x) => x.id) }
          : {}),
        ...(locale ? { locale } : {}),
      },
      { transport, signal },
    ) as AsyncGenerator<AgentChunk>;
  },

  /**
   * Mark what the option under the cursor would touch, while a question is answered.
   * `[]` clears, sent when the choice is undone, so no mark points at nothing.
   */
  previewNodes(nodeIds: readonly string[]) {
    mentions.highlight(nodeIds);
  },

  // Without a workflow all history methods are omitted, which hides the dropdown.
  ...(store
    ? {
        async listConversations() {
          const rows = await store.list();
          return rows.map((c) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt,
          }));
        },
        async loadConversation(id: string) {
          return (await store.load(id)) as unknown as AgentMessage[];
        },
        async saveConversation({
          id,
          messages,
        }: {
          id?: string;
          messages: readonly AgentMessage[];
        }) {
          const saved = await store.save(
            id,
            messages as unknown as readonly StoredMessage[],
          );
          // Awaited so a fold cannot race the next turn's read of the memory.
          if (saved) await store.foldIfNeeded(saved, fold);
          return saved;
        },
        async renameConversation(id: string, title: string) {
          await store.rename(id, title);
        },
        async deleteConversation(id: string) {
          await store.remove(id);
        },
      }
    : {}),
  };
}

/** The adapter for the Flow Home launcher: it never sends, so it needs no canvas handle. */
export const workflowAgentActions: WorkflowAgentActions =
  createWorkflowAgentActions({ current: null });
