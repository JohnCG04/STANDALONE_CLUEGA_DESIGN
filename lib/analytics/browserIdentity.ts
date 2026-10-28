// The browser's own identity, for the product events in productEvents.ts.
//
// Three ids, each answering a question the server cannot answer for itself:
//
//   anonymous_id  WHICH BROWSER. Survives login, logout and reload, so a
//                 person is one actor rather than one per visit. Mid-platform
//                 groups every funnel on actor_key, which is the user id
//                 falling back to this, and it records the pair the first time
//                 an event carries both -- so this id is also what links a
//                 browser to the account it turned out to belong to.
//   session_id    WHICH VISIT. One visit ends after SESSION_IDLE_MS with no
//                 events, which is what makes "sessions" and "events per
//                 session" answerable at all.
//   event_id      WHICH EVENT. The deduplication key in the raw store.
//
// All three are UUIDs. event_id MUST be: mid-platform validates it with a UUID
// parse and refuses the WHOLE event when it fails, so a home-grown id format
// would have every event accepted by CDP, written to its store, and silently
// dropped on the far side.
//
// Nothing here throws. It runs on the path of a user's click, and analytics
// that can break a click is worse than no analytics.

export const ANONYMOUS_ID_KEY = "cluega.anonymous_id";
export const SESSION_KEY = "cluega.analytics_session";

// Thirty minutes of no events ends the visit. The convention every analytics
// product uses, so the numbers are comparable to the ones people already know.
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/** The identifier fields as the events API takes them (snake_case on purpose:
 *  they go straight into the request body). */
export type EventIdentifiers = {
  anonymous_id?: string;
  session_id?: string;
  event_id?: string;
};

type StoredSession = { id: string; lastSeenAt: number };

type MinimalCrypto = {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
};

// Held in memory as well as in storage, so the ids stay stable for the page
// even when storage refuses every write (Safari private mode, a full quota).
let cachedAnonymousId: string | null = null;
let memorySession: StoredSession | null = null;

/** Clears the module's caches. Exported only for tests: they cannot otherwise
 *  start from a browser that has never been seen. */
export function resetForTests(): void {
  cachedAnonymousId = null;
  memorySession = null;
}

/**
 * Returns the ids to attach to one event, omitting any that cannot be produced.
 *
 * Omission is deliberate rather than a fallback to Math.random: a weak
 * generator could hand two people the same anonymous_id, and merging two
 * strangers into one customer is a worse answer than having no funnel for that
 * browser. Mid-platform generates its own event_id when none arrives.
 */
export function eventIdentifiers(): EventIdentifiers {
  // trackEvent is called from module-level handlers and zustand stores, so
  // this runs during SSR whether it wants to or not.
  if (typeof window === "undefined") return {};

  const ids: EventIdentifiers = {};
  const anonymous = anonymousId();
  if (anonymous) ids.anonymous_id = anonymous;
  const session = sessionId();
  if (session) ids.session_id = session;
  const event = uuid();
  if (event) ids.event_id = event;
  return ids;
}

function anonymousId(): string | null {
  if (cachedAnonymousId) return cachedAnonymousId;

  const stored = read(ANONYMOUS_ID_KEY);
  if (stored) {
    cachedAnonymousId = stored;
    return stored;
  }
  const fresh = uuid();
  if (!fresh) return null;
  // A failed write is not a reason to discard the id: it still identifies this
  // page's events consistently, which is strictly better than nothing.
  write(ANONYMOUS_ID_KEY, fresh);
  cachedAnonymousId = fresh;
  return fresh;
}

function sessionId(): string | null {
  const now = Date.now();
  const current = readSession();

  if (current && now - current.lastSeenAt <= SESSION_IDLE_MS) {
    // Moved forward on every event, or a visit longer than the idle window
    // would be cut in two while the person was still working.
    writeSession({ id: current.id, lastSeenAt: now });
    return current.id;
  }
  const fresh = uuid();
  if (!fresh) return null;
  writeSession({ id: fresh, lastSeenAt: now });
  return fresh;
}

function readSession(): StoredSession | null {
  const raw = read(SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredSession;
      if (typeof parsed?.id === "string" && typeof parsed?.lastSeenAt === "number") {
        return parsed;
      }
    } catch {
      // Corrupt or from an older shape: treat it as a new visit rather than
      // losing every event until somebody clears their storage.
    }
  }
  return memorySession;
}

function writeSession(session: StoredSession): void {
  memorySession = session;
  write(SESSION_KEY, JSON.stringify(session));
}

function uuid(): string | null {
  const webCrypto = (globalThis as { crypto?: MinimalCrypto }).crypto;
  if (!webCrypto) return null;
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not, which is the
  // difference between an http dev server and production.
  if (typeof webCrypto.getRandomValues === "function") {
    return v4FromBytes(webCrypto.getRandomValues(new Uint8Array(16)));
  }
  return null;
}

function v4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// Storage access is wrapped rather than checked: reading `localStorage` itself
// throws in a browser configured to block site data, so a typeof guard is not
// enough.
function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Held in memory instead; see cachedAnonymousId.
  }
}
