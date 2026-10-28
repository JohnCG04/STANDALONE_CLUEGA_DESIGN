// An in-memory log of media API calls, for the studio's internal Debug tab.
//
// Ported from avatar-lab's RequestLog, with one addition it did not need: that
// was an operator tool running on the operator's own token, this one runs in a
// customer's browser, so anything that could identify or authenticate them is
// dropped before it is ever stored.
//
// Off by default and recording nothing: `mediaFetch` is on every media request
// in the app, including SSE opens and 30-minute job polls, so when the log is
// disabled it must cost exactly one boolean check.

export const MAX_LOG_ENTRIES = 100;

export type RequestLogEntry = {
  id: number;
  at: number;
  method: string;
  url: string;
  status: number;
  /** ms from request start to response headers. */
  durationMs: number;
  /** Set when the request never produced a response at all. */
  transportError?: string;
};

let enabled = false;
let nextId = 1;
let entries: RequestLogEntry[] = [];
const listeners = new Set<() => void>();

export function isMediaRequestLogEnabled(): boolean {
  return enabled;
}

export function enableMediaRequestLog(value: boolean): void {
  enabled = value;
  notify();
}

/** Query strings can carry artifact ids and search terms; the path is enough. */
function scrubUrl(url: string): string {
  const raw = String(url);
  const cut = raw.indexOf("?");
  return cut === -1 ? raw : `${raw.slice(0, cut)}?…`;
}

export function recordMediaRequest(
  entry: Omit<RequestLogEntry, "id" | "at">,
): void {
  if (!enabled) return;
  const row: RequestLogEntry = {
    ...entry,
    url: scrubUrl(entry.url),
    id: nextId,
    at: Date.now(),
  };
  nextId += 1;
  // Newest first: the call being debugged is the one that just happened.
  entries = [row, ...entries].slice(0, MAX_LOG_ENTRIES);
  notify();
}

export function readMediaRequestLog(): RequestLogEntry[] {
  return entries;
}

export function clearMediaRequestLog(): void {
  entries = [];
  notify();
}

export function subscribeMediaRequestLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function formatLogEntry(entry: RequestLogEntry): string {
  const status = entry.transportError ? `ERR ${entry.transportError}` : entry.status;
  return `${entry.method} ${entry.url} → ${status} (${entry.durationMs}ms)`;
}

/** Test seam: drops all state so one test cannot leak into the next. */
export function resetMediaRequestLog(): void {
  enabled = false;
  entries = [];
  nextId = 1;
  listeners.clear();
}
