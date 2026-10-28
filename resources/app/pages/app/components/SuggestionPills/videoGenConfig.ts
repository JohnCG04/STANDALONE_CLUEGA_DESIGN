import {
  Cpu,
  Proportions,
  RectangleHorizontal,
  RectangleVertical,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type VideoMode = "fast" | "quality";
export type VideoOrientation = "landscape" | "portrait";
/** Clip length in whole seconds. The service accepts anything in [MIN, MAX]. */
export type VideoDuration = number;
/** Target output resolution (e.g. "720p"/"1080p"). Free-form string; the service
 *  treats an unknown value as "let the tool decide". */
export type VideoResolution = string;

/** Inclusive bounds for a video clip's duration (seconds).
 *
 *  These are the *model-agnostic* outer bounds, used only when the catalog has
 *  not told us what the chosen model accepts. The real limit is per model
 *  (`supported_durations`): Sora 2 Pro renders 4/8/12/16/20, Veo 3.1 only 4/6/8,
 *  Kling every second from 3 to 15. The max is 20 because that is the longest
 *  single clip any catalog model advertises — clamping to 15 here silently
 *  demoted every 16s and 20s Sora request. */
export const VIDEO_DURATION_MIN = 4;
export const VIDEO_DURATION_MAX = 20;

/** Longest video the service will DELIVER, stitched from several takes.
 *
 *  A duration above a model's own clip ceiling is not a clip length — media-ai
 *  reads it as a TOTAL, plans a scene board for it, renders each scene and cuts
 *  them into one file (`_maybe_auto_scene_split` in app/jobs/manager.py). This is
 *  the ceiling on that total, mirroring `MAX_TOTAL_SECONDS` in
 *  app/director/duration_budget.py, `MAX_VIDEO_SECONDS` in app/llm/video_limits.py
 *  and `max_target_duration_seconds` in app/config.py. Above it the backend
 *  clamps and says so, so never offer more. */
export const VIDEO_TOTAL_DURATION_MAX = 120;

/** Floor of the split decision — mirrors `auto_scene_split_threshold_seconds`
 *  (app/config.py). A model whose own clips are shorter than this still gets a
 *  single take up to here. */
export const AUTO_SCENE_SPLIT_THRESHOLD = 12;

/** The single-take ceiling to assume while the model is unknown ("Auto", or a
 *  catalog that has not answered yet).
 *
 *  15s is the default video model's own ceiling (`alibaba/happyhorse-1.1`,
 *  3…15s) and the top of {@link VIDEO_DURATION_OPTIONS}. Guessing low is the
 *  safe direction: the backend re-derives the REAL ceiling from whichever model
 *  it routes to, so a 20s pick that lands on Sora 2 Pro renders as one 20s take
 *  instead of a two-scene cut — a better result than the reverse. */
export const FALLBACK_SINGLE_CLIP_CEILING = 15;

/**
 * The longest single take this model renders — above it a duration is a total.
 *
 * Exact twin of `single_clip_ceiling()` in app/llm/video_validate.py, which is
 * what the service uses to decide between rendering one clip and planning a
 * board. The two must agree: a value the FE thinks is a clip length and the
 * service treats as a total (or the other way round) is how a 45s request came
 * back as a 15s clip.
 */
export function singleClipCeiling(
  allowed: readonly VideoDuration[] | undefined,
): VideoDuration {
  if (!allowed || allowed.length === 0) return FALLBACK_SINGLE_CLIP_CEILING;
  return Math.max(AUTO_SCENE_SPLIT_THRESHOLD, ...allowed);
}

/** Is this duration delivered as several takes cut together, rather than one? */
export function isStitchedDuration(
  seconds: VideoDuration,
  allowed: readonly VideoDuration[] | undefined,
): boolean {
  return seconds > singleClipCeiling(allowed);
}

/**
 * Clamp a requested TOTAL video length to [MIN, {@link VIDEO_TOTAL_DURATION_MAX}].
 *
 * The total-length twin of {@link clampVideoDuration}, which stays at 20s because
 * it clamps CLIP lengths (the ad panel, the canvas editor, the workflow node all
 * mean one clip). Only the composer's duration pill — which states the delivered
 * length — and {@link snapVideoDuration} use this one.
 */
export function clampVideoTotalDuration(
  value: unknown,
  fallback: VideoDuration = VIDEO_DURATION_MIN,
): VideoDuration {
  const seconds = typeof value === "string" ? Number(value) : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return fallback;
  }
  return Math.min(
    VIDEO_TOTAL_DURATION_MAX,
    Math.max(VIDEO_DURATION_MIN, Math.round(seconds)),
  );
}

