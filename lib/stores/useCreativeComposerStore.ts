import { create } from "zustand";

import { loadCreativePrefs, saveCreativePrefs } from "@/lib/media/creativePrefs";

// Standalone store for the creative module's three-tab composer (Agent / Video /
// Image). Kept out of main.tsx and PromptComposer deliberately:
//
//  1. `.cursor/rules/chat-ui-only.mdc` globs both of those and forbids new state
//     there, so the tab + settings state lives here and the composer only takes
//     two presentational slots.
//  2. The Agent and Video tabs BOTH submit through the video flow (they differ
//     only in the settings they collect), so the active tab genuinely cannot be
//     derived from `activeSuggestionId` the way the old two-mode switch was.
//
// Mirrors useTipCobrowseStore's shape: plain zustand, no persistence.

/** Which tab of the creative input area is showing. */
export type CreativeTab = "agent" | "video" | "image";

/** An Agent option the user can leave to the model. "auto" is the default and
 *  renders as "Để AI quyết định" / "Let AI decide". */
export type TriState = "auto" | "on" | "off";

/** How the Video tab turns the attached material into a clip.
 *
 *  `reference` learns the attached video's pacing/camera/rhythm and renders a
 *  fresh storyboard from it; `videoToVideo` restyles that video's own footage.
 *  They are deliberately separate: only the latter reuses the source frames,
 *  which is what the PRD's reference mode forbids. */
export type VideoMethod =
  | "reference"
  | "imageToVideo"
  | "textToVideo"
  | "videoToVideo";

/** Output language for EVERY generated video — the Agent tab and the Video tab
 *  both read this one field. It is the language the film's script, captions and
 *  narration come back in, which is NOT the UI locale: a Chinese interface may
 *  order an English ad. Vocabulary mirrors `TemplateLang` in
 *  lib/media/templates/types.ts and `ScriptLang` in lib/cdp/scriptsClient.ts so
 *  the content-language pickers agree. */
export type CreativeLanguage = "en" | "vi" | "zh";

export const CREATIVE_LANGUAGES: readonly CreativeLanguage[] = ["en", "vi", "zh"];
export const VIDEO_COUNT_OPTIONS: readonly number[] = [1, 2, 3];
/** Delivered lengths offered on the Agent tab. Totals, not clip lengths: past
 *  the model's single-take ceiling the service plans a scene board and cuts the
 *  takes together. Left UNSET by default on purpose — see
 *  `AgentCreativeConfig.durationSeconds`. */
export const AGENT_DURATION_OPTIONS: readonly number[] = [10, 15, 30, 60];
/** Parallel variants offered on the Image tab. The ceiling matches
 *  MAX_IMAGE_COUNT: what one turn delivers, what the result grid renders, and
 *  what a count typed in the prompt is clamped to are one number. */
export const IMAGE_COUNT_OPTIONS: readonly number[] = [1, 2, 3, 4];
/** The Design model menu's Quality panel, best first (the boards' order). */
export const RENDER_QUALITIES = ["high", "standard", "fast"] as const;
export type RenderQuality = (typeof RENDER_QUALITIES)[number];

/** Image tab default: two parallel variants, so the user picks the better one
 *  (mirrors the Agent tab's `videoCount: 2`). Costs scale with the count. */
export const DEFAULT_IMAGE_COUNT = 2;

/** The last count this user chose, or the default when they never have.
 *
 * Read at CLICK time (reset, or the mount effect that seeds the composer), never
 * while the store is being created: this module is evaluated during SSR too, and
 * a value that differs between the server render and the first client render is
 * a hydration mismatch on the setting bar.
 */
export function rememberedImageCount(): number {
  const { imageCount } = loadCreativePrefs({
    imageCount: DEFAULT_IMAGE_COUNT,
    aspectRatio: "",
    resolution: "",
  });

  return IMAGE_COUNT_OPTIONS.includes(imageCount) ? imageCount : DEFAULT_IMAGE_COUNT;
}

/** The two audio tracks a video can carry, as the composer states them. Shared:
 *  the Agent tab and the Video tab both read these one fields — a tab-local copy
 *  is how the Video tab ended up with no control at all and a hardcoded
 *  `true/true` on the wire. */
export type OutputAudio = {
  music: TriState;
  voiceover: TriState;
};

