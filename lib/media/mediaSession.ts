import { cdpFetch } from "@/lib/cdp/fetch";
import { onCdpSessionCleared } from "@/lib/cdp/session";

/**
 * The media session: a cookie that lets THIS browser open the app's media, and nobody else's.
 *
 * A picture loads from a plain <img src>, which sends no Authorization header, so a link that opens only
 * for a signed-in person needs a credential the browser attaches by itself. CDP gives one in exchange for
 * the caller's own token (POST /api/v1/media/session): an HttpOnly cookie, scoped to /api/v1/media/view,
 * that lasts about an hour. While it is held, stored media links are shown from that route
 * (lib/media/viewMediaUrl.ts) and a link copied out of the page opens only where someone is signed in.
 *
 * `on` means the cookie is held and views work; `off` means this deployment cannot (the endpoint is not
 * there, or the call failed), and the app keeps drawing from expiring signed links as before; `unknown`
 * is before the first answer. A failure is believed for a minute, then asked again.
 */
export type MediaSessionState = "unknown" | "on" | "off";

const SESSION_PATH = "/api/v1/media/session";
/** Under the cookie's own path, so the browser sends the cookie with it and the session can be ended. */
const SESSION_END_PATH = "/api/v1/media/view/session";

/** A failed attempt is believed this long before the next one. */
export const RETRY_AFTER_MS = 60_000;
/** The cookie is renewed after this share of its life, so a page left open never holds a lapsed one. */
export const RENEW_AT_SHARE = 0.75;
/** The fastest the cookie is renewed, whatever it says about its own life. */
export const MIN_RENEW_MS = 30_000;
export const REQUEST_TIMEOUT_MS = 8_000;

export type MediaSessionDeps = {
  /** Asks the API for the cookie. Resolves to when it lapses; rejects when it cannot be had. */
  open: () => Promise<{ expires_at: string }>;
  /** Takes the cookie back. */
  close: () => Promise<void>;
  now: () => number;
  /** Schedules a renewal; replaceable so a test controls time. */
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  /** Whether there is a browser to hold a cookie at all. */
  hasBrowser: boolean;
};

export function createMediaSession(deps: MediaSessionDeps) {
  let state: MediaSessionState = deps.hasBrowser ? "unknown" : "off";
  let inFlight: Promise<boolean> | null = null;
  let retryNotBefore = 0;
  let renewal: unknown;
  let generation = 0;
  const listeners = new Set<() => void>();

  const set = (next: MediaSessionState) => {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  async function establish(): Promise<boolean> {
    const mine = generation;
    try {
      const answer = await deps.open();
      if (mine !== generation) return state === "on";
      const lapses = Date.parse(answer.expires_at);
      const life = Number.isFinite(lapses) ? lapses - deps.now() : 60 * 60_000;
      if (renewal !== undefined) deps.cancel(renewal);
      renewal = deps.schedule(() => void api.renew(), Math.max(MIN_RENEW_MS, life * RENEW_AT_SHARE));
      set("on");
      return true;
    } catch {
      if (mine !== generation) return state === "on";
      retryNotBefore = deps.now() + RETRY_AFTER_MS;
      set("off");
      return false;
    }
  }

  const api = {
    state: (): MediaSessionState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Makes sure the cookie is held (once, however many ask), and says whether it is. */
    ensure(): Promise<boolean> {
      if (!deps.hasBrowser) return Promise.resolve(false);
      if (state === "on") return Promise.resolve(true);
      if (state === "off" && deps.now() < retryNotBefore) return Promise.resolve(false);
      inFlight ??= establish().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    /** Asks for a new cookie now (it lapsed, or a view answered 401). */
    renew(): Promise<boolean> {
      if (!deps.hasBrowser) return Promise.resolve(false);
      inFlight ??= establish().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    /** Sign-out: take the cookie back and stop renewing it. */
    async end(): Promise<void> {
      generation += 1;
      if (renewal !== undefined) deps.cancel(renewal);
      renewal = undefined;
      inFlight = null;
      set(deps.hasBrowser ? "unknown" : "off");
      await deps.close().catch(() => undefined);
    },
  };
  return api;
}

export const mediaSession = createMediaSession({
  open: () =>
    cdpFetch<{ expires_at: string }>(SESSION_PATH, {
      method: "POST",
      auth: { kind: "auto" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  close: async () => {
    // No token: by the time this runs sign-out has already cleared it. The cookie names the session to end.
    await cdpFetch<void>(SESSION_END_PATH, { method: "DELETE", auth: { kind: "none" } });
  },
  now: () => Date.now(),
  schedule: (run, ms) => {
    const handle = setTimeout(run, ms);
    // A renewal timer must never be what keeps a process alive (it would hold `node --test` open).
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  },
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  hasBrowser: typeof document !== "undefined",
});

// Signing out (or a forced logout) takes the cookie back, so the next person on this browser has none.
if (typeof document !== "undefined") onCdpSessionCleared(() => void mediaSession.end());