/**
 * Clamp an arbitrary (possibly untrusted) value to a valid whole-second duration
 * in [VIDEO_DURATION_MIN, VIDEO_DURATION_MAX]. Non-numeric / NaN input falls back
 * to `fallback` (default: the minimum).
 *
 * Prefer {@link snapVideoDuration} whenever the model's own list is known: a
 * value inside these bounds can still be one the model rejects (10s on Sora).
 */
export function clampVideoDuration(
  value: unknown,
  fallback: VideoDuration = VIDEO_DURATION_MIN,
): VideoDuration {
  const seconds = typeof value === "string" ? Number(value) : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return fallback;
  }
  return Math.min(
    VIDEO_DURATION_MAX,
    Math.max(VIDEO_DURATION_MIN, Math.round(seconds)),
  );
}

/**
 * Snap a duration onto the clip lengths a model actually accepts.
 *
 * Ties resolve UP (10s against Sora's 4/8/12/16/20 → 12, not 8): a caller asking
 * for a length is better served slightly long than silently short. Mirrors
 * `snap_seconds` in media-ai-service (`app/llm/video_capabilities.py`) — the two
 * must agree, or the UI shows one number and the provider renders another.
 * Falls back to {@link clampVideoDuration} when the model lists nothing.
 *
 * A value ABOVE {@link singleClipCeiling} is not snapped at all: it is a total
 * the service delivers as several takes cut together, and the model's clip list
 * has nothing to say about it. Snapping it was the bug — a 45s ask came back as
 * the nearest clip length, 15s, on a model whose list stops there.
 */
export function snapVideoDuration(
  value: unknown,
  allowed: readonly VideoDuration[] | undefined,
  fallback: VideoDuration = VIDEO_DURATION_MIN,
): VideoDuration {
  const asked = typeof value === "string" ? Number(value) : value;
  if (
    typeof asked === "number" &&
    Number.isFinite(asked) &&
    asked > singleClipCeiling(allowed)
  ) {
    return clampVideoTotalDuration(asked, fallback);
  }
  if (!allowed || allowed.length === 0) return clampVideoDuration(value, fallback);
  const seconds = typeof value === "string" ? Number(value) : value;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return allowed.includes(fallback) ? fallback : allowed[0];
  }
  return allowed.reduce((best, d) => {
    const delta = Math.abs(d - seconds) - Math.abs(best - seconds);
    return delta < 0 || (delta === 0 && d > best) ? d : best;
  }, allowed[0]);
}

/**
 * The duration tiles to offer for a model: its own `supported_durations` when the
 * catalog knows them, else the generic fallback list. Never intersect the two —
 * a model whose real list is 4/8/12/16/20 must be able to offer 16 and 20, and
 * one that only does 4/6/8 must not be offered 10.
 */
export function durationOptionsFor(
  modelDurations: readonly VideoDuration[] | undefined,
): VideoDuration[] {
  if (!modelDurations || modelDurations.length === 0) {
    return VIDEO_DURATION_OPTIONS;
  }
  return [...new Set(modelDurations)].sort((a, b) => a - b);
}