export type AgentCreativeConfig = {
  music: TriState;
  voiceover: TriState;
  /** The picked output language, or undefined for "nobody chose" — the same
   *  distinction `durationSeconds` makes below. Unset resolves to the UI locale
   *  at send time (`lib/creative/outputLanguage.ts`); hardcoding "en" here made
   *  a Chinese user's video speak English by default, which nobody picked. */
  language?: CreativeLanguage;
  /** Parallel video outputs on the Agent tab (POST /jobs `n`, 1–3). */
  videoCount: number;
  /** True only when a human clicked a count tile. Absent means the 2 above is
   *  this app's default, not an instruction — the same distinction
   *  `durationSeconds` makes, and it travels as `options.n_explicit` so the
   *  service can tell "the user asked for 2" from "nobody said". Without it,
   *  「先給我 3 個腳本方向」 lost silently to a default nobody chose. */
  videoCountExplicit?: boolean;
  /** Delivered TOTAL length, when the user picked one. Undefined means "nobody
   *  chose", and that distinction is the whole point: a default must lose to a
   *  duration the user typed in the prompt ("30 秒左右"), while a pick must win.
   *  It travels to the backend as `options.seconds_explicit`. */
  durationSeconds?: number;
};

export const DEFAULT_AGENT_CREATIVE_CONFIG: AgentCreativeConfig = {
  music: "auto",
  voiceover: "auto",
  videoCount: 2,
};

