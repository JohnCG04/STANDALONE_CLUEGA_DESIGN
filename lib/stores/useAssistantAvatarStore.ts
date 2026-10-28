import { create } from "zustand";

import {
  getUserOnboardingStatus,
  updateAssistantAvatar,
} from "@/lib/user-onboarding/client";

/**
 * Whether this person wants the animated assistant avatar. Defaults to OFF, so
 * nothing changes for an existing user until they opt in.
 *
 * Persisted SERVER-SIDE, on the per-user onboarding profile, as
 * `assistant_avatar_enabled`. It sits in Settings -> Profile beside the display
 * name, the honorific and the raw `user.md` editor — every one of which is
 * stored on the server — so keeping this one in localStorage made a single
 * panel behave two different ways: the row above followed you to a new device,
 * this row did not, and nothing on screen said why.
 *
 * Reads come from the profile GET the rest of that panel already uses; the
 * write is its own single-field endpoint
 * (`PUT /api/v1/onboarding/me/assistant-avatar`), not the whole-profile PUT, so
 * flipping a switch cannot disturb role, goals, honorific or either markdown
 * block.
 *
 * The initial state is the default rather than a fetched value because this
 * module is imported by client components that Next still renders on the
 * server: there is nothing to read during that render, and claiming otherwise
 * would make the first client paint disagree with the server's. Same reason
 * [useThemeStore.ts](../../../../packages/shared/src/lib/stores/useThemeStore.ts)
 * hydrates in an effect.
 *
 * OFF is the answer for every uncertainty here — before the profile arrives, if
 * it never arrives, and if the request fails outright. A switch that turns
 * itself on because a fetch failed is worse than one that stays off: the reader
 * did not ask for the avatar, and the fallback mark in
 * [TurnAvatar](../../components/cluega-ai/avatar/TurnAvatar.tsx) is the chat
 * exactly as it was.
 */

interface AssistantAvatarState {
  enabled: boolean;
  /** True once the profile has been consulted, so a consumer can avoid a flash. */
  hydrated: boolean;
  /** A profile read is in flight — keeps concurrent mounts to one request. */
  loading: boolean;
  /** A write is in flight, so the row can show it and block a second click. */
  saving: boolean;
  /**
   * The last write was rejected and the switch has been put back. Cleared when
   * the next attempt starts, so the message never outlives the state it
   * describes.
   */
  saveFailed: boolean;
  hydrate: () => void;
  setEnabled: (enabled: boolean) => void;
}

export const useAssistantAvatarStore = create<AssistantAvatarState>((set, get) => ({
  enabled: false,
  hydrated: false,
  loading: false,
  saving: false,
  saveFailed: false,

  /**
   * Read the stored preference. Deliberately fire-and-forget: this is chrome,
   * and the chat renders its usual mark meanwhile, so nothing waits on it.
   *
   * Both the settings row and the newest chat bubble call this on mount, hence
   * the `loading` guard — one request, not one per consumer.
   */
  hydrate: () => {
    const { hydrated, loading } = get();
    if (typeof window === "undefined" || hydrated || loading) return;
    set({ loading: true });
    void (async () => {
      let enabled = false;
      try {
        const status = await getUserOnboardingStatus();
        enabled = status.profile?.assistant_avatar_enabled === true;
      } catch {
        // Offline, 401, a 500 — all of them mean "we do not know", and OFF is
        // what we show when we do not know. Left as the initialiser's false.
      }
      // A toggle that landed while this was in flight is the newer truth and
      // has already been sent; `hydrated` is how setEnabled says so.
      if (get().hydrated) {
        set({ loading: false });
        return;
      }
      set({ enabled, hydrated: true, loading: false });
    })();
  },

  /**
   * Flip the preference and store it.
   *
   * Optimistic, then REVERTED if the server refuses. The switch is the only
   * report of what is stored, so leaving it "on" after a failed write would be
   * a straight lie — the avatar would vanish on the next device, or on this one
   * after a reload, with nothing having told the reader. Reverting keeps the
   * switch and the server saying the same thing at every moment; `saveFailed`
   * then explains the snap-back so it does not read as the click being lost.
   */
  setEnabled: (enabled) => {
    const previous = get().enabled;
    if (get().saving) return;
    // `hydrated` goes true here even though no read happened: this IS the
    // current value now, and an in-flight hydrate must not overwrite it.
    set({ enabled, hydrated: true, saving: true, saveFailed: false });
    void (async () => {
      try {
        await updateAssistantAvatar(enabled);
        set({ saving: false });
      } catch {
        set({ enabled: previous, saving: false, saveFailed: true });
      }
    })();
  },
}));