/**
 * Single-take tiles: the model's own lengths, thinned to a readable row.
 *
 * {@link durationOptionsFor} returns the list verbatim, which is right for the
 * ad panel but not for a popover — Seedance 2.5 advertises every second from 4
 * to 30, and thirty tiles is a wall, not a choice. The model's ceiling is always
 * kept: it is the boundary between one take and a stitched cut, so it has to be
 * reachable.
 */
export function singleShotOptionsFor(
  modelDurations: readonly VideoDuration[] | undefined,
): VideoDuration[] {
  const all = durationOptionsFor(modelDurations);
  if (all.length <= SINGLE_SHOT_TILE_LIMIT) return all;
  const ceiling = all[all.length - 1];
  const kept = SINGLE_SHOT_DISPLAY_STEPS.filter((step) => all.includes(step));
  return [...new Set([...kept, ceiling])].sort((a, b) => a - b);
}

/**
 * Stitched tiles: the delivered lengths this model cannot shoot in one take.
 *
 * Filtered against the model's ceiling rather than fixed, so a length is only
 * ever offered in one of the two rows — 20s is a single take on Sora 2 Pro and a
 * two-scene cut on the default model.
 */
export function deliveredTotalOptionsFor(
  modelDurations: readonly VideoDuration[] | undefined,
): VideoDuration[] {
  const ceiling = singleClipCeiling(modelDurations);
  return DELIVERED_TOTAL_OPTIONS.filter(
    (seconds) => seconds > ceiling && seconds <= VIDEO_TOTAL_DURATION_MAX,
  );
}

/**
 * One clip length with its unit: "8s" in English, "8 giây" / "8 秒" elsewhere.
 * The bare "s" is a unit symbol and sits tight against the number; a word does
 * not. `suffix` comes from the locale (`creative.video.durationSuffix`).
 */
export function formatVideoDuration(
  seconds: VideoDuration,
  suffix: string,
): string {
  return suffix === "s" ? `${seconds}s` : `${seconds} ${suffix}`;
}

/**
 * A model's clip lengths as one readable line — "4 · 8 · 12 · 16 · 20s" — for the
 * hint that tells the user which lengths this model actually renders, and for
 * the error shown when one it does not slipped through.
 */
export function formatDurationList(
  options: readonly VideoDuration[],
  suffix: string,
): string {
  if (options.length === 0) return "";
  const head = options.slice(0, -1).join(" · ");
  const last = formatVideoDuration(options[options.length - 1], suffix);
  return head ? `${head} · ${last}` : last;
}

/** `options.omni_reference`: refs in the node's numbering (`images[0]` is "Image 1"). */
export type OmniReferenceWire = {
  task: "reference" | "edit" | "extend";
  extend_mode?: "after" | "before" | "bridge";
  images: { url: string; transforms?: unknown[] }[];
  videos: { url: string }[];
  audios: { url: string }[];
};

