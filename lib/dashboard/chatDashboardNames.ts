import { create } from "zustand";

/**
 * The saved name of each chat session's dashboard, as the server last reported
 * it: session id → { id, name } of the record filed under that session's slug.
 *
 * The chat card and panel used to title a board from the SESSION alone
 * (`chatDashboardTitleFromSession`). That string only seeds the record's name
 * on first create, so a rename from /app/dashboards reached the menu, the
 * detail page and the share page but never the conversation (BUG-45-RD-N-10).
 * This registry is what the chat reads instead, falling back to the session
 * title only while no saved name is known.
 *
 * Fed by every write that returns the record (upsert, rename — see api.ts) and
 * by the read a conversation makes when it opens (useCluegaAiChatStore), so a
 * rename made on another page is already here when the reader comes back.
 * Its own tiny store rather than a field of the chat store, so the dashboards
 * API module can write it without importing the whole chat.
 *
 * Every change is also broadcast to the browser's other tabs. Each tab holds
 * its own copy, and a conversation already open in one tab does not re-read
 * its board when the rename happens in another — without this it kept the old
 * title until the reader reloaded or switched conversations.
 */
interface SavedChatDashboard {
  id: string;
  name: string;
}

interface ChatDashboardNamesState {
  bySession: Record<string, SavedChatDashboard>;
}

export const useChatDashboardNames = create<ChatDashboardNamesState>(() => ({
  bySession: {},
}));

type ChatDashboardRecord = {
  id: string;
  name: string;
  source_session_id?: string | null;
};

type ChatDashboardNamesMessage =
  | { kind: "note"; record: ChatDashboardRecord }
  | { kind: "forget"; dashboardId: string };

const CHANNEL_NAME = "cluega:chat-dashboard-names";

/** Post to every other tab. A channel per message, closed at once: posting
 * enqueues the message for every listener before the close, and no channel is
 * left open to keep a page — or a test process — alive. */
function tellOtherTabs(message: ChatDashboardNamesMessage): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

/** Apply the other tabs' changes to this one until the returned function is
 * called. Owned by the page that shows chat boards, which is the only reader
 * that needs them; a page that only renames boards has nothing to update. */
export function listenForChatDashboardNames(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<ChatDashboardNamesMessage>) => {
    // Applied, never re-broadcast: every tab hears the sender directly.
    if (event.data.kind === "note") recordName(event.data.record);
    else if (event.data.kind === "forget") dropDashboard(event.data.dashboardId);
  };
  return () => channel.close();
}

function sessionOf(dashboardId: string): string | undefined {
  return Object.entries(useChatDashboardNames.getState().bySession).find(
    ([, saved]) => saved.id === dashboardId,
  )?.[0];
}

/** Record what the server says a session's board is called, here and in every
 * other tab. A record saved before `source_session_id` existed carries none;
 * it is matched by id to the conversation that already read it under its
 * session slug. A record known to no conversation (a menu-made board) is
 * ignored. */
export function noteChatDashboardName(record: ChatDashboardRecord): void {
  recordName(record);
  // The raw record, not the resolved session: a legacy record is matched by id
  // against the RECEIVING tab's entries, which this tab may not hold.
  tellOtherTabs({
    kind: "note",
    record: { id: record.id, name: record.name, source_session_id: record.source_session_id },
  });
}

function recordName(record: ChatDashboardRecord): void {
  const sessionId = record.source_session_id || sessionOf(record.id);
  if (!sessionId || !record.name) return;
  const known = useChatDashboardNames.getState().bySession[sessionId];
  if (known?.id === record.id && known.name === record.name) return;
  useChatDashboardNames.setState((state) => ({
    bySession: {
      ...state.bySession,
      [sessionId]: { id: record.id, name: record.name },
    },
  }));
}

/** The session has no saved board (any more): its chat goes back to the
 * session title. Local only — it answers a read this tab made, which any
 * other tab showing that conversation makes for itself. */
export function forgetChatDashboardSession(sessionId: string): void {
  if (!useChatDashboardNames.getState().bySession[sessionId]) return;
  useChatDashboardNames.setState((state) => {
    const { [sessionId]: _dropped, ...rest } = state.bySession;
    return { bySession: rest };
  });
}

/** A board was deleted: whichever conversation it was filed for loses the
 * name, in every tab. */
export function forgetChatDashboard(dashboardId: string): void {
  dropDashboard(dashboardId);
  tellOtherTabs({ kind: "forget", dashboardId });
}

function dropDashboard(dashboardId: string): void {
  const sessionId = sessionOf(dashboardId);
  if (sessionId) forgetChatDashboardSession(sessionId);
}
