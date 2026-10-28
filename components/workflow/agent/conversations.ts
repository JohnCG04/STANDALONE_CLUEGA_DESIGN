// Chat history per workflow, on the server: a thread only makes sense beside its own graph.

import { requestFlowApi } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { FOLD_AFTER, WINDOW } from "./constants";
import { titleFrom, toStored, toWire } from "./helpers";
import type {
  FlowRequest,
  StoredConversation,
  StoredMessage,
  WireConversation,
} from "./types";

let seq = 0;
function mintId(): string {
  seq += 1;
  return `c-${Date.now().toString(36)}-${seq}`;
}

const base = (workflowId: string) =>
  `/api/v1/flow-builder/projects/${encodeURIComponent(workflowId)}/conversations`;

/**
 * Threads per workflow: the editor bootstrap and the chat package both ask on mount.
 * Emptied by every write, so a saved, renamed or deleted thread is not listed stale.
 */
const listCache = new Map<string, StoredConversation[]>();
/** Loads in flight, so two callers in the same tick share one request. */
const listInflight = new Map<string, Promise<StoredConversation[]>>();

function fetchList(
  workflowId: string,
  request: FlowRequest,
): Promise<StoredConversation[]> {
  const pending = listInflight.get(workflowId);
  if (pending) return pending;

  const run = request<WireConversation[]>(base(workflowId)).then((res) =>
    (res.data ?? []).map(toStored),
  );
  listInflight.set(workflowId, run);
  const clear = () => {
    if (listInflight.get(workflowId) === run) listInflight.delete(workflowId);
  };
  void run.then(clear, clear);
  return run;
}

/**
 * The workflow's threads, from the cache when it holds them.
 * A failed load is not cached, so the next caller retries.
 */
export async function loadConversationList(
  workflowId: string,
  request: FlowRequest = requestFlowApi,
): Promise<StoredConversation[]> {
  const cached = listCache.get(workflowId);
  if (cached) return cached;
  const rows = await fetchList(workflowId, request);
  listCache.set(workflowId, rows);
  return rows;
}

/** Read the list fresh for the editor's initial load, never from an earlier visit. */
export function primeConversationList(
  workflowId: string,
  request: FlowRequest = requestFlowApi,
): Promise<StoredConversation[]> {
  listCache.delete(workflowId);
  return loadConversationList(workflowId, request);
}

/** Forget the cached list after a write; the server owns the order and derived titles. */
function forgetList(workflowId: string): void {
  listCache.delete(workflowId);
}

/**
 * The conversation methods, bound to one workflow.
 * Reads never throw: a panel without its history dropdown beats one that will not open.
 */
export function conversationStore(
  workflowId: string,
  request: FlowRequest = requestFlowApi,
) {
  /** The last thread written, so `memory()` can answer without a round trip. */
  let cached: StoredConversation | null = null;

  return {
    async list(): Promise<StoredConversation[]> {
      try {
        return await loadConversationList(workflowId, request);
      } catch {
        return [];
      }
    },

    async load(id: string): Promise<StoredMessage[]> {
      try {
        const res = await request<WireConversation>(
          `${base(workflowId)}/${encodeURIComponent(id)}`,
        );
        if (!res.data) return [];
        cached = toStored(res.data);
        return cached.messages;
      } catch {
        return [];
      }
    },

    /** Memory plus unfolded turns, from the last thread seen: no fetch between Enter and send. */
    memory(id: string | undefined): { summary: string; window: StoredMessage[] } {
      if (!id || cached?.id !== id) return { summary: "", window: [] };
      return {
        summary: cached.summary ?? "",
        window: cached.messages.slice(-WINDOW),
      };
    },

    /** Write the thread, minting an id on first save; an empty thread is never stored. */
    async save(
      id: string | undefined,
      messages: readonly StoredMessage[],
    ): Promise<string | undefined> {
      if (!messages.length) return id;
      const conversationId = id ?? mintId();

      forgetList(workflowId);

      // The summary is carried forward from this store: it is costly and the caller lacks it.
      const keep = cached?.id === conversationId ? cached : null;
      const next: StoredConversation = {
        id: conversationId,
        title: keep?.title || titleFrom(messages),
        summary: keep?.summary,
        summarizedCount: keep?.summarizedCount,
        updatedAt: Date.now(),
        messages: messages as StoredMessage[],
      };
      cached = next;

      try {
        await request(`${base(workflowId)}/${encodeURIComponent(conversationId)}`, {
          method: "PUT",
          body: JSON.stringify({
            title: next.title,
            summary: next.summary ?? "",
            summarized_count: next.summarizedCount ?? 0,
            messages: messages.map(toWire),
          }),
        });
      } catch {
        // The turn is still on screen and in `cached`; failing would take the reply away too.
      }
      return conversationId;
    },

    /**
     * Fold aged-out turns once enough have; `fold` is injected because it is a model call.
     * A failed fold leaves the thread as it was, retried on the next turn.
     */
    async foldIfNeeded(
      id: string,
      fold: (summary: string, dropped: readonly StoredMessage[]) => Promise<string>,
    ): Promise<void> {
      const row = cached?.id === id ? cached : null;
      if (!row) return;

      const from = row.summarizedCount ?? 0;
      const to = Math.max(from, row.messages.length - WINDOW);
      const dropped = row.messages.slice(from, to);
      if (dropped.length < FOLD_AFTER) return;

      const summary = await fold(row.summary ?? "", dropped);
      if (!summary || summary === row.summary) return;

      cached = { ...row, summary, summarizedCount: to };
      try {
        await request(`${base(workflowId)}/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({
            title: cached.title,
            summary,
            summarized_count: to,
            messages: cached.messages.map(toWire),
          }),
        });
      } catch {
        // Kept in `cached` regardless, so this session keeps a fold it already paid for.
      }
    },

    async rename(id: string, title: string): Promise<void> {
      forgetList(workflowId);
      const row = cached?.id === id ? cached : null;
      if (row) cached = { ...row, title };
      try {
        await request(`${base(workflowId)}/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            summary: row?.summary ?? "",
            summarized_count: row?.summarizedCount ?? 0,
            messages: (row?.messages ?? []).map(toWire),
          }),
        });
      } catch {
        // Same reasoning as `save`.
      }
    },

    async remove(id: string): Promise<void> {
      forgetList(workflowId);
      if (cached?.id === id) cached = null;
      try {
        await request(`${base(workflowId)}/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        // An unreached delete leaves the row listed; the user can try again.
      }
    },
  };
}
