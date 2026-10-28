import { cdpApiConfig } from "@/config/cdp-api";
import {
  buildCdpHeaders,
  getCdpToken,
} from "@/lib/ai-agent/cluega-session-auth";
import { buildEvent, type EventProps, type QueuedEvent } from "./eventPayload";

// Product-analytics client for the CDP events API (POST /api/v1/events, see
// BACKEND_CLUEGA_CDP docs/product-events-api.md). Events are queued in memory
// and flushed as small batches — the API accepts 1..50 events per request and
// answers 202 fire-and-forget, so a lost batch is acceptable by design and no
// retry/persistence is attempted. `generate_done` is SERVER-owned (media-ai
// emits it at the job's terminal status); the frontend must never send it.
//
// The server drops oversized events per-item (name ≤64 chars, ≤32 prop keys,
// ≤4096B serialized, string values ≤300 chars) without failing the batch, so
// callers can pass props without pre-validating.
//
// Each event also carries the browser's own three ids (see browserIdentity.ts):
// which browser, which visit, and which event. Without them the platform can
// only group activity by logged-in user, so "how many sessions" and "how long
// a visit lasts" have no answer, and a person is indistinguishable from every
// other tab they ever opened.

const MAX_BATCH = 50;
const FLUSH_DELAY_MS = 3000;

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pageHideHooked = false;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    // keepalive lets the final flush survive a page unload (64KB body cap —
    // far above 50 capped events).
    await fetch(`${cdpApiConfig.baseUrl}/api/v1/events`, {
      method: "POST",
      headers: buildCdpHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget: analytics must never surface errors to the user.
  }
  if (queue.length > 0) scheduleFlush();
}

/**
 * Queue one product event. No-op when unauthenticated (the API resolves the
 * tenant from the user JWT) or outside the browser, so it is safe to call from
 * module-level handlers and zustand stores.
 */
export function trackEvent(name: string, props?: EventProps): void {
  if (typeof window === "undefined") return;
  if (!getCdpToken()) return;

  // Built here rather than at flush time; buildEvent says why.
  queue.push(buildEvent(name, props));

  if (!pageHideHooked) {
    pageHideHooked = true;
    // Last-chance flush when the tab is backgrounded/closed.
    window.addEventListener("pagehide", () => void flush());
  }

  if (queue.length >= MAX_BATCH) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
    return;
  }
  scheduleFlush();
}
