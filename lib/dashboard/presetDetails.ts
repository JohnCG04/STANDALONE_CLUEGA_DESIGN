// The full presets the vocabulary no longer carries.
//
// `GET /api/v1/dashboard/vocabulary` serves each preset as a SUMMARY (name,
// card, metric keys, widget titles, product rules). The board itself — widgets,
// sample readings, variants, copy tables — is fetched here, by id, with
// `POST /api/v1/dashboard/presets`, and held for the session.
//
// Why a store and not a fetch per component: a gallery grid asks for dozens of
// boards at once and the gateway allows 30 requests a minute per user. Ids
// asked for in the same moment leave as ONE request (at most 50 ids each), a
// preset already held is never asked for again, and two callers wanting the
// same one share one request.
//
// The request belongs to this module, not to a component: a card that scrolls
// away or unmounts cannot cancel the load the others are waiting on (the same
// rule as `fetchDashboardVocabulary`).
//
// This module reads `vocabulary.ts` for TYPES only, so `vocabulary.ts` can
// import it without a cycle.
import { useEffect, useSyncExternalStore } from "react";

import { cdpFetch } from "@/lib/cdp/fetch";
import type { DashboardPreset, DashboardPresetSummary } from "@/lib/dashboard/vocabulary";

/** The most ids one request may carry (the server rejects more). */
export const PRESET_BATCH_LIMIT = 50;

/** Timings, mutable only so a test need not wait them out. */
export const presetLoaderConfig = {
  /** How long ids asked for one after another are gathered into one request. */
  batchWindowMs: 25,
  /** The pause before the one retry of a failed request. */
  retryDelayMs: 1_000,
  /** How long an id that failed for good answers "failed" without a new request. */
  failureCooldownMs: 30_000,
  timeoutMs: 30_000,
};

interface PresetsResponse {
  presets?: unknown;
  missing?: unknown;
}

const held = new Map<string, DashboardPreset>();
/** Ids the server said it does not have. Not asked for again this session. */
const absent = new Set<string>();
/** Ids whose request failed twice, with when. */
const failedAt = new Map<string, number>();
/** Ids asked for since the last flush, and who is waiting on each. */
const queued = new Map<string, Array<(preset: DashboardPreset | undefined) => void>>();
const inflight = new Map<string, Promise<DashboardPreset | undefined>>();
let timer: ReturnType<typeof setTimeout> | null = null;

let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version++;
  for (const listener of [...listeners]) listener();
}

/** A pause that never keeps a Node process alive. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    (setTimeout(resolve, ms) as { unref?: () => void }).unref?.();
  });

/** Whether a served preset carries its board (a backend that still serves whole presets sends these in the vocabulary). */
export function isFullPreset(preset: DashboardPresetSummary): preset is DashboardPreset {
  return Array.isArray((preset as { widgets?: unknown }).widgets);
}

/** The preset in full, when it is held. */
export function cachedPreset(id: string): DashboardPreset | undefined {
  return held.get(id);
}

/** Hold every preset of `list` that arrived in full. */
export function seedPresets(list: ReadonlyArray<DashboardPresetSummary>): void {
  let added = false;
  for (const preset of list) {
    if (!isFullPreset(preset)) continue;
    held.set(preset.id, preset);
    absent.delete(preset.id);
    failedAt.delete(preset.id);
    added = true;
  }
  if (added) changed();
}

/** Forget everything held (a test seam, and a new vocabulary being set). */
export function resetPresetCache(): void {
  held.clear();
  absent.clear();
  failedAt.clear();
  if (version > 0 || listeners.size > 0) changed();
}

/** Start loading the presets whose board the front end builds itself (an `account_policy`), which synchronous stream and history paths need already held. */
export function preloadOwnedPresets(list: ReadonlyArray<DashboardPresetSummary>): void {
  const ids = list
    .filter((preset) => !isFullPreset(preset) && isRecord(preset.metadata?.account_policy))
    .map((preset) => preset.id);
  if (ids.length > 0) void loadPresets(ids);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestChunk(ids: string[]): Promise<PresetsResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await cdpFetch<PresetsResponse>("/api/v1/dashboard/presets", {
        method: "POST",
        body: { ids },
        timeoutMs: presetLoaderConfig.timeoutMs,
      });
    } catch (err) {
      console.warn(
        `[dashboard] preset load failed for ${ids.length} id(s) (attempt ${attempt + 1})${attempt === 0 ? "; retrying once" : "; giving up"}`,
        err,
      );
      if (attempt >= 1) throw err;
      await sleep(presetLoaderConfig.retryDelayMs);
    }
  }
}

