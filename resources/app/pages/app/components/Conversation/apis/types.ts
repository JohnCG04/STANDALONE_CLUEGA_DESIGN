
// Source of truth for image-vs-video dispatch on `POST /jobs`. The media-ai-service
// requires `type` and uses it to route the prompt to the image or video tool — it
// does NOT infer the medium from the prompt text. See `.claude/skills/apis/media.api.md`.
export type MediaJobType = 'image' | 'video'

export type MediaJobStatusResponse = {
    job_id?: string
    status?: string
    result?: MediaJobResult | null
    error?: string | null
    /** The failure's code beside its sentence, so a caller can map it to copy
     *  of its own instead of matching words in prose. */
    error_code?: string | null
    /** 0-100 while the job runs. Absent on a backend that does not report one,
     *  which is why a reader must not treat a missing value as zero. */
    progress?: number
    /** A stop cancelled with `discard_outputs`: billed, but nothing it made is
     *  kept — even an output the result still names must not be delivered. */
    discarded?: boolean
}

import type { VideoJobHook } from './video.api'

export type MediaJobResult = {
    output_url?: string
    outputUrl?: string
    artifact_url?: string
    artifactUrl?: string
    download_url?: string
    downloadUrl?: string
    image_url?: string
    imageUrl?: string
    output_path?: string
    outputPath?: string
    path?: string
    url?: string
    output_urls?: string[]
    output_refs?: string[]
    /** Canonical artifact identifiers returned by media jobs. */
    output_file_ids?: string[]
    /** Provider- or feature-specific artifact metadata (e.g. Dub captions). */
    metadata?: Record<string, unknown>
    // Split Layers: how the stacked layers and their text sit on one canvas (snake_case, as served).
    design_layers?: unknown
    // Why a finished job has fewer pictures than asked for, or none. All three
    // are already on the wire — `GET /jobs/{id}` returns `result` verbatim —
    // and were simply never read, so a job that stated its reason arrived at
    // the UI as an unexplained blank.
    //
    // `fidelity_release`: delivered, but further from the reference than the
    // gate wanted. `awaiting`: the turn stopped on purpose and is waiting on
    // something (`kind: "confirm"` waits on the user). `withheld_refs`: takes
    // that exist in the artifact store and were not delivered.
    fidelity_release?: {
        reason?: string
        verdict?: string
        similarity?: number | null
    } | null
    awaiting?: { kind?: string; reason?: string } | null
    withheld_refs?: string[]
    fidelity?: { verdict?: string; similarity?: number | null; feedback?: string }
    // Which opening this job rendered and how strongly it reads — only a
    // hook-axis job carries it. Structural rather than another url alias, so it
    // is listed here rather than folded into the loose shape above.
    hook?: VideoJobHook
    tool_id?: string
    // The text-to-text chat job (POST /chat → poll) returns the enriched prompt here.
    // See `rewritePromptViaChat` in components/workflow/actions/basic/promptEnhanceApi.ts.
    text?: string | null
    data?: {
        output_urls?: string[]
        output_refs?: string[]
        tool_id?: string
    }
    output?: MediaJobResult
    image?: MediaJobResult
    artifacts?: MediaJobResult[]
    outputs?: MediaJobResult[]
    files?: MediaJobResult[]
}

export type MediaChatEventPayload = {
    data?: MediaChatEventPayload
    result?: MediaJobResult | null
    job?: {
        id?: string
        job_id?: string
        jobID?: string
    }
    job_id?: string
    jobID?: string
    jobId?: string
    id?: string
    delta?: string
    text?: string
    message?: string
    content?: string
    label?: string
    summary?: string
    status?: string
    output_url?: string
    outputUrl?: string
    output_urls?: string[]
    output_refs?: string[]
    tool_id?: string
}

export type MediaPromptProgressEvent = {
    event: string
    message: string
    jobId?: string
    mode?: 'append' | 'line'
}

export type MediaPromptResult = {
    jobId: string
    text?: string
    outputUrls: string[]
}

export type RunMediaPromptOptions = {
    signal?: AbortSignal
    onProgress?: (event: MediaPromptProgressEvent) => void
    // Real model id forwarded to the media job (POST /jobs `model`). Omit to let
    // the service pick its default / auto-route.
    model?: string
}

// One entry from `GET /models/images` (media-ai-service). Only `id` is relied on;
// the rest is best-effort metadata for the picker.
export type MediaImageModel = {
    id: string
    name?: string
    display_name?: string
    description?: string
    modality?: string
    pricing?: unknown
}

