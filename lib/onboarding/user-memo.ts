/**
 * A per-person memo of a backend answer that rarely changes, kept in localStorage.
 *
 * WHY. The onboarding gates and the language seed each asked the backend the same
 * question on every page load, and each kept (or lacked) a browser-wide flag. A
 * browser-wide flag is wrong the moment a second person signs in on the same
 * machine; asking every load is wasted work on the busiest moment of the page.
 * This memo is keyed by the signed-in person (`sub` of the access token) and
 * dropped by sign-out, so it can never answer for somebody else.
 *
 * It is a HINT, never a gate that fails closed: a missing, stale, unreadable or
 * foreign entry is simply a miss and the caller asks the backend as before.
 * Synchronous and tiny on purpose — it runs in the first effects of the shell.
 */

import { getCdpUserId, USER_MEMO_PREFIX } from "@/lib/cdp/session";

export const DAY_MS = 24 * 60 * 60 * 1000;

type Stored<T> = { sub: string; at: number; v: T };

export type MemoEnv = {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  userId?: string | null;
  now?: number;
};

function envStorage(env?: MemoEnv) {
  if (env && "storage" in env) return env.storage ?? null;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // private mode / disabled storage
  }
}

function envUser(env?: MemoEnv) {
  return env && "userId" in env ? (env.userId ?? null) : getCdpUserId();
}

export type MemoRead<T> = { value: T; fresh: boolean } | null;

/**
 * The memoised value for the signed-in person, or null on any miss.
 *
 * `fresh` says whether it is inside `ttlMs`; a stale value is still returned so
 * a caller can render from it and re-verify in the background.
 */
export function readUserMemo<T>(name: string, ttlMs: number, env?: MemoEnv): MemoRead<T> {
  const storage = envStorage(env);
  const sub = envUser(env);
  if (!storage || !sub) return null;
  try {
    const raw = storage.getItem(USER_MEMO_PREFIX + name);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Stored<T>;
    if (entry?.sub !== sub || typeof entry.at !== "number") return null;
    const age = (env?.now ?? Date.now()) - entry.at;
    return { value: entry.v, fresh: age >= 0 && age < ttlMs };
  } catch {
    return null;
  }
}

export function writeUserMemo<T>(name: string, value: T, env?: MemoEnv): void {
  const storage = envStorage(env);
  const sub = envUser(env);
  if (!storage || !sub) return;
  try {
    const entry: Stored<T> = { sub, at: env?.now ?? Date.now(), v: value };
    storage.setItem(USER_MEMO_PREFIX + name, JSON.stringify(entry));
  } catch {
    /* quota / disabled storage — the next load just asks again */
  }
}

export function clearUserMemo(name: string, env?: MemoEnv): void {
  try {
    envStorage(env)?.removeItem(USER_MEMO_PREFIX + name);
  } catch {
    /* ignore */
  }
}