export type VideoGenConfig = {
  mode: VideoMode;
  orientation: VideoOrientation;
  duration: VideoDuration;
  /** True only when a HUMAN picked {@link duration} (a tile in the duration
   *  popover). Absent means "this is a default", and the service reads the
   *  difference: a default loses to a length the user typed in the prompt
   *  ("30 秒左右") and is snapped when the model cannot render it, while a pick
   *  wins and is answered with a 400 naming the lengths that exist. Never set
   *  from a re-snap — reconciling against a model is not a user choice. */
  durationExplicit?: boolean;
  /** True only when a human clicked a video-count tile. The count itself is not
   *  carried here (it rides on the request as `n`), only its provenance: the
   *  composer's default of 2 is not an instruction, so a count typed in the
   *  prompt («做 3 支影片») may disagree with it and the service asks which was
   *  meant. Travels as `options.n_explicit`, the twin of `seconds_explicit`. */
  videoCountExplicit?: boolean;
  /**
   * How many outputs. The Agent tab sends this through `runs` → `n` instead,
   * because there it means "how many new videos". It rides the CONFIG only for
   * the Video tab's edit turns, where it means "how many alternatives for the
   * clip I attached" and reaches `options.hook_count` — a different question, and
   * one that must not change the n=1 shape of an ordinary edit body.
   */
  videoCount?: number;
  /**
   * True only when a HUMAN picked {@link language}.
   *
   * The composer always resolves a concrete language (a pick, or the interface
   * locale as a fallback — see `resolveOutputLanguage`), so without this flag
   * the backend cannot tell the two apart and a language stated in the prompt
   * can never win. Computed from the RAW store field, never from the resolved
   * one.
   */
  languageExplicit?: boolean;
  /** Digital presenter from the avatar library (PRD Screen 6). Forwarded on
   *  the video job as `options.avatar_id`; image jobs ignore it. */
  avatarId?: string;
  /** Virtual characters cast in the video (`character_ids`); the service resolves their assets. */
  characterIds?: string[];
  /** The model's own soundtrack, asked explicitly (`generate_audio`); absent = the service decides. */
  generateAudio?: boolean;
  /** Seedance references / edit / extend from a Workflow node (media-ai `app/seedance`). */
  omniReference?: OmniReferenceWire;
  /** The answer to the edit-scope question, on an EDIT turn only.
   *
   *  A clip longer than the edit model can read in one pass is edited in
   *  windows, one paid render each, so three or more windows makes the service
   *  ask first (media-ai `app/intent/edit_scope.py`). `"segments"` edits the
   *  whole clip, `"head"` only its opening window. Never set by the composer —
   *  it is folded into the retry that carries the user's answer, and travels as
   *  `options.edit_scope`. */
  editScope?: "segments" | "head";
  /** The face-swap lane's two answers, echoed from its 409 cards on the retry
   *  only (media-ai `app/intent/face_gate.py`) — same travel arrangement as
   *  `editScope`. `faceSwapConsent` is the likeness-consent attestation;
   *  `faceSwapTarget` says which detected face gets the photo's identity. */
  faceSwapConsent?: boolean;
  faceSwapTarget?: "prominent" | "all";
  /** ONE specific detected face, when the user answered the faces card by
   *  picking a box instead of prominent/all: its `normalizedRect` on the clip's
   *  opening frame, echoed verbatim as `options.face_swap_target_face`. */
  faceSwapTargetFace?: { x: number; y: number; width: number; height: number };
  /** The clone-scope answer, echoed from its 409 card on the retry only
   *  (media-ai `app/intent/reference_lane.py`): how faithful a reference
   *  rebuild should be. Travels TOP-LEVEL as `clone_fidelity` — the field the
   *  service's confirm gate reads — never via `options`. A trend-modal "Clone
   *  exactly" pick may arm it up front, which skips the question. */
  cloneFidelity?: "style" | "structure" | "exact";
  /** The page-gate answers, echoed from its 409 card on the retry only
   *  (media-ai `_page_unreadable_detail`): the site named in the prompt could
   *  not be read, so either design around this NAME or make a version with no
   *  brand on it. Top-level like `clone_fidelity`, because the gate that reads
   *  them runs at the request boundary before `options` is looked at. */
  brandHint?: string;
  pageGrounding?: "skip";
  /** The `multi_step_prompt` card's answer, echoed from its 409 on the retry
   *  only (media-ai `app/intent/completeness.py`): a prompt written as two
   *  steps with a checkpoint between them cannot be served in one pass, so the
   *  user says which half this turn is. "first" makes the service cut the
   *  prompt at its second step marker. Travels top-level, like the page-gate
   *  answers, because the gate reading it runs at the request boundary. */
  stepScope?: "first" | "all";
  /**
   * The user picked one of several alternative openings, and this turn splices
   * it onto the untouched body. Renders NOTHING — trim and concat — so it is a
   * decision, not a setting: it rides here for the same reason `editScope` does
   * (reaching `options` without a sixteenth positional argument through four
   * drivers) and is armed per turn rather than stored on the composer.
   */
  hookCommit?: {
    /** The film the opening goes in front of. */
    sourceRef: string;
    /** The opening the user chose. */
    openingRef: string;
    seconds?: number;
    /** `prepend` lengthens the film and leaves its audio glued to its own
     *  picture; `replace` swaps the first seconds and keeps the total length. */
    mode?: "prepend" | "replace";
  };
  /** Background music track. Tri-state through the composer: `true`/`false` are
   *  the user's picks and ABSENT is 「AI 決定」, resolved service-side
   *  (`DirectorConfig.default_want_music`). It used to be a required boolean
   *  defaulting to `true`, which is why the Video tab shipped music nobody
   *  asked for and the Agent tab's "auto" was not auto at all. Set it only
   *  through `lib/creative/outputAudio.applyOutputAudio`. */
  backgroundMusic?: boolean;
  /** Voice-over track, same tri-state contract as `backgroundMusic`. The ad
   *  tool's Video node still drives the pair off its single "Generate Audio"
   *  toggle (see host-actions `generateVideo`), which is an explicit pick. */
  audioVoice?: boolean;
  /** Concrete narration voice id (e.g. `"Kore"`, `"Puck"`), forwarded verbatim to
   *  media-ai's `GlobalAudio.voice`. Only sent when a caller resolved one — today
   *  that's the Workflow canvas Video node's Male/Female picker (host-actions
   *  `generateVideo`), which maps the gender pick to a concrete voice id before
   *  it ever reaches here. Absent means the service's own default/language-based
   *  voice applies, same as before this field existed. */
  voice?: string;
  /** Target output resolution (e.g. "720p"/"1080p"). Optional — omit to let the
   *  service pick a default. Forwarded inside the job's `options` bag. */
  resolution?: VideoResolution;
  /** Exact output ratio (e.g. "9:16"). Optional and additive: `orientation` only
   *  says portrait vs landscape, so a model free to pick 3:4 over 9:16 can hand
   *  back a clip that does not fit the ad slot. Set it to pin the frame; omit to
   *  keep the previous behaviour. Must be one the model lists in
   *  `supported_aspect_ratios`. Forwarded inside the job's `options` bag. */
  aspectRatio?: string;
  /** True only when a HUMAN picked {@link aspectRatio} (a tile in the ratio
   *  popover). The third provenance flag, and the one that was missing longest:
   *  this tab ships pinned to 9:16 and had no ratio control at all, so an
   *  `aspect_ratio` on the wire was never evidence that anyone chose it — and a
   *  ratio typed in the prompt ("làm video 16:9", 「横屏」) could never win.
   *  Travels as `options.aspect_explicit`. Never set from a model re-snap:
   *  reconciling a ratio the model does not list is not a choice anyone made. */
  aspectExplicit?: boolean;
};

