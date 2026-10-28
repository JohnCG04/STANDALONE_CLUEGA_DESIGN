"use client";

// Per-user Learn-guide progress, persisted in localStorage.
//
// Follows the established convention for per-user UI state (see
// hooks/useActiveTeam.ts / lib/stores/useThemeStore.ts): a namespaced key scoped
// by the signed-in user, try/catch-guarded reads and writes, and a window
// CustomEvent so every mounted consumer stays in sync. The backend has no
// generic per-user flag bucket today, so localStorage is the source of truth;
// progress is per user AND per guide (page).

import { getCdpEmail, getCdpUserId } from "@/lib/cdp/session";

export type LearnGuideProgress = {
  // The user opened the guide drawer at least once (drives the button label).
  opened: boolean;
  // Step keys the user has completed at least once.
  doneSteps: string[];
  skippedSteps: string[];
  // Resume point for "Continue" after closing the tour mid-way.
  lastStepIndex: number;
  // The user reached the end of the step guide.
  completed: boolean;
};

export type LearnProgressMap = Record<string, LearnGuideProgress>;

export const EMPTY_GUIDE_PROGRESS: LearnGuideProgress = {
  opened: false,
  doneSteps: [],
  skippedSteps: [],
  lastStepIndex: 0,
  completed: false,
};

const STORAGE_PREFIX = "cluega-learn-progress:v1";
export const LEARN_PROGRESS_CHANGED_EVENT = "cluega-learn-progress-changed";

function storageKey(): string {
  // Prefer the stable JWT subject; fall back to email, then a shared bucket for
  // signed-out/dev sessions so the feature still works there.
  const userId = getCdpUserId() ?? getCdpEmail() ?? "anon";
  return `${STORAGE_PREFIX}:${userId}`;
}

function isGuideProgress(value: unknown): value is LearnGuideProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.opened === "boolean" &&
    Array.isArray(record.doneSteps) &&
    typeof record.lastStepIndex === "number" &&
    typeof record.completed === "boolean"
  );
}

function withDefaults(value: LearnGuideProgress): LearnGuideProgress {
  return Array.isArray(value.skippedSteps)
    ? value
    : { ...value, skippedSteps: [] };
}

export function readLearnProgress(): LearnProgressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const map: LearnProgressMap = {};
    for (const [guideId, value] of Object.entries(parsed)) {
      if (isGuideProgress(value)) map[guideId] = withDefaults(value);
    }
    return map;
  } catch {
    // Corrupt payload / private mode / disabled storage — behave as first run.
    return {};
  }
}

export function writeGuideProgress(
  guideId: string,
  next: LearnGuideProgress,
): LearnProgressMap {
  const map = readLearnProgress();
  map[guideId] = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(map));
    } catch {
      // Best effort — a full/blocked localStorage just means no persistence.
    }
    window.dispatchEvent(
      new CustomEvent(LEARN_PROGRESS_CHANGED_EVENT, { detail: { guideId } }),
    );
  }
  return map;
}