interface CreativeComposerState {
  /** True while the creative module owns the composer. Published by the tab bar
   *  so surfaces that cannot see `activeSuggestionId` — the composer's own
   *  attachment popover — can still tell which chrome to show. */
  active: boolean;
  setActive: (active: boolean) => void;
  tab: CreativeTab;
  agentConfig: AgentCreativeConfig;
  /** Sent as the request's `generation_method` and, via VIDEO_METHOD_RULES,
   *  decides which driver runs and which roles the request may carry. Do NOT map
   *  it onto `VideoGenConfig.mode`, which is "fast" | "quality" (speed, not
   *  method). */
  videoMethod: VideoMethod;
  /** True only after the user TOUCHED the method dropdown this session. The
   *  wire sends it as `generation_method_explicit`; while false, the backend's
   *  prompt-lane classifier may override the dropdown's default ("reference"),
   *  which is what lets "sửa video này" edit the clip instead of cloning it.
   *  A restored session stays false — a reload is not a choice. */
  videoMethodExplicit: boolean;
  /** Parallel image outputs on the Image tab (POST /jobs `n`). The CONFIGURED
   *  count: a count read out of the prompt overrides it for that turn, and the
   *  resolved number is never written back here — doing so would make the next
   *  turn look like the user chose it. */
  imageCount: number;
  /** The Design model menu's Quality pick. Kept, not sent: no job takes a
   *  quality yet (asked 2026-09-25) — wire it into the request once one does. */
  quality: RenderQuality;
  /** A `GET /styles` preset id — the LOOK of what this turn generates, sent as
   *  the job's top-level `style`.
   *
   *  `null` means "no style", and the job body must then OMIT the field: /jobs
   *  validates `style` against a closed enum and 422s on "". That is also why
   *  this needs no `*Explicit` twin the way `imageCount` does — "nobody picked"
   *  is already expressible in the value itself.
   *
   *  Orthogonal to the Template pill on purpose. A template decides layout and
   *  subject; a style decides light, palette and material, and media-ai's
   *  `merge_style` puts the preset's tags first while keeping the template's.
   *  Picking one must never clear the other. */
  styleId: string | null;
  /** The brand this turn obeys, when the user has said something about it.
   *
   *  `null` — the normal case — means "nobody touched the pill", and the
   *  TENANT's brand then applies: a brand is a standing constraint, not a
   *  per-turn flourish, so the default has to be on. `BRAND_OFF` is the
   *  user saying "not this one", which is a different statement from silence
   *  and is why a plain `""` could not carry it.
   *
   *  Deliberately NOT the source of the brand — `lib/media/brandSelection.ts`
   *  is, and it reads the service. This holds only the OVERRIDE, which is why
   *  it is conversation state and `reset()` clears it: a brand outlives the
   *  conversation, while "skip the brand on this one image" does not. */
  brandId: string | null;
  /** The model the session was STARTED with, as the user literally picked it —
   *  `null` means "Auto". Deliberately not the resolved media id: "Auto" is a
   *  display label the media flows resolve at submit time (`resolveVideoModel` /
   *  `resolveImageModel`), so storing the resolved id here is what made the
   *  in-session pill read "Happyhorse 1.1" for a session the user set to Auto.
   *  Two flat fields, not an object: the per-session frame mirror compares
   *  field-by-field with `===` (see media/unified/mediaChat.ts). */
  composerModelId: string | null;
  composerModelName: string | null;
  setTab: (tab: CreativeTab) => void;
  /**
   * What each tab was left holding in the composer (PRD VID-01: "each of the
   * three tabs keeps its own input state").
   *
   * One composer renders every tab, so without this the Agent tab's brief
   * travelled onto the Video tab and was then edited there — a person drafting
   * a 30s film brief on Agent and a one-line motion note on Video had to retype
   * whichever they left. Keyed by tab, and only written on a switch: a draft is
   * a draft until the user sends it.
   */
  tabDrafts: Partial<Record<CreativeTab, string>>;
  /**
   * What the composer's box holds RIGHT NOW, mirrored here on every keystroke.
   *
   * The page above owns a `promptDraft`, but that is a SEED — it is written
   * when a picker hands over a brief or a route changes, never while the user
   * types. Stashing it on a tab switch stashed the wrong text, which is why the
   * three creative tabs looked like they shared one draft on dev.
   *
   * Lives in the store rather than in page state so a keystroke re-renders the
   * one component that reads it, not the whole chat shell.
   */
  liveDraft: string;
  setLiveDraft: (value: string) => void;
  /**
   * Switch tabs, keeping both drafts: stash the outgoing tab's text, move to
   * `next`, and answer with the text `next` was left holding (empty string when
   * it has none).
   *
   * `current` is optional: omit it and the live draft above is used, which is
   * what a caller that has no live value of its own should do.
   *
   * Returns the restored text rather than pushing it, because the composer's
   * own state is the only writer of its box — the caller hands the answer to
   * the existing prompt-prefill channel.
   */
  switchTabWithDraft: (next: CreativeTab, current?: string) => string;
  setAgentConfig: (patch: Partial<AgentCreativeConfig>) => void;
  /**
   * REPLACE the whole config — the session-restore seam, not an edit.
   *
   * `setAgentConfig` merges, and provenance flags are expressed by ABSENCE
   * (`videoCountExplicit` / `language` are omitted when nobody picked). Merging
   * a restored session over a live store therefore kept the previous session's
   * "a human picked this" flags, and the backend then read a stale pick as an
   * instruction — turning a request that should follow the user's words into a
   * question about a tile they never tapped in this session.
   */
  replaceAgentConfig: (config: AgentCreativeConfig) => void;
  /** The output language, named for what it is. Both settings bars write it, so
   *  neither needs to know it is stored inside `agentConfig` (it lives there
   *  because the per-session chat frame already persists that slice). */
  setOutputLanguage: (language: CreativeLanguage) => void;
  /** The output audio, named for what it is — same reasoning as
   *  `setOutputLanguage`: both settings bars write it and neither needs to know
   *  it is stored inside `agentConfig`. */
  setOutputAudio: (patch: Partial<OutputAudio>) => void;
  setVideoMethod: (method: VideoMethod) => void;
  /** Session restore: re-seed the method WITHOUT marking it chosen. */
  restoreVideoMethod: (method: VideoMethod) => void;
  setImageCount: (count: number) => void;
  setQuality: (quality: RenderQuality) => void;
  setStyleId: (styleId: string | null) => void;
  setBrandId: (brandId: string | null) => void;
  /**
   * Record the model this session runs. ONE writer only: the submit path
   * (`usePromptEngine.submitPrompt`), which is the last point the literal pick
   * still exists — everything downstream has already resolved it.
   *
   * Do NOT call this from the composer's `onSelectedModelChange`: that fires on
   * mount and on every catalog switch, so a text default or the Image-tab
   * fallback would overwrite the model the session was started with, and the
   * in-session lock would show a model the session never ran.
   */
  setComposerModel: (model: { id: string; name: string } | null) => void;
  reset: () => void;
}

