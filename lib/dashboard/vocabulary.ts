// Runtime dashboard vocabulary — the front-end does NOT hardcode apps / metrics
// / ranges. The single source of truth is the CDP backend
// (BACKEND_CLUEGA_CDP internal/domain/dashboard_definition.go), served at
// GET /api/v1/dashboard/vocabulary and consumed here at runtime. Adding a metric
// or expanding to a new platform (Meta / Google) is a one-place edit on the
// backend; this module + every consumer adapt with no front-end change.
//
// Widget/chart types are intentionally NOT part of this contract — they are a
// front-end rendering capability (one React component per type), declared in
// types.ts.
import { useEffect, useState } from "react";

import { cdpFetch } from "@/lib/cdp/fetch";
import { toBackendLocale } from "@/lib/ai-agent/cluega-session-auth";
import {
  cachedPreset,
  isFullPreset,
  preloadOwnedPresets,
  resetPresetCache,
  seedPresets,
} from "@/lib/dashboard/presetDetails";

export { isFullPreset };

export interface DashboardMetricMeta {
  key: string;
  good_direction?: "up" | "down";
  format?: string;
  label?: Record<string, string>;
  /** UI-only optgroup key for the metric picker (core / efficiency / … ). */
  group?: string;
  /** False for a ratio or a de-duplicated count: it cannot be summed across rows. */
  additive?: boolean;
  /** What the number is measured in, when the source states it: `currency`, `percent` or `times` (a multiple, printed with an "x"). Absent for a plain count. */
  unit?: string;
  /** The lowest value the metric can take, when the source states it (`0` for an amount or a count). A threshold below it can never be reached. */
  min?: number;
  /** What the source says about reading this metric (a caveat, a scope). A plain string or a string per language. */
  note?: string | VocabularyCopy;
}

/** A string per language, keyed the way the backend serves it. */
export type VocabularyCopy = Partial<Record<"vi" | "en" | "zh", string>>;

export interface DashboardPlatformMeta {
  /** The source slug: a native app (`tiktok_ads`) or `composio:<toolkit>`. */
  app: string;
  metrics: string[];
  /** What the platform is called, per language. Absent when the source did not describe itself. */
  label?: VocabularyCopy;
  /** Range presets this source answers; absent on a backend that does not narrow per platform. */
  ranges?: string[];
}

/** The relative window a preset binding reads, as the data source states it. */
export interface DashboardPresetRange {
  unit: string;
  count?: number;
  offset?: number;
  to_date?: boolean;
  complete_only?: boolean;
  [key: string]: unknown;
}

/** What a preset widget asks its source for. It carries no `source`: the preset's own does. */
export interface DashboardPresetBinding {
  metrics: string[];
  /** Empty for a total; a source-declared dimension key otherwise. */
  dimension?: string;
  compare?: boolean;
  sort?: { metric: string; order: "asc" | "desc" };
  limit?: number;
  grain?: string;
  filters?: Record<string, string[]>;
  range?: DashboardPresetRange;
  level?: string;
}

/** Text a source authored in every language the product speaks. */
export interface DashboardPresetNote {
  /** `unavailable` states why a widget has no live binding; any other kind is a remark. */
  kind: string;
  text: VocabularyCopy;
}

/** One widget of a served board preset. Free-form leaves may be `{vi,en,zh}` text objects. */
export interface DashboardPresetWidget {
  id: string;
  type: string;
  section?: string;
  layout: { x: number; y: number; w: number; h: number };
  /** Absent on a widget the source cannot fill; such a widget carries an `unavailable` note. */
  binding?: DashboardPresetBinding;
  title?: VocabularyCopy;
  subtitle?: VocabularyCopy;
  note?: DashboardPresetNote;
  target?: { metric: string; value: number; label?: VocabularyCopy };
  thresholds?: Record<string, unknown>;
  format_hints?: Record<string, unknown>;
  /** The widget's config without any reading. */
  presentation?: Record<string, unknown>;
  /** The widget's config with sample readings: what a preview draws, never live data. */
  sample?: Record<string, unknown>;
  /** The state the widget starts in (`empty` when bound, `ok` when it carries its own figures). */
  state?: string;
  metadata?: Record<string, unknown>;
}