export const DEFAULT_VIDEO_GEN_CONFIG: VideoGenConfig = {
  mode: "fast",
  orientation: "landscape",
  duration: 4,
  // No audio keys on purpose: absent means 「AI 決定」 now. Every surface that
  // wants a definite answer states it (the ad tool's toggle, the composer's
  //音樂/配音 rows via applyOutputAudio).
};

/**
 * The exact frame each orientation pins to. `orientation` alone only says portrait
 * vs landscape, which leaves the model free to answer 3:4 when the ad slot needs
 * 9:16 — so the ratio is always sent alongside it. Mirrors the per-model twin in
 * lib/media-library/videoModels.ts (there it is filtered against the model's
 * `supported_aspect_ratios`; here nothing is available to filter against).
 */
export const RATIO_FOR_ORIENTATION: Record<VideoOrientation, string> = {
  portrait: "9:16",
  landscape: "16:9",
};

/** The frame to pin for `orientation`, e.g. "portrait" → "9:16". */
export function aspectRatioForOrientation(
  orientation: VideoOrientation,
): string {
  return RATIO_FOR_ORIENTATION[orientation];
}

/**
 * Ratio tiles the Video tab offers when the model declares none (or the catalog
 * is cold). The three shapes an ad is actually cut for; `[0]` is portrait
 * because that is what this tab has always been pinned to, so opening the picker
 * does not silently reframe anything.
 */