export const useCreativeComposerStore = create<CreativeComposerState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
  tab: "agent",
  agentConfig: DEFAULT_AGENT_CREATIVE_CONFIG,
  videoMethod: "reference",
  videoMethodExplicit: false,
  imageCount: DEFAULT_IMAGE_COUNT,
  quality: "high",
  styleId: null,
  brandId: null,
  composerModelId: null,
  composerModelName: null,
  tabDrafts: {},
  setTab: (tab) => set({ tab }),
  liveDraft: "",
  setLiveDraft: (value) =>
    set((state) => (state.liveDraft === value ? {} : { liveDraft: value })),
  switchTabWithDraft: (next, current) => {
    let restored = "";
    set((state) => {
      const outgoing = current ?? state.liveDraft;
      if (state.tab === next) {
        restored = outgoing;
        return {};
      }
      restored = state.tabDrafts[next] ?? "";
      return {
        tab: next,
        tabDrafts: { ...state.tabDrafts, [state.tab]: outgoing },
        // The box is about to be rewritten with the restored text; leaving the
        // outgoing tab's words here would stash them again on the next switch.
        liveDraft: restored,
      };
    });
    return restored;
  },
  setAgentConfig: (patch) =>
    set((state) => ({ agentConfig: { ...state.agentConfig, ...patch } })),
  replaceAgentConfig: (agentConfig) => set({ agentConfig }),
  setOutputLanguage: (language) =>
    set((state) => ({ agentConfig: { ...state.agentConfig, language } })),
  setOutputAudio: (patch) =>
    set((state) => ({ agentConfig: { ...state.agentConfig, ...patch } })),
  // The dropdown is the one caller; touching it IS the choice.
  setVideoMethod: (videoMethod) => set({ videoMethod, videoMethodExplicit: true }),
  restoreVideoMethod: (videoMethod) => set({ videoMethod, videoMethodExplicit: false }),
  setImageCount: (imageCount) => {
    // A count is a SETTING, not conversation state: the user who set 4 covers
    // is going to want 4 again next chat. Written on the way through rather
    // than by a subscriber so `reset()` can read it back synchronously.
    saveCreativePrefs({ imageCount });
    set({ imageCount });
  },
  setQuality: (quality) => set({ quality }),
  setStyleId: (styleId) => set({ styleId }),
  setBrandId: (brandId) => set({ brandId }),
  // "auto" is normalised to null here so no caller has to remember that the
  // sentinel and "nobody picked" mean the same thing to every reader.
  setComposerModel: (model) =>
    set(
      !model || model.id === "auto"
        ? { composerModelId: null, composerModelName: null }
        : { composerModelId: model.id, composerModelName: model.name },
    ),
  reset: () =>
    set({
      tab: "agent",
      // Drafts belong to the conversation that was being written, same as the
      // tab itself: a new Design session starts with an empty box on every tab.
      tabDrafts: {},
      liveDraft: "",
      agentConfig: DEFAULT_AGENT_CREATIVE_CONFIG,
      videoMethod: "reference",
      videoMethodExplicit: false,
      // Re-seeded, not defaulted. `reset()` clears CONVERSATION state (the tab,
      // the method, the model, the style) and is called every time the Design
      // pill is clicked — which is why the count the user had just chosen kept
      // disappearing on the way into a new chat.
      imageCount: rememberedImageCount(),
      styleId: null,
      brandId: null,
      composerModelId: null,
      composerModelName: null,
    }),
}));

/** The picked output language, or undefined when nobody picked. Read this rather
 *  than reaching into `agentConfig`: the field is shared by every video path. */
export const selectOutputLanguage = (
  state: CreativeComposerState,
): CreativeLanguage | undefined => state.agentConfig.language;

/** The music / voiceover picks. TWO primitive selectors, deliberately not one
 *  object selector: zustand compares with `Object.is`, so a selector returning
 *  `{music, voiceover}` allocates a fresh object every render and re-renders
 *  forever unless every call site wraps it in `useShallow`. */
export const selectOutputMusic = (state: CreativeComposerState): TriState =>
  state.agentConfig.music;

export const selectOutputVoiceover = (state: CreativeComposerState): TriState =>
  state.agentConfig.voiceover;

/** Whether a human picked the video count (vs. inheriting the default 2). Sent
 *  as `options.n_explicit`; see `AgentCreativeConfig.videoCountExplicit`. */
export const selectVideoCountExplicit = (
  state: CreativeComposerState,
): boolean => Boolean(state.agentConfig.videoCountExplicit);
