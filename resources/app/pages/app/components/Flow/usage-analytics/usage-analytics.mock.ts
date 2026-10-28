// The seeded mock behind `defaultUsageAnalyticsSource` while the usage
// endpoints do not exist. Every endpoint derives from ONE generated ledger of
// events, so the stat cards, both charts, the ranking and the table can never
// disagree with each other — the invariant the PRD calls its most important
// constraint. Payloads are built wire-shaped and routed through the service's
// real normalizers, so those run from day one.
//
// Deterministic on purpose: same seed + same end date ⇒ the same ledger, byte
// for byte. No Date.now()/Math.random() inside the generator.

import { delay } from "@/lib/delay";
import { toIsoDate } from "@/lib/flow/usage-analytics/timeRange";

import {
  GENERATIONS_PAGE_SIZE,
  normalizeCreditsSummary,
  normalizeFacets,
  normalizeGeneration,
  normalizeModelSeries,
  normalizeModelTotal,
  normalizeOverview,
  paginationFallback,
  type CreditsSummaryDayWire,
  type GenerationPlatform,
  type GenerationWire,
  type ListGenerationsParams,
  type ListGenerationsResult,
  type ModelUsageSeriesWire,
  type UsageAnalyticsSource,
  type UsageRangeParams,
  type UsageSeriesFilters,
} from "./usage-analytics.service";

/** mulberry32 — a tiny deterministic PRNG. Exported so the tests can assert
 *  the stream itself when a generation bug needs pinning down. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type MockModelKind = "image" | "video" | "chat";

export interface MockModel {
  id: string;
  name: string;
  /** Roulette weight — sets the ranking the mockup shows (Happy Horse on top). */
  weight: number;
  /** Credits one job costs, before jitter. */
  cost: number;
  kind: MockModelKind;
}

// Two deliberately low-usage models at the tail so the chart legend has a
// "+n more" group to exercise (US-02).
export const MOCK_MODELS: readonly MockModel[] = [
  { id: "happy-horse", name: "Happy Horse", weight: 0.32, cost: 45, kind: "image" },
  { id: "nano-banana-pro", name: "Nano Banana Pro", weight: 0.16, cost: 45, kind: "image" },
  { id: "flux-2-pro", name: "Flux.2 Pro", weight: 0.12, cost: 24, kind: "image" },
  { id: "gpt-image-2", name: "GPT Image 2", weight: 0.1, cost: 45, kind: "image" },
  { id: "chatgpt-1-5", name: "Chatgpt 1.5", weight: 0.09, cost: 15, kind: "chat" },
  { id: "nano-banana-2", name: "Nano Banana 2", weight: 0.08, cost: 42, kind: "image" },
  { id: "wan-2-5", name: "Wan 2.5", weight: 0.07, cost: 80, kind: "video" },
  { id: "kling-lite", name: "Kling Lite", weight: 0.06, cost: 60, kind: "video" },
];

export const MOCK_FEATURES: readonly { id: string; name: string }[] = [
  { id: "image-generation", name: "Image Generation" },
  { id: "video-generation", name: "Video Generation" },
  { id: "upscale", name: "Upscale" },
  { id: "background-removal", name: "Background Removal" },
  { id: "chat", name: "Chat" },
];

export const MOCK_USERS: readonly { id: string; name: string; weight: number }[] = [
  { id: "user-yuki", name: "Yuki", weight: 0.55 },
  { id: "user-judy", name: "Judy", weight: 0.2 },
  { id: "user-mark", name: "Mark", weight: 0.15 },
  { id: "user-lam", name: "Lam", weight: 0.1 },
];

const PLATFORMS: readonly { id: GenerationPlatform; weight: number }[] = [
  { id: "web", weight: 0.7 },
  { id: "api", weight: 0.2 },
  { id: "mobile", weight: 0.1 },
];

type CreditSource = "topup" | "subscription" | "community" | "expired";

const CREDIT_ROW_LABELS: Record<CreditSource, string> = {
  topup: "Topup Credits",
  subscription: "Subscription Credits",
  community: "Community Credits",
  expired: "Credits Expired",
};

export type MockLedgerEvent =
  | {
      kind: "job";
      id: string;
      /** Local `YYYY-MM-DD` bucket every aggregate groups by. */
      date: string;
      completedAt: string;
      modelId: string;
      modelName: string;
      featureId: string;
      featureName: string;
      userId: string;
      userName: string;
      platform: GenerationPlatform;
      status: "completed" | "failed" | "processing";
      creditOutcome: "charged" | "refunded" | "free";
      /** ≤ 0 — what the job deducted (0 when refunded or still processing). */
      credits: number;
    }
  | {
      kind: "credit";
      id: string;
      date: string;
      completedAt: string;
      source: CreditSource;
      /** Positive for additions, negative for expiry. */
      credits: number;
    };