export const VIDEO_ASPECT_RATIO_OPTIONS: readonly string[] = [
  "9:16",
  "16:9",
  "1:1",
];

/**
 * The ratio tiles to offer for a model: its own `supported_aspect_ratios` when
 * the catalog knows them, else the generic list. Never intersect the two — a
 * model whose real list is 4:5/2:3 must be able to offer them, the same rule
 * `aspectRatioOptionsFor` follows on the image side.
 */
export function videoAspectRatioOptionsFor(
  modelRatios: readonly string[] | undefined,
): string[] {
  if (!modelRatios || modelRatios.length === 0) {
    return [...VIDEO_ASPECT_RATIO_OPTIONS];
  }
  return [...modelRatios];
}

/**
 * The ratio to SHOW: the config's own when this model renders it, else the first
 * one it does. Mirrors the duration pill's `snapVideoDuration` — a trigger must
 * never read a value the selected model rejects. Returns `undefined` only when
 * nothing is known, so an unset config stays unset rather than acquiring a shape
 * nobody asked for.
 */
export function snapVideoAspectRatio(
  value: string | undefined,
  options: readonly string[],
): string | undefined {
  if (value && options.includes(value)) return value;
  if (options.length === 0) return value;
  return options[0];
}

/**
 * A tile click. The ONE thing that marks the ratio as the user's own — the
 * service reads `aspectExplicit` to tell a choice from this tab's long-standing
 * 9:16 pin, and a ratio typed in the prompt beats the pin.
 */
export function applyAspectRatioPick(
  config: VideoGenConfig,
  aspectRatio: string,
): VideoGenConfig {
  return { ...config, aspectRatio, aspectExplicit: true };
}

/**
 * The re-snap after a model switch, or `null` when nothing needs writing.
 *
 * Deliberately does NOT set `aspectExplicit`: reconciling a stored 21:9 onto a
 * model that only frames 9:16 is the app correcting itself, not a choice anyone
 * made — the same discipline the duration reconcile effect follows. It also
 * leaves an UNSET ratio unset, so a request that never pinned a frame keeps
 * letting the service decide.
 */
export function reconcileAspectRatio(
  config: VideoGenConfig,
  options: readonly string[],
): VideoGenConfig | null {
  if (!config.aspectRatio) return null;
  const snapped = snapVideoAspectRatio(config.aspectRatio, options);
  if (!snapped || snapped === config.aspectRatio) return null;
  return { ...config, aspectRatio: snapped };
}

/** Clip length the ad-video tool asks for. Roughly what an ad wants, and a value
 *  most catalog models accept (Veo 3.1 caps at 8 and Kling O1 does 5/10, so the
 *  service re-clamps per model — this is the preference, not a guarantee). */
export const AD_VIDEO_DURATION_SECONDS: VideoDuration = 10;

/** Orientation the ad-video tool shoots in — every template it offers is vertical
 *  (TikTok / Reels / Shorts are 9:16). */
export const AD_VIDEO_ORIENTATION: VideoOrientation = "portrait";

/**
 * Starting clip settings for the ad-video tool: what a vertical ad needs rather
 * than the generic landscape 4s default. The tool's "Video" panel edits these,
 * so treat it as the seed, not a fixed value. The image→video twin lives in
 * lib/media-library/mediaJobs (`AD_VIDEO_GEN_CONFIG`) and stays separate — it
 * renders silent clips.
 */