/** A complete alternate widget list of a preset (`post_run_demo`). */
export interface DashboardPresetVariant {
  id: string;
  label?: VocabularyCopy;
  widgets: DashboardPresetWidget[];
  metadata?: Record<string, unknown>;
  /** Names a demo-preview policy; absence never authorises samples on a live board. */
  sample_policy?: string;
}

/**
 * What the vocabulary carries for one board a data source offers: enough to
 * draw a gallery card, search it and read its product rules, and nothing of the
 * board itself. The widgets, samples and copy tables arrive on demand as a
 * `DashboardPreset` (`presetDetails.ts`, `POST /api/v1/dashboard/presets`).
 */
export interface DashboardPresetSummary {
  /** Also the template id the front end uses. */
  id: string;
  /** The source that serves it (`tiktok_ads`). */
  source: string;
  label: VocabularyCopy;
  description: VocabularyCopy;
  category?: string;
  tags?: string[];
  archetype?: string;
  /** Every platform the board reads; the board is offered only when each is a served source. */
  platforms?: string[];
  /** Every metric key a widget of the board binds or draws, for the gallery search. */
  metric_keys?: string[];
  /** The title of each widget, in widget order, for the gallery search. */
  widget_titles?: Array<VocabularyCopy | null | undefined>;
  /** The card, preview kind, refresh badge, `supported`, `workflows`, `account_policy` and `board` the gallery and the policies read. */
  metadata?: Record<string, unknown>;
}

/** A ready-made board a data source offers, in full: the summary plus every widget. */
export interface DashboardPreset extends DashboardPresetSummary {
  grid?: { columns: number };
  sections?: Array<{ id: string; title: VocabularyCopy; subtitle?: VocabularyCopy }>;
  widgets: DashboardPresetWidget[];
  preview?: { currency?: string; period_label?: VocabularyCopy };
  variants?: DashboardPresetVariant[];
}

export interface DashboardVocabulary {
  apps: string[];
  ranges: string[];
  compare: string[];
  metrics: DashboardMetricMeta[];
  platforms: DashboardPlatformMeta[];
  /** Widget types the AI producer can actually populate with data — a SMALLER
   * set than the types this front-end can render or the CDP will store. Absent
   * on an older backend, which means "cannot narrow here"; see addableWidgets. */
  bindable_widgets?: string[];
  /** Board presets the served sources offer, as summaries (a backend that still serves the whole board sends a full preset here). Absent or empty when no source answered. */
  presets?: Array<DashboardPresetSummary | DashboardPreset>;
}

let cache: DashboardVocabulary | null = null;
let inflight: Promise<DashboardVocabulary> | null = null;

/** The loaded contract, or null before the first successful fetch. */
export function getDashboardVocabulary(): DashboardVocabulary | null {
  return cache;
}

/** Test seam / SSR hydration: inject a known contract without a network call. */
export function setDashboardVocabulary(vocab: DashboardVocabulary | null): void {
  cache = vocab;
  remembered = null;
  resetPresetCache();
  if (vocab) seedPresets(vocab.presets ?? []);
}

export interface VocabularySets {
  apps: Set<string>;
  metrics: Set<string>;
  ranges: Set<string>;
}

/**
 * Membership sets for validation, or null when the contract is not yet loaded.
 * A null result means "cannot check here" — the authoritative guard is
 * server-side (AI CDP producer + CDP validator), so callers treat null as skip
 * rather than reject.
 */
export function vocabularySets(): VocabularySets | null {
  if (!cache) return null;
  return {
    apps: new Set(cache.apps),
    metrics: new Set(cache.metrics.map((m) => m.key)),
    ranges: new Set(cache.ranges),
  };
}