async function loadChunk(ids: string[]): Promise<void> {
  const waiters = new Map(ids.map((id) => [id, queued.get(id) ?? []] as const));
  for (const id of ids) queued.delete(id);
  const settle = (id: string, preset: DashboardPreset | undefined) => {
    inflight.delete(id);
    for (const resolve of waiters.get(id) ?? []) resolve(preset);
  };
  try {
    const body = await requestChunk(ids);
    const wanted = new Set(ids);
    const list = Array.isArray(body?.presets) ? (body.presets as DashboardPresetSummary[]) : [];
    for (const preset of list) {
      if (isRecord(preset) && typeof preset.id === "string" && isFullPreset(preset)) {
        held.set(preset.id, preset);
        absent.delete(preset.id);
        failedAt.delete(preset.id);
      }
    }
    const missing = Array.isArray(body?.missing) ? (body.missing as unknown[]).filter((m): m is string => typeof m === "string") : [];
    // Asked for and neither served nor named missing is as good as missing: the
    // server has no such board, and asking again would not change that.
    for (const id of ids) if (!held.has(id)) absent.add(id);
    if (missing.length > 0) console.warn("[dashboard] presets not found:", missing.filter((id) => wanted.has(id)));
  } catch {
    // `requestChunk` has logged it; these ids answer "failed" for a while.
    for (const id of ids) failedAt.set(id, Date.now());
  }
  for (const id of ids) settle(id, held.get(id));
  changed();
}

function flush(): void {
  timer = null;
  const ids = [...queued.keys()];
  for (let at = 0; at < ids.length; at += PRESET_BATCH_LIMIT) {
    void loadChunk(ids.slice(at, at + PRESET_BATCH_LIMIT));
  }
}

/**
 * One preset in full, or undefined when it cannot be had (the server does not
 * have it, or the request failed). Never rejects. Ids asked for within
 * `batchWindowMs` of each other share one request.
 */
export function loadPreset(id: string): Promise<DashboardPreset | undefined> {
  const hit = held.get(id);
  if (hit) return Promise.resolve(hit);
  if (!id || absent.has(id)) return Promise.resolve(undefined);
  const failed = failedAt.get(id);
  if (failed !== undefined) {
    if (Date.now() - failed < presetLoaderConfig.failureCooldownMs) return Promise.resolve(undefined);
    failedAt.delete(id);
  }
  const pending = inflight.get(id);
  if (pending) return pending;
  const promise = new Promise<DashboardPreset | undefined>((resolve) => {
    queued.set(id, [resolve]);
  });
  inflight.set(id, promise);
  if (!timer) timer = setTimeout(flush, presetLoaderConfig.batchWindowMs);
  return promise;
}

/** The presets of `ids` that could be had, in the order asked. */
export async function loadPresets(ids: readonly string[]): Promise<DashboardPreset[]> {
  const unique = [...new Set(ids)];
  const found = await Promise.all(unique.map((id) => loadPreset(id)));
  return found.filter((preset): preset is DashboardPreset => preset !== undefined);
}

/**
 * Why one id is or is not held, for a caller that awaited `loadPreset` and got undefined:
 * "absent" (the server has no such preset), "failed" (asked and failed, recently) or "unknown".
 */
export function presetLoadState(id: string): "ready" | "absent" | "failed" | "unknown" {
  if (held.has(id)) return "ready";
  if (absent.has(id)) return "absent";
  if (failedAt.has(id)) return "failed";
  return "unknown";
}

/** An explicit Retry only: forget one id's recent failure so the next load asks again. */
export function forgetPresetFailure(id: string): void {
  failedAt.delete(id);
}

export type PresetStatus = "idle" | "loading" | "ready" | "failed";

function stateOf(id: string): "ready" | "failed" | "pending" {
  if (held.has(id)) return "ready";
  if (absent.has(id)) return "failed";
  const failed = failedAt.get(id);
  if (failed !== undefined && Date.now() - failed < presetLoaderConfig.failureCooldownMs) return "failed";
  return "pending";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentVersion = () => version;

function statusOf(ids: readonly string[], enabled: boolean): PresetStatus {
  if (ids.length === 0) return "idle";
  const states = ids.map(stateOf);
  if (states.every((s) => s === "ready")) return "ready";
  if (states.includes("failed")) return "failed";
  return enabled ? "loading" : "idle";
}

function useLoadOnMount(ids: readonly string[], enabled: boolean): void {
  useSyncExternalStore(subscribe, currentVersion, currentVersion);
  const key = ids.join("\u0000");
  useEffect(() => {
    if (!enabled || !key) return;
    void loadPresets(key.split("\u0000"));
  }, [enabled, key]);
}

/** One full preset by id. The preset is the same object on every render once loaded. */
export function usePreset(
  id: string | null | undefined,
  enabled = true,
): { preset: DashboardPreset | undefined; status: PresetStatus } {
  const ids = id ? [id] : [];
  useLoadOnMount(ids, enabled);
  return { preset: id ? held.get(id) : undefined, status: statusOf(ids, enabled) };
}