export const AD_VIDEO_COMPOSER_CONFIG: VideoGenConfig = {
  ...DEFAULT_VIDEO_GEN_CONFIG,
  orientation: AD_VIDEO_ORIENTATION,
  duration: AD_VIDEO_DURATION_SECONDS,
  aspectRatio: aspectRatioForOrientation(AD_VIDEO_ORIENTATION),
  resolution: "720p",
};

/** Total length the home composer's video tab starts at.
 *
 *  A DELIVERED length, not a clip length, because that is what its duration pill
 *  now states. 30s is the bottom of the TikTok band (30-45s) users actually
 *  publish; the previous 10s seed came from the ad tool, described one clip, and
 *  was then silently floored to 36s by the storyboard path — so the pill and the
 *  board it produced never agreed. */
export const COMPOSER_VIDEO_DURATION_SECONDS: VideoDuration = 30;

/** Starting settings for the home composer's video tab. Same frame and audio as
 *  the ad tool's seed, but a delivered length rather than a clip length. */
export const COMPOSER_VIDEO_CONFIG: VideoGenConfig = {
  ...AD_VIDEO_COMPOSER_CONFIG,
  duration: COMPOSER_VIDEO_DURATION_SECONDS,
};

/** A tile in the video config popover. The label is not stored here: it comes
 *  from i18n so the panel reads in the user's language. */
type TileOption<T> = {
  value: T;
  icon: LucideIcon;
};

export const VIDEO_MODE_OPTIONS: TileOption<VideoMode>[] = [
  { value: "fast", icon: Zap },
  { value: "quality", icon: Cpu },
];

export const VIDEO_ORIENTATION_OPTIONS: TileOption<VideoOrientation>[] = [
  { value: "landscape", icon: RectangleHorizontal },
  { value: "portrait", icon: RectangleVertical },
];

/** Duration tiles shown when the model is unknown ("Auto", or a cold catalog) —
 *  the service picks the model then, so offer a spread most models accept. A
 *  model with a known list gets its own tiles via {@link durationOptionsFor}. */
export const VIDEO_DURATION_OPTIONS: VideoDuration[] = [4, 6, 8, 10, 12, 15];

/** Delivered lengths offered above a model's single-take ceiling. Short-video
 *  lengths first — a TikTok ad is 30-45s, which is why 15s alone read as "this
 *  product cannot make my video" — then the long tail up to the service cap. */
export const DELIVERED_TOTAL_OPTIONS: VideoDuration[] = [20, 30, 45, 60, 90, 120];

/** Above this many single-take lengths, thin the row to
 *  {@link SINGLE_SHOT_DISPLAY_STEPS}. Six tiles is two rows of three. */
export const SINGLE_SHOT_TILE_LIMIT = 6;

/** Which single-take lengths survive the thinning, when a model lists too many
 *  to show. Every value a catalog model actually advertises as its longest is in
 *  here, so no ceiling is ever thinned away. */
export const SINGLE_SHOT_DISPLAY_STEPS: VideoDuration[] = [
  4, 6, 8, 10, 12, 15, 16, 20, 30,
];

/** English labels for surfaces that do not run through i18n (the canvas editor's
 *  picker). The translated copy lives in `useSuggestionPillsI18n`. */
export const VIDEO_ORIENTATION_FALLBACK_LABELS: Record<
  VideoOrientation,
  string
> = {
  landscape: "Landscape",
  portrait: "Portrait",
};

export const VIDEO_ORIENTATION_SECTION_ICON = Proportions;

/** Sample prompts shown under the video panel. Clicking one fills the composer.
 *  Ids only — the copy lives in i18n (`videoAd.generateVideo.samplePrompts`). */
export const VIDEO_GEN_SAMPLE_PROMPT_IDS = [
  "nba-finals",
  "starry-night",
  "dress-explosion",
  "owl-forest",
  "cartographer",
] as const;