/**
 * Whether the served vocabulary offers `source` — a native app or a
 * `composio:<toolkit>` — as a data source, or null before it has loaded.
 */
export function isServedSource(source: string): boolean | null {
  if (!cache) return null;
  return cache.apps.includes(source) || cache.platforms.some((p) => p.app === source);
}

/** Every source the vocabulary offers: the native `apps` first, then any further platform (`composio:<toolkit>`). */
export function servedSources(vocab: DashboardVocabulary | null = cache): string[] {
  if (!vocab) return [];
  return [...new Set([...vocab.apps, ...vocab.platforms.map((p) => p.app)])];
}

/**
 * The range presets one source answers: its own `ranges` when the vocabulary
 * serves them per platform, else the global list. Null before it has loaded.
 */
export function rangesForSource(source: string): string[] | null {
  if (!cache) return null;
  return cache.platforms.find((p) => p.app === source)?.ranges ?? cache.ranges;
}

/** Metrics applicable to one platform; falls back to all metrics if unknown. */
export function metricsForApp(app: string): string[] {
  const platform = cache?.platforms.find((p) => p.app === app);
  if (platform) return platform.metrics;
  return cache ? cache.metrics.map((m) => m.key) : [];
}

/**
 * The metric a widget should hold for `app`: `current` when the platform
 * exposes it, otherwise that platform's first metric. Returns `current`
 * untouched when the contract has not loaded — there is nothing to narrow
 * against yet, and the server validator stays authoritative.
 *
 * Callers need this because binding.app and binding.metric are two separate
 * controlled vocabularies (PRD §5.2): validateSlot checks metric against the
 * GLOBAL set, so an app×metric pair no connector can serve (tiktok_shop×spend)
 * would otherwise validate clean and leave the widget permanently empty.
 */
export function metricForApp(app: string, current: string): string {
  const allowed = metricsForApp(app);
  if (allowed.length === 0 || allowed.includes(current)) return current;
  return allowed[0];
}

/** The served preset summaries, empty before the vocabulary loads or when no source offered one. */
export function dashboardPresets(): readonly DashboardPresetSummary[] {
  return cache?.presets ?? [];
}

/** One served preset summary by id, or undefined when the vocabulary does not carry it. */
export function dashboardPresetSummaryById(id: string): DashboardPresetSummary | undefined {
  return dashboardPresets().find((p) => p.id === id);
}

/**
 * One preset IN FULL by id — widgets, samples, copy — as far as it is held: the
 * vocabulary of a backend that still serves whole boards, or a preset already
 * loaded by `loadPreset`. Undefined otherwise; a caller that must build a board
 * awaits `loadPreset(id)` first, a component uses `usePreset(id)`.
 */
export function dashboardPresetById(id: string): DashboardPreset | undefined {
  return cachedPreset(id);
}

/** Whether the summary describes a board that draws widgets (a full preset counts its own). */
export function presetSummaryHasWidgets(preset: DashboardPresetSummary): boolean {
  if (isFullPreset(preset)) return preset.widgets.length > 0;
  return (preset.widget_titles?.length ?? 0) > 0 || (preset.metric_keys?.length ?? 0) > 0;
}

/** Whether the source states that `metric` can never be negative (a `min` of 0 or more). */
export function metricIsNonNegative(metric: string): boolean {
  const min = metricMeta(metric)?.min;
  return typeof min === "number" && min >= 0;
}

/** Per-metric metadata (label/format/good_direction) from the contract. */
export function metricMeta(key: string): DashboardMetricMeta | undefined {
  return cache?.metrics.find((m) => m.key === key);
}

/**
 * The metric whose served display name, in ANY of the three languages, is
 * exactly `name` — or undefined when none is, or more than one is. For a board
 * saved before a widget stated its metric keys and kept only their names: an
 * exact match against the vocabulary's own words, never a guess at a phrase.
 */