function pickWeighted<T extends { weight: number }>(options: readonly T[], roll: number): T {
  let cursor = roll;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor < 0) return option;
  }
  return options[options.length - 1];
}

function featureFor(kind: MockModelKind, roll: number): { id: string; name: string } {
  if (kind === "chat") return MOCK_FEATURES[4];
  if (kind === "video") return MOCK_FEATURES[1];
  if (roll < 0.7) return MOCK_FEATURES[0];
  return roll < 0.85 ? MOCK_FEATURES[2] : MOCK_FEATURES[3];
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Every `YYYY-MM-DD` from `startIso` to `endIso`, inclusive. */
export function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * The one ledger everything derives from: `dayCount` days of jobs plus the
 * credit events (subscription grants, topups, community rewards, one expiry)
 * that give Credits Summary all four sources. Pure — same inputs, same output.
 */
export function buildUsageLedger(
  seed: number,
  endDate: Date,
  dayCount = 60,
): MockLedgerEvent[] {
  const rand = mulberry32(seed);
  const events: MockLedgerEvent[] = [];
  let sequence = 0;

  const stamp = (date: string) => {
    const hh = String(8 + Math.floor(rand() * 12)).padStart(2, "0");
    const mm = String(Math.floor(rand() * 60)).padStart(2, "0");
    return `${date}T${hh}:${mm}:00Z`;
  };

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const day = new Date(endDate);
    day.setDate(day.getDate() - (dayCount - 1 - dayIndex));
    const date = toIsoDate(day);
    const isLastDay = dayIndex === dayCount - 1;

    // One heavy day mid-history gives the usage chart the spike the mockup
    // shows; the rest wander between quiet and busy.
    const isSpikeDay = dayIndex === dayCount - 25;
    const jobCount = (2 + Math.floor(rand() * 7)) * (isSpikeDay ? 3 : 1);

    for (let jobIndex = 0; jobIndex < jobCount; jobIndex += 1) {
      const model = pickWeighted(MOCK_MODELS, rand());
      const feature = featureFor(model.kind, rand());
      const user = pickWeighted(MOCK_USERS, rand());
      const platform = pickWeighted(PLATFORMS, rand()).id;
      const cost = Math.max(1, Math.round(model.cost * (0.9 + rand() * 0.2)));

      const failed = rand() < 0.08;
      const refunded = failed && rand() < 0.5;
      // The newest job of the final day is still running — the PRD's
      // "job đang chạy dở" edge case, held credits shown as 0, not a charge.
      const processing = isLastDay && jobIndex === jobCount - 1;

      sequence += 1;
      events.push({
        kind: "job",
        id: `job-${sequence}`,
        date,
        completedAt: stamp(date),
        modelId: model.id,
        modelName: model.name,
        featureId: feature.id,
        featureName: feature.name,
        userId: user.id,
        userName: user.name,
        platform,
        status: processing ? "processing" : failed ? "failed" : "completed",
        creditOutcome: processing ? "free" : refunded ? "refunded" : "charged",
        credits: processing || refunded ? 0 : -cost,
      });
    }

    // Subscription grant on the first and last stretch — the mockup's tall
    // "3,000 added" bar sits on the most recent day.
    if (dayIndex === 0 || isLastDay) {
      sequence += 1;
      events.push({
        kind: "credit",
        id: `credit-${sequence}`,
        date,
        completedAt: stamp(date),
        source: "subscription",
        credits: 3000,
      });
    }

    if (rand() < 0.07) {
      sequence += 1;
      events.push({
        kind: "credit",
        id: `credit-${sequence}`,
        date,
        completedAt: stamp(date),
        source: "topup",
        credits: [500, 1000, 2000][Math.floor(rand() * 3)],
      });
    }

    if (rand() < 0.05) {
      sequence += 1;
      events.push({
        kind: "credit",
        id: `credit-${sequence}`,
        date,
        completedAt: stamp(date),
        source: "community",
        credits: 100 + Math.floor(rand() * 3) * 100,
      });
    }

    if (dayIndex === dayCount - 22) {
      sequence += 1;
      events.push({
        kind: "credit",
        id: `credit-${sequence}`,
        date,
        completedAt: stamp(date),
        source: "expired",
        credits: -(300 + Math.floor(rand() * 200)),
      });
    }
  }

  return events;
}

export interface MockUsageAnalyticsOptions {
  seed?: number;
  /** Injectable clock — the ledger's final day. Tests pin it; the app takes today. */
  now?: () => Date;
  /** Simulated latency per call; 0 in tests. */
  latencyMs?: number;
  dayCount?: number;
  /** `new-account` answers every read with nothing — the US-01 empty state. */
  scenario?: "active" | "new-account";
}