// One entry from `GET /models/videos` (media-ai-service). Same picker contract as
// the image catalog — only `id` is relied on, the rest is best-effort metadata.
export type MediaVideoModel = {
    id: string
    name?: string
    provider_name?: string
    description?: string
    modality?: string
    supports_video_to_video?: boolean
    /** Whether this model's PROVIDER permits footage (or a still) showing a real
     *  person as input. Measured server-side, and absent means UNMEASURED — not
     *  permitted: ByteDance refuses with
     *  InputVideoSensitiveContentDetected.PrivacyInformation, which failed every
     *  edit turn on real footage. */
    accepts_real_person_input?: boolean
    /** Whether the model reads a caller-supplied AUDIO track and moves the
     *  mouth to it. NOT the same as generating a soundtrack: this is the
     *  lip-sync lane. Absent means no — and media-ai strips the field from the
     *  listing when the lane is switched off, so its presence is also the
     *  answer to "can this deployment serve a lip-synced render?". */
    accepts_audio_input?: boolean
    supported_resolutions?: string[]
    supported_aspect_ratios?: string[]
    supported_durations?: number[]
    /** The FE-vocabulary alias media-ai emits alongside `supported_durations`.
     *  Both names carry the same list; a config-fallback entry (upstream video
     *  catalog unreachable) historically carried ONLY this one, which is why
     *  every reader must accept either. */
    durations?: number[]
    /** Seedance 2.x direct rows (media-ai `app/seedance`): which omni tasks the
     *  Workflow Video / Video Edit / Video Extend nodes may run, and the per-task
     *  reference caps. Read by the workflow lib's `toCapabilities`. */
    video_tasks?: ("reference" | "edit" | "extend")[]
    max_reference_images?: number
    max_reference_videos?: number
    max_reference_audios?: number
    omni_task_type?: boolean
    virtual_portrait_assets?: boolean
    supported_frame_images?: ("first_frame" | "last_frame")[]
    pricing_skus?: unknown
    pricing?: unknown
    display_name?: string
}

// One entry from `GET /models/text` (media-ai-service) — a text/LLM (chat) model.
// The service returns its top "smartest" chat models ranked by a heuristic
// `smart_score` (NOT a real benchmark). Only `id` is relied on for the picker; the
// rest is best-effort metadata, matching the image/video catalogs. `pricing.*` may
// be null when upstream omits a price; handle `models: []` (cold/failed cache).
export type MediaTextModel = {
    id: string
    name?: string
    display_name?: string
    description?: string
    provider?: string
    type?: string
    tags?: string[]
    context?: number | null
    pricing?: { prompt?: number | null; completion?: number | null } | null
    capabilities?: { reasoning?: boolean; function_calling?: boolean; vision?: boolean }
    smart_score?: number
}

// One follow-up question from `POST /jobs/clarify` — rendered as a form field when
// the prompt is missing information (`is_complete: false`). `input_type` drives the
// widget; `options` is populated only for `input_type: "select"`.
export type ClarifyQuestion = {
    id: string
    question: string
    hint?: string
    required?: boolean
    input_type?: 'text' | 'textarea' | 'select' | 'number'
    options?: string[]
    /** Whether `options` are suggestions the user may type over, or the whole
     *  set of valid answers. Populated when `suggest_answers` was asked for. */
    allow_custom?: boolean
    /** Which theme facet this question is, when the theme round is on:
     *  subject | style | palette | layout | position | aspect | count.
     *  Empty on every question that predates the round. */
    axis?: string
}

/** The single "shall I make it?" card, present only when `is_complete`.
 *  `question` is the model's paraphrase of what will be made, in the user's
 *  language, and is rendered verbatim; the labels are chrome. */
export type ClarifyConfirm = {
    question: string
    confirm_label?: string
    cancel_label?: string
}

// Response of the text-to-text clarify pre-flight (`POST /jobs/clarify`). It runs
// ONE LLM pass and returns TEXT only (never media). `enriched_prompt` is ALWAYS
// present — a clean, production-ready rewrite of the user's prompt. `questions` is
// empty when `is_complete` is true (the backend normalizes the two to agree, so
// trust `is_complete`: any question ⇔ false).
export type ClarifyResult = {
    detected_intent?: string
    is_complete?: boolean
    enriched_prompt: string
    questions?: ClarifyQuestion[]
    confirm?: ClarifyConfirm
}
