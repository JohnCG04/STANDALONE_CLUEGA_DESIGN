"use client";

// The composer settings a user keeps re-picking, remembered per user.
//
// QA: "every new chat resets the setting bar to 2 images / 1:1 · 1K, so making
// a second TikTok cover means setting the ratio again." Two separate causes —
// `useCreativeComposerStore.reset()` re-seeds the count on every entry into the
// Design tool (deliberate: it clears conversation state), and the ratio /
// resolution live in component state that dies on any remount.
//
// What belongs here is the line between the two: a SETTING is a preference that
// outlives the conversation, conversation state is not. Count, ratio and
// resolution are settings. `aspectExplicit` is NOT — it means "a human picked
// this ratio for THIS turn", and carrying it forward would make a ratio typed
// into a new prompt lose to a click from last week (the same reasoning
// mediaChat.ts gives for videoCountExplicit).
//
// Namespaced by CDP user and guarded like lib/media/templateThumbs.ts: never
// throws, and a missing or corrupt record degrades to the shipped defaults.

import { getCdpEmail, getCdpUserId } from "@/lib/cdp/session";

const STORAGE_PREFIX = "cluega:creative-prefs:v1";

export type CreativePrefs = {
  imageCount: number;
  aspectRatio: string;
  resolution: string;
};

// The Brand Kit is NOT here, and that is the point of the exclusion.
//
// It lived here as `brandId`, then briefly as a `useBrand` switch, and both
// were the same mistake: a brand is a WORKSPACE decision, not a per-browser
// one. A copy in localStorage is invisible to the user's other machine, cannot
// be changed by a teammate, and disagrees with the render the moment either
// happens. The service owns it as `is_default` and lib/media/defaultBrand.ts
// reads it — see brandkit.md §5.

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(): string {
  const userId = getCdpUserId() ?? getCdpEmail() ?? "anon";
  return `${STORAGE_PREFIX}:${userId}`;
}

/**
 * The stored preferences, merged onto `fallback`.
 *
 * Merged rather than returned whole so a record written before a field existed
 * (or with one field corrupt) still contributes the fields it does have.
 */
export function loadCreativePrefs(
  fallback: CreativePrefs,
  storage: StorageLike | null = defaultStorage(),
): CreativePrefs {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(storageKey());
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CreativePrefs> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const count = Number(parsed.imageCount);
    return {
      imageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : fallback.imageCount,
      aspectRatio:
        typeof parsed.aspectRatio === "string" && parsed.aspectRatio
          ? parsed.aspectRatio
          : fallback.aspectRatio,
      resolution:
        typeof parsed.resolution === "string" && parsed.resolution
          ? parsed.resolution
          : fallback.resolution,
    };
  } catch {
    return fallback;
  }
}

/** Merge `patch` into the stored preferences. Never throws. */
export function saveCreativePrefs(
  patch: Partial<CreativePrefs>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    const current = loadCreativePrefs(
      { imageCount: 0, aspectRatio: "", resolution: "" },
      storage,
    );
    storage.setItem(
      storageKey(),
      JSON.stringify({ ...current, ...patch }),
    );
  } catch {
    // A full or disabled storage must never break a submit.
  }
}