const DEFAULT_SEED = 20260827;
const DEFAULT_LATENCY_MS = 450;

function inWindow(date: string, start: string | null, end: string): boolean {
  // YYYY-MM-DD compares correctly as a string; no Date parsing (and no
  // timezone) needed at the boundary.
  return (start === null || date >= start) && date <= end;
}

type JobEvent = Extract<MockLedgerEvent, { kind: "job" }>;

function matchesSeriesFilters(job: JobEvent, filters: UsageSeriesFilters): boolean {
  if (filters.user_ids?.length && !filters.user_ids.includes(job.userId)) return false;
  if (filters.feature_ids?.length && !filters.feature_ids.includes(job.featureId)) return false;
  if (filters.model_ids?.length && !filters.model_ids.includes(job.modelId)) return false;
  return true;
}

/** What a job deducted, as a positive number. Only charged jobs consume. */
function consumed(job: JobEvent): number {
  return job.creditOutcome === "charged" ? -job.credits : 0;
}

function toGenerationWire(event: MockLedgerEvent): GenerationWire {
  if (event.kind === "job") {
    return {
      id: event.id,
      completed_at: event.completedAt,
      model_id: event.modelId,
      model_name: event.modelName,
      feature_id: event.featureId,
      feature_name: event.featureName,
      status: event.status,
      user_id: event.userId,
      user_name: event.userName,
      credits: event.credits,
      credit_outcome: event.creditOutcome,
      platform: event.platform,
    };
  }
  // A pure credit movement renders like the mockup's "Subscription Credits"
  // and "Credits Expired" rows: no model, the source as the feature label, and
  // the system as the actor. Empty ids keep facet filters from matching them.
  return {
    id: event.id,
    completed_at: event.completedAt,
    model_id: "",
    model_name: "",
    feature_id: "",
    feature_name: CREDIT_ROW_LABELS[event.source],
    status: "completed",
    user_id: "",
    user_name: "Cluega AI",
    credits: event.credits,
    credit_outcome: "free",
    platform: "web",
  };
}

