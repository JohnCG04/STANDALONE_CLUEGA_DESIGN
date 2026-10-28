export const PROMPT_STORAGE_KEY = 'cluega-image-editor-generate-prompt'
// Loading placeholder for a chat-driven generation: a default-size slot that
// renders the generating animation until the streamed result swaps in and
// auto-fits to its natural ratio. Mirrors the canvas default footprint/origin.
export const LOADING_PLACEHOLDER_WIDTH = 400
export const LOADING_PLACEHOLDER_HEIGHT = 300
export const LOADING_PLACEHOLDER_ORIGIN = 100
export const GENERATED_RESULT_GAP = 24
// Screen space (px) kept free below the focused placeholder so the generate prompt panel stays in view.
export const GENERATE_PANEL_RESERVED_HEIGHT = 220

// ─── Canvas image-to-video (the `enableVideoGeneration` flow) ────────────────────
// Everything the canvas "Generate Video" button sends beyond the prompt + source
// image lives here, so the flow is configured in one place.

// The video model this flow pins. Unlike the composer/workflow video flows (where the
// user picks, or the service auto-routes), the canvas always runs this one — the
// panel's own model picker holds the IMAGE model, which must never reach a video job.
export const CANVAS_VIDEO_MODEL = 'openrouter/alibaba/happyhorse-1.1'

// Output resolution sent in the job's `options` bag on every canvas video job.
export const CANVAS_VIDEO_RESOLUTION = '720p'

// Selectable clip lengths for the panel's Duration picker, in whole seconds. The list
// is built contiguously from these inclusive bounds (same as the workflow Video node's
// duration options), so changing a bound changes the picker.
export const CANVAS_VIDEO_DURATION_MIN = 4
export const CANVAS_VIDEO_DURATION_MAX = 15
export const CANVAS_VIDEO_DURATION_OPTIONS = Array.from(
  { length: CANVAS_VIDEO_DURATION_MAX - CANVAS_VIDEO_DURATION_MIN + 1 },
  (_, index) => CANVAS_VIDEO_DURATION_MIN + index,
)

/**
 * Clamp an arbitrary value to a whole-second duration this flow can actually request
 * ([CANVAS_VIDEO_DURATION_MIN, CANVAS_VIDEO_DURATION_MAX]). Non-numeric input falls
 * back to the minimum — the picker's default.
 */
export function clampCanvasVideoDuration(value: unknown): number {
  const seconds = typeof value === 'string' ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return CANVAS_VIDEO_DURATION_MIN
  }
  return Math.min(
    CANVAS_VIDEO_DURATION_MAX,
    Math.max(CANVAS_VIDEO_DURATION_MIN, Math.round(seconds)),
  )
}