export function metricKeyForName(name: string | undefined): string | undefined {
  const wanted = name?.trim();
  if (!wanted || !cache) return undefined;
  const hits = cache.metrics.filter((m) => {
    const names = m.label;
    return names && typeof names === "object" && Object.values(names).some((v) => typeof v === "string" && v.trim() === wanted);
  });
  return hits.length === 1 ? hits[0].key : undefined;
}

/**
 * What to CALL a metric on screen — the one answer for every surface (alert
 * sentence, drivers panel, analysis chips, widget picker, shape card).
 *
 * `appLang` is the APP's language code (`vn` | `zh` | `en`) or already a
 * backend one; it always goes through `toBackendLocale`, because the served
 * labels are keyed `{vi, zh, en}` — looking `vn` up directly is how a
 * Vietnamese reader got the English name. Falls back to the served English
 * name, then to the key itself — never a name guessed from the key. Display only:
 * the canonical key is what every rule, binding and request keeps.
 */
export function metricDisplayName(metric: string, appLang: string | null | undefined): string {
  const names = metricMeta(metric)?.label;
  if (names && typeof names === "object") {
    const named = names[toBackendLocale(appLang)] ?? names.en;
    if (typeof named === "string" && named.trim()) return named;
  }
  return metric;
}

/**
 * Which way is GOOD for a metric — the one rule for every delta colour (KPI
 * card, media card) and for the drivers panel.
 *
 * The served vocabulary's word first, then the widget's own declared
 * `good_direction` (a derived metric the vocabulary does not know). When
 * neither says, the answer is `undefined`: the front end holds no knowledge of
 * which metrics are costs, so an unknown metric's move is drawn NEUTRAL rather
 * than guessed green or red (`deltaTone` reads undefined as neutral).
 *
 * `meta` is injectable for callers that already looked the metric up.
 */
export function goodDirectionFor(
  metric: string | undefined,
  declared?: "up" | "down",
  meta: DashboardMetricMeta | undefined = metric ? metricMeta(metric) : undefined,
): "up" | "down" | undefined {
  const served = meta?.good_direction;
  if (served === "up" || served === "down") return served;
  if (declared === "up" || declared === "down") return declared;
  return undefined;
}

/** Read timeout for this one request: a cold backend can take far longer than the 20 s default. */
const VOCABULARY_TIMEOUT_MS = 60_000;
/** Pause before each retry; its length is the number of retries after the first attempt. */
const VOCABULARY_RETRY_DELAYS_MS = [1_000, 3_000, 8_000];
/** How long a failed load, or an empty answer, is remembered before a render or mount may ask again. */
const VOCABULARY_COOLDOWN_MS = 30_000;

/** What the last settled-but-unusable load left behind: its failure (or none, for an empty answer) and until when it stands. */
let remembered: { until: number; error?: { reason: unknown } } | null = null;

/**
 * Bumped by `resetDashboardVocabularyForTests`: a load started under an older
 * epoch stops at its next step and must not write the cache or the failure memory.
 */
let epoch = 0;
/** Retry pauses currently waiting, so a reset can end them rather than leave the ladder sleeping. */
const pendingSleeps = new Set<{ timer: ReturnType<typeof setTimeout>; wake: () => void }>();

/** A pause that never keeps a Node process alive, and that a reset can cut short. */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const entry = {
      timer: setTimeout(() => {
        pendingSleeps.delete(entry);
        resolve();
      }, ms),
      wake: resolve,
    };
    (entry.timer as { unref?: () => void }).unref?.();
    pendingSleeps.add(entry);
  });

/**
 * Test seam: forget the contract, the failure memory and any load in flight.
 * A retry ladder still asleep is woken and ends without touching the module
 * again, so nothing from one test can run into the next.
 */
export function resetDashboardVocabularyForTests(): void {
  epoch++;
  for (const entry of [...pendingSleeps]) {
    clearTimeout(entry.timer);
    entry.wake();
  }
  pendingSleeps.clear();
  cache = null;
  inflight = null;
  remembered = null;
  resetPresetCache();
}