export function createMockUsageAnalyticsSource(
  options: MockUsageAnalyticsOptions = {},
): UsageAnalyticsSource {
  const {
    seed = DEFAULT_SEED,
    now,
    latencyMs = DEFAULT_LATENCY_MS,
    dayCount = 60,
    scenario = "active",
  } = options;

  // Built on first use, not at module load: `now` must be read when the page
  // asks, and the default source is created as a module constant.
  let ledger: MockLedgerEvent[] | null = null;
  const readLedger = (): MockLedgerEvent[] => {
    if (ledger === null) {
      ledger =
        scenario === "new-account"
          ? []
          : buildUsageLedger(seed, now?.() ?? new Date(), dayCount);
    }
    return ledger;
  };

  const settle = (signal?: AbortSignal) =>
    latencyMs > 0 ? delay(latencyMs, signal) : Promise.resolve();

  const windowEvents = (range: UsageRangeParams): MockLedgerEvent[] =>
    readLedger().filter((event) => inWindow(event.date, range.start_date, range.end_date));

  const windowJobs = (
    range: UsageRangeParams,
    filters: UsageSeriesFilters = {},
  ): JobEvent[] =>
    windowEvents(range).filter(
      (event): event is JobEvent =>
        event.kind === "job" && matchesSeriesFilters(event, filters),
    );

  /** The dates the series/summary enumerate: the requested window, with an
   *  open start bounded by the earliest event actually in the ledger. */
  const windowDates = (range: UsageRangeParams): string[] => {
    const start =
      range.start_date ??
      readLedger().reduce<string | null>(
        (min, event) => (min === null || event.date < min ? event.date : min),
        null,
      );
    if (!start || start > range.end_date) return [];
    return enumerateDates(start, range.end_date);
  };

  return {
    async getOverview(params) {
      await settle(params.signal);
      const events = windowEvents(params);
      const jobs = events.filter((event): event is JobEvent => event.kind === "job");
      const creditsIn = events.reduce(
        (sum, event) =>
          event.kind === "credit" && event.credits > 0 ? sum + event.credits : sum,
        0,
      );
      const expired = events.reduce(
        (sum, event) =>
          event.kind === "credit" && event.credits < 0 ? sum - event.credits : sum,
        0,
      );
      const consumedTotal = jobs.reduce((sum, job) => sum + consumed(job), 0);
      return normalizeOverview({
        total_jobs: jobs.length,
        credits_in: creditsIn,
        credits_out: consumedTotal + expired,
        has_any_activity: readLedger().length > 0,
      });
    },

    async getCreditsUsage(params) {
      await settle(params.signal);
      const jobs = windowJobs(params, params);
      const dates = windowDates(params);

      const byModel = new Map<string, Map<string, number>>();
      for (const job of jobs) {
        const spend = consumed(job);
        if (spend <= 0) continue;
        const days = byModel.get(job.modelId) ?? new Map<string, number>();
        days.set(job.date, (days.get(job.date) ?? 0) + spend);
        byModel.set(job.modelId, days);
      }

      const series: ModelUsageSeriesWire[] = MOCK_MODELS.filter((model) =>
        byModel.has(model.id),
      ).map((model) => ({
        model_id: model.id,
        model_name: model.name,
        points: dates.map((date) => ({
          date,
          credits: byModel.get(model.id)?.get(date) ?? 0,
        })),
      }));

      return series.map(normalizeModelSeries);
    },

    async getModelsUsage(params) {
      await settle(params.signal);
      const jobs = windowJobs(params, params);
      const totals = new Map<string, { credits: number; jobs: number }>();
      for (const job of jobs) {
        const row = totals.get(job.modelId) ?? { credits: 0, jobs: 0 };
        row.credits += consumed(job);
        row.jobs += 1;
        totals.set(job.modelId, row);
      }
      return MOCK_MODELS.filter((model) => totals.has(model.id)).map((model) =>
        normalizeModelTotal({
          model_id: model.id,
          model_name: model.name,
          credits: totals.get(model.id)?.credits ?? 0,
          jobs: totals.get(model.id)?.jobs ?? 0,
        }),
      );
    },

    async getCreditsSummary(params) {
      await settle(params.signal);
      const events = windowEvents(params);
      const dates = windowDates(params);

      const byDate = new Map<string, CreditsSummaryDayWire>();
      for (const date of dates) {
        byDate.set(date, { date, consumption: 0, topup: 0, subscription: 0, community: 0, expired: 0 });
      }
      for (const event of events) {
        const day = byDate.get(event.date);
        if (!day) continue;
        if (event.kind === "job") {
          day.consumption = (day.consumption ?? 0) + consumed(event);
        } else if (event.source === "expired") {
          day.expired = (day.expired ?? 0) - event.credits;
        } else {
          day[event.source] = (day[event.source] ?? 0) + event.credits;
        }
      }

      const days = dates.map((date) => byDate.get(date)!);
      return normalizeCreditsSummary({
        days,
        total_consumed: days.reduce((sum, day) => sum + (day.consumption ?? 0), 0),
        total_added: days.reduce(
          (sum, day) =>
            sum + (day.topup ?? 0) + (day.subscription ?? 0) + (day.community ?? 0),
          0,
        ),
        total_expired: days.reduce((sum, day) => sum + (day.expired ?? 0), 0),
      });
    },

    async listGenerations(params: ListGenerationsParams): Promise<ListGenerationsResult> {
      await settle(params.signal);
      const pageNo = Math.max(1, params.page_no ?? 1);
      const limit = Math.max(1, params.limit ?? GENERATIONS_PAGE_SIZE);

      const rows = windowEvents(params)
        .filter((event) => {
          if (event.kind === "job") {
            if (!matchesSeriesFilters(event, params)) return false;
            if (params.platforms?.length && !params.platforms.includes(event.platform)) return false;
            if (
              params.credit_outcomes?.length &&
              !params.credit_outcomes.includes(event.creditOutcome)
            )
              return false;
            return true;
          }
          // Credit rows carry no model/feature/user/platform/outcome, so any
          // active facet filter excludes them rather than matching vacuously.
          return (
            !params.user_ids?.length &&
            !params.feature_ids?.length &&
            !params.model_ids?.length &&
            !params.platforms?.length &&
            !params.credit_outcomes?.length
          );
        })
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

      const totalItems = rows.length;
      const totalPages = Math.ceil(totalItems / limit);
      const items = rows
        .slice((pageNo - 1) * limit, pageNo * limit)
        .map((event) => normalizeGeneration(toGenerationWire(event)));

      return {
        items,
        pagination: paginationFallback(
          { page_no: pageNo, limit, total_items: totalItems, total_pages: totalPages },
          pageNo,
          limit,
          items.length,
        ),
      };
    },

    async getFacets(signal) {
      await settle(signal);
      return normalizeFacets({
        users: MOCK_USERS.map((user) => ({ id: user.id, name: user.name })),
        features: MOCK_FEATURES.map((feature) => ({ id: feature.id, name: feature.name })),
        models: MOCK_MODELS.map((model) => ({ id: model.id, name: model.name })),
        platforms: PLATFORMS.map((platform) => platform.id),
      });
    },
  };
}
