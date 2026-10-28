import { TITLE_CAP } from "./constants";
import type {
  JobEvent,
  StoredConversation,
  StoredMessage,
  WireConversation,
  WireMessage,
} from "./types";

export const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Whether a planned document actually changes the canvas. */
export function hasGraph(document: unknown): boolean {
  const d = (document ?? {}) as {
    nodes?: unknown[];
    updates?: unknown[];
    edges?: unknown[];
  };
  return Boolean(
    d.nodes?.length || d.updates?.length || d.edges?.length,
  );
}

/**
 * Unwrap one SSE frame into the event the mapper reads.
 * media-ai sends `{type, data, ts}` as the body; the frame's `event:` name is authoritative.
 */
export function toJobEvent(name: string, payload: string): JobEvent | null {
  try {
    const parsed = JSON.parse(payload) as { data?: unknown };
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? ((parsed.data as Record<string, unknown> | undefined) ?? {})
        : {};
    return { type: name, data };
  } catch {
    return null;
  }
}

/** Split a turn into the fields the server indexes and a `body` it only carries. */
export function toWire(m: StoredMessage): WireMessage {
  const { id, role, text, ...rest } = m;
  const body = Object.keys(rest).length ? (rest as Record<string, unknown>) : undefined;
  return { id, role, text, ...(body ? { body } : {}) };
}

function fromWire(m: WireMessage): StoredMessage {
  return { id: m.id, role: m.role, text: m.text, ...(m.body ?? {}) };
}

export function toStored(c: WireConversation): StoredConversation {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    summarizedCount: c.summarized_count,
    updatedAt: c.updated_at ?? 0,
    messages: (c.messages ?? []).map(fromWire),
  };
}

/**
 * A thread's title from the USER's first turn; the assistant's opener is often a question.
 * The server derives one too; this one shows the moment a thread is saved.
 */
export function titleFrom(messages: readonly StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user" && m.text.trim());
  const text = first?.text.trim().replace(/\s+/g, " ") ?? "";
  if (!text) return "";
  return text.length > TITLE_CAP ? `${text.slice(0, TITLE_CAP)}…` : text;
}