/**
 * A contract that answered with no platform and no preset is a source that was
 * still starting, not a settled answer: it is kept for the reads that need
 * something, but the next caller asks again rather than treating it as final.
 */
export function isDashboardVocabularyServed(vocab: DashboardVocabulary | null = cache): boolean {
  return !!vocab && ((vocab.platforms?.length ?? 0) > 0 || (vocab.presets?.length ?? 0) > 0);
}

/** Wait for the shared request, but stop waiting (not the request) when this caller aborts. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Fetch once and memoize. Concurrent callers share one in-flight request, which
 * retries a failed or timed-out load with growing pauses and logs each failure.
 * The request belongs to the module, not to any caller: a caller's `signal` only
 * ends that caller's wait, so an unmounting component can neither kill the load
 * for the others nor start another. A failure is not remembered past its
 * request alone: a load that failed after its retries, and an empty answer, are
 * remembered for `VOCABULARY_COOLDOWN_MS`, so a render or mount does not ask
 * again (and re-run the retry ladder) every time. `{ force: true }` bypasses
 * that memory once and is for an explicit Retry button only.
 * `retryDelaysMs` is a test seam.
 */
export async function fetchDashboardVocabulary(
  arg?: AbortSignal | { signal?: AbortSignal; force?: boolean },
  retryDelaysMs: readonly number[] = VOCABULARY_RETRY_DELAYS_MS,
): Promise<DashboardVocabulary> {
  const isSignal = !!arg && "aborted" in arg;
  const signal = arg ? (isSignal ? (arg as AbortSignal) : (arg as { signal?: AbortSignal }).signal) : undefined;
  const force = !!arg && !isSignal && !!(arg as { force?: boolean }).force;
  if (cache && isDashboardVocabularyServed(cache)) return cache;
  if (force) remembered = null;
  if (!inflight && remembered && Date.now() < remembered.until) {
    if (remembered.error) throw remembered.error.reason;
    if (cache) return cache;
  }
  if (!inflight) {
    const startedIn = epoch;
    const cancelled = () => new Error("dashboard vocabulary load cancelled");
    const run: { promise?: Promise<DashboardVocabulary> } = {};
    run.promise = (async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const vocab = await cdpFetch<DashboardVocabulary>("/api/v1/dashboard/vocabulary", {
              method: "GET",
              timeoutMs: VOCABULARY_TIMEOUT_MS,
            });
            if (epoch !== startedIn) throw cancelled();
            cache = vocab;
            seedPresets(vocab.presets ?? []);
            remembered = isDashboardVocabularyServed(vocab) ? null : { until: Date.now() + VOCABULARY_COOLDOWN_MS };
            // The boards the front end lays out itself (an `account_policy`) are
            // built from inside synchronous stream and history paths, so their
            // full preset is fetched now, in one request, rather than at the
            // moment a board arrives.
            preloadOwnedPresets(vocab.presets ?? []);
            return vocab;
          } catch (err) {
            if (epoch !== startedIn) throw cancelled();
            const delay = retryDelaysMs[attempt];
            console.warn(
              `[dashboard] vocabulary load failed (attempt ${attempt + 1})${delay === undefined ? "; giving up" : `; retrying in ${delay} ms`}`,
              err,
            );
            if (delay === undefined) {
              remembered = { until: Date.now() + VOCABULARY_COOLDOWN_MS, error: { reason: err } };
              throw err;
            }
            await sleep(delay);
            if (epoch !== startedIn) throw cancelled();
          }
        }
      } finally {
        if (inflight === run.promise) inflight = null;
      }
    })();
    inflight = run.promise;
  }
  return waitFor(inflight, signal);
}

/**
 * Whether the contract has loaded, fetching it on mount if not. A component
 * that reads `metricMeta` renders before it lands and again after.
 */
export function useDashboardVocabularyReady(): boolean {
  const [ready, setReady] = useState(() => cache !== null);
  useEffect(() => {
    if (isDashboardVocabularyServed()) return;
    let alive = true;
    void fetchDashboardVocabulary()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}
