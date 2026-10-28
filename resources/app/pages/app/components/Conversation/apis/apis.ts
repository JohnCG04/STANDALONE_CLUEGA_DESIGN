import { mediaConversationFields, type MediaConversationTurn } from "@/lib/media/conversationContext";
import {
  currentChatSessionId,
  mediaBaseUrl,
  mediaFetch,
  streamOpenError,
  upstreamErrorMessage,
} from './api.helper'
import {
  ClarifyResult,
  MediaImageModel,
  MediaJobStatusResponse,
  MediaJobType,
  MediaTextModel,
  MediaVideoModel,
} from './types'
import { throwIfInsufficientPoints } from './billing.api'
import { throwIfIntentConflict } from './intentConflict.api'
import type { CreativeInputFiles } from '@/lib/creative/generationPayload'
import { skillJobFields, type SkillsInput } from '@/lib/media-skills/selection'
import type { FlowJobTarget } from '@/components/workflow/shared/types'

export type IntentAnswers = {
  clone_fidelity?: 'style' | 'structure' | 'exact'
  generation_method?: string
  intent_confirmed?: true
}

/** The `type_upload` a job's outputs are stored under (media-ai CreateJobRequest). */
export type MediaJobTypeUpload = 'ai_upload' | 'support_ai_file'

type MediaCreateJobResponse = {
  job_id?: string
  jobID?: string
  // A video submit with `n>1` fans out server-side into sibling jobs sharing a
  // group_id; consumers that only read `job_id` silently lose the other outputs.
  job_ids?: string[]
  group_id?: string
  // Service-side notices about how the request was interpreted — a ratio or a
  // count named in the prompt overriding the panel's. Dropped on the floor here
  // until now, which made an `intent_*` override invisible on the image surface.
  // Codes are stable; the message is already localized server-side.
  warnings?: Array<{ code?: string; message?: string }>
  // One entry per OUTPUT when the request asked for several options of one
  // picture ("4 cover options ranked by CTR"). Unlike the video fan-out these
  // all come from ONE job, so `index` — not `job_id` — is the slot key.
  variants?: Array<{
    job_id?: string
    index?: number
    kind?: string
    title?: string
    brief?: string
  }>
}

/** One named output of a multi-output image job, in the order it renders. */
export type MediaJobVariant = {
  index: number
  kind: string
  title: string
  brief: string
}

/** One submit's job identity: the primary id, every sibling, and their group. */
export interface MediaJobGroup {
  jobId: string
  jobIds: string[]
  groupId: string
  /** What the service changed about the request and why. */
  warnings: Array<{ code?: string; message?: string }>
  /** Per-output captions, when this turn asked for several options. */
  variants: MediaJobVariant[]
}

/**
 * The job's `options` object, or nothing at all.
 *
 * Two independent writers share it: the intent gate's answered keys on a retry,
 * and the render settings media-ai reads off `params` (today: `resolution`).
 * Emitted only when one of them has something to say, so a plain first
 * submission keeps the body it has always had — /jobs treats an absent `options`
 * as `{}`.
 */
function jobOptions(
  intentOptions?: Record<string, unknown>,
  resolution?: string,
) {
  const options = {
    ...(intentOptions ?? {}),
    ...(resolution ? { resolution } : {}),
  }
  return Object.keys(options).length ? { options } : {}
}

function buildChatJobRequest(
  prompt: string,
  model?: string,
  inputFiles?: string[],
  type: MediaJobType = 'image',
  runs?: number,
  aspectRatio?: string,
  workflowId?: string,
  isPromptEnhance?: boolean,
  skills?: SkillsInput,
  // Role-typed materials from the creative composer. When absent the body is
  // byte-identical to what it has always been, which is what keeps the other
  // call sites (workflow nodes, the canvas, prompt-enhance) untouched.
  creative?: CreativeInputFiles,
  // UI locale for user-visible job progress. Kept separate from the generated
  // content language (video/TTS) so a Chinese prompt cannot switch a Vietnamese
  // interface to Chinese halfway through a turn.
  locale?: string,
  // Seeds a row in the workflow page's job ledger the moment the gateway sees
  // the submit. TOP-LEVEL fields on purpose — see FlowJobTarget. Only sent from
  // the workflow editor; every other flow leaves it undefined.
  flow?: FlowJobTarget,
  // Whether a HUMAN picked `aspectRatio`. Trailing and only-when-true, so every
  // existing caller's body stays byte-identical. Without it the service reads
  // the panel's default 1:1 as an instruction and a ratio named in the prompt
  // can never win.
  aspectExplicit?: boolean,
  // The intent gate's answered keys (face_swap_consent, target_faces …), sent
  // only on the retry that carries an answer — a first submission stays
  // byte-identical. They ride the job's `options`, which the chat image path
  // otherwise never sends.
  intentOptions?: Record<string, unknown>,
  // The composer's Style pill (a GET /styles preset id). Trailing + optional so
  // every existing call site is untouched.
  style?: string,
  // The picked resolution TIER ("1K"/"2K"/"4K"), which rides `options` rather
  // than a field of its own: media-ai reads `params.resolution` and maps it to
  // the chat-image contract's `image_config.image_size`, validated against the
  // model's `supported_resolutions` and silently dropped when that model can't
  // honour it. The same channel the video lane's `options.resolution` uses.
  // NOT prose in the prompt — the structured field exists, so the prompt has no
  // business carrying a render setting.
  resolution?: string,
  // Does this job carry the tenant's Brand Kit? (PRD IMG-21.) A setting, not a
  // per-turn choice, so it is read from creative prefs at the call site rather
  // than threaded through the composer — the same way `style` is.
  //
  // A FLAG, not an id. The service resolves it to the workspace's default brand
  // (`is_default`, else the newest) and applies exactly what a `brand_id` job
  // applies. The client no longer carries the id because the id was a copy of a
  // server-side decision, and a copy in localStorage is one that goes stale in
  // the other browser, on the other machine, after a delete.
  //
  // `false` is the workflow's Brand Kit switch turned OFF and is sent as
  // `use_brand: false`; `undefined` (no default brand) omits the field.
  useBrand?: boolean,
  // The intent gate's body-level answers (see IntentAnswers). Trailing and
  // spread only when present, so a caller that never meets the gate posts the
  // body it posts today.
  intentAnswers?: IntentAnswers,
  conversation?: MediaConversationTurn,
  // How the outputs are filed: support_ai_file keeps them out of Assets (a game cover).
  typeUpload?: MediaJobTypeUpload,
) {
  // A job belongs to one surface: inside the workflow editor the job is the
  // workflow's, even though the editor lives under the same /app path.
  const conversationId = workflowId ? '' : (conversation?.conversationId ?? currentChatSessionId())
  return {
    // `type` is required by the media-ai-service and is the source of truth for
    // image-vs-video dispatch — without it the router cannot tell which medium to
    // generate. This is the image (design) path, so it defaults to "image".
    type,
    prompt,
    // The previous generated image(s) for a follow-up turn. The backend's
    // image-edit tool (openai_images_edit) requires these as its input; leaving
    // it empty on a follow-up makes it fail with "input_refs is empty".
    //
    // The creative composer sends the same list as role-typed objects instead, so
    // the backend is told which ref is the product rather than guessing from a
    // url that may carry no extension at all.
    //
    // An EMPTY creative list does not win. Inside a media conversation the
    // creative snapshot is always present, and with no attachment chip it is
    // `{input_files: []}` — which used to erase the previous turn's image that
    // `inputFiles` carries. The backend then saw a request with nothing to edit
    // (`_coerce_media_intent`: no input_files ⇒ "generate") and answered "thêm
    // cây cối" with a brand-new picture instead of the one on screen.
    input_files: creative?.input_files?.length
      ? creative.input_files
      : (inputFiles ?? []),
    // Pasted product/image links. Independent of `input_files`: a link may be
    // the ONLY thing the turn carries, and the backend reads it for the product
    // and for the photos to use.
    ...(creative?.reference_urls?.length
      ? { reference_urls: creative.reference_urls }
      : {}),
    ...(creative?.page_image_urls?.length
      ? { page_image_urls: creative.page_image_urls }
      : {}),
    // Top-level `model` is the user-picked IMAGE-GENERATION model.
    ...(model ? { model } : {}),
    // `runs` → the API's `n` field: how many variants to generate in parallel
    // (1–10, see CreateJobRequest in media.api.md). Only sent when a valid,
    // positive count is supplied; otherwise the backend defaults to a single run.
    ...(typeof runs === 'number' && runs > 0 ? { n: runs } : {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    // The picked look (GET /styles id). OMITTED when unset — /jobs validates
    // `style` against a closed enum and 422s on "". media-ai merges it
    // user-first into whatever tags the router or a template produced, so this
    // stacks on the Template pill rather than fighting it.
    ...(style ? { style } : {}),
    ...(aspectExplicit ? { aspect_explicit: true } : {}),
    // The workflow project this job belongs to (workflow Image node). Only sent
    // from the workflow editor; the chat/design flow leaves it undefined.
    ...(workflowId ? { workflow_id: workflowId } : {}),
    // The conversation this job was asked for — workflow_id's counterpart. It is
    // what lets the Material Center's "Chat" badge open the conversation a
    // generated file came out of, the way the "Workflow" badge already opens its
    // canvas.
    ...(conversationId ? { conversation_id: conversationId } : {}),
    ...(!workflowId ? mediaConversationFields(conversation) : {}),
    // Marks a generation kicked off by the workflow prompt-enhance flow. Only sent
    // when true; a normal generation leaves it off entirely.
    ...(isPromptEnhance ? { is_prompt_enhance: true } : {}),
    // Enabled media skills (PRD IV): pins in `skills`, and in auto mode the
    // enabled pool in `skill_candidates` for the backend's per-prompt
    // relevance selector. Announced back as `skill_applied` (with `auto`).
    ...skillJobFields(skills),
    ...(locale ? { locale } : {}),
    ...jobOptions(intentOptions, resolution),
    // Omitted when undefined, so a workspace with no default brand posts exactly
    // the body it posted before the Brand Kit existed. An explicit `false` (the
    // workflow's Brand Kit switch off) is sent as is.
    ...(useBrand !== undefined ? { use_brand: useBrand } : {}),
    // Answered gate axes. Top-level because that is where the gate reads them
    // (IntentAnswers) — `options` is too late.
    ...(intentAnswers ?? {}),
    // The workflow page/node/seq that placed the job, top-level so the gateway
    // can seed the page's job ledger while media-ai ignores them.
    ...(flow ?? {}),
    ...(typeUpload ? { type_upload: typeUpload } : {}),
  }
}

/**
 * `createMediaJob` with the submit's full identity: the primary job id plus
 * every fan-out sibling and their shared group. The workflow job ledger must
 * record ALL of them — a consumer that keeps only `job_id` silently loses the
 * other deliverables of an `n>1` submit.
 */
export async function createMediaJobGroup(
  prompt: string,
  signal?: AbortSignal,
  model?: string,
  inputFiles?: Array<any>,
  type: MediaJobType = 'image',
  runs?: number,
  aspectRatio?: string,
  workflowId?: string,
  isPromptEnhance?: boolean,
  skills?: SkillsInput,
  creative?: CreativeInputFiles,
  locale?: string,
  flow?: FlowJobTarget,
  aspectExplicit?: boolean,
  intentOptions?: Record<string, unknown>,
  style?: string,
  resolution?: string,
  useBrand?: boolean,
  intentAnswers?: IntentAnswers,
  conversation?: MediaConversationTurn,
  typeUpload?: MediaJobTypeUpload,
): Promise<MediaJobGroup> {
  const response = await mediaFetch(`${mediaBaseUrl()}/jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      buildChatJobRequest(
        prompt,
        model,
        inputFiles,
        type,
        runs,
        aspectRatio,
        workflowId,
        isPromptEnhance,
        skills,
        creative,
        locale,
        flow,
        aspectExplicit,
        intentOptions,
        style,
        resolution,
        useBrand,
        intentAnswers,
        conversation,
        typeUpload,
      ),
    ),
    signal,
  })

  // The intent gate asked a question (image face-swap consent / which-face).
  // Before the generic check for the same reason the video path does it: a
  // question the driver can put in the chat must not surface as an error.
  await throwIfIntentConflict(response)
  // Billing gate: a 402 insufficient_points must surface as a typed, i18n'd
  // error (+ toast) instead of the raw backend JSON.
  await throwIfInsufficientPoints(response)
  if (response.status !== 202) {
    throw new Error(await upstreamErrorMessage(response))
  }

  const payload = (await response.json()) as MediaCreateJobResponse
  const jobId = payload.job_id ?? payload.jobID
  if (!jobId) {
    throw new Error('Media job response is missing job_id.')
  }

  return {
    jobId,
    // Older deployments predate the fan-out fields; a solo job is its own group.
    jobIds: payload.job_ids?.length ? payload.job_ids : [jobId],
    groupId: payload.group_id || jobId,
    warnings: payload.warnings ?? [],
    // Dropped unless it names something: a row with neither a title nor a kind
    // would render an empty caption bar under the tile.
    variants: (payload.variants ?? [])
      .filter((variant) => variant.title || variant.kind)
      .map((variant, position) => ({
        index: typeof variant.index === 'number' && variant.index >= 0 ? variant.index : position,
        kind: variant.kind ?? '',
        title: variant.title ?? '',
        brief: variant.brief ?? '',
      })),
  }
}

/** Single-id convenience over `createMediaJobGroup` — the pre-ledger contract
 *  every chat/design caller keeps. */
export async function createMediaJob(
  ...args: Parameters<typeof createMediaJobGroup>
) {
  return (await createMediaJobGroup(...args)).jobId
}

export async function fetchMediaChat(prompt: string, signal?: AbortSignal, model?: string) {
  const conversationId = currentChatSessionId()
  const response = await mediaFetch(
    `${mediaBaseUrl()}/chat`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        input_files: [],
        ...(model ? { model } : {}),
        // Rides along so anything this turn generates is tagged with the
        // conversation it was generated in — same field, same purpose as on
        // /jobs above.
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }),
      signal,
    },
    'text/event-stream',
  )

  if (!response.ok || !response.body) {
    throw new Error(await upstreamErrorMessage(response))
  }

  return response
}

export async function fetchJobStatus(jobId: string, signal?: AbortSignal) {
  const response = await mediaFetch(`${mediaBaseUrl()}/jobs/${jobId}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response))
  }

  return response.json() as Promise<MediaJobStatusResponse>
}

// Opens the live SSE progress stream for a job (GET /jobs/{job_id}/stream). Late
// subscribers get buffered events first, then live-tail; the stream closes on the
// terminal `done`/`error` event. Returns the raw Response so the caller owns the
// frame decoding (see jobStreamDriver). This is the channel that carries the real
// reasoning timeline (`thinking`, `action_*`, `step_*`).
export async function fetchJobStream(jobId: string, signal?: AbortSignal) {
  const response = await mediaFetch(
    `${mediaBaseUrl()}/jobs/${jobId}/stream`,
    { signal },
    'text/event-stream',
  )

  if (!response.ok || !response.body) {
    throw new Error(await upstreamErrorMessage(response))
  }

  return response
}

// Opens the live SSE BLOCK stream for a job (GET /jobs/{job_id}/stream/blocks).
// Same job, but the backend's BlockStreamAdapter pre-folds the flat timeline into
// the message → phase → block lifecycle the phaseReducer consumes directly, so the
// FE no longer transforms it client-side (see createSseDriver). Late subscribers
// get the replay buffer first; the stream closes on `message_done`.
export async function fetchJobBlockStream(jobId: string, signal?: AbortSignal) {
  const response = await mediaFetch(
    `${mediaBaseUrl()}/jobs/${jobId}/stream/blocks`,
    { signal },
    'text/event-stream',
  )

  if (!response.ok || !response.body) {
    throw await streamOpenError(response)
  }

  return response
}

// Lists image-capable models from the media-ai-service (it proxies + caches the
// OpenRouter image catalog). Used to populate the composer's model picker when
// the design (image generation) tool is active.
export async function fetchImageModels(signal?: AbortSignal): Promise<MediaImageModel[]> {
  const response = await mediaFetch(`${mediaBaseUrl()}/models/images`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response))
  }

  const payload = (await response.json()) as { models?: MediaImageModel[] }
  return payload.models ?? []
}

// Lists video-capable models from the media-ai-service (it proxies + caches the
// OpenRouter video catalog). Used to populate the composer's model picker when
// the generate-video tool is active — the video twin of `fetchImageModels`.
export async function fetchVideoModels(signal?: AbortSignal): Promise<MediaVideoModel[]> {
  return (await fetchVideoModelCatalog(signal)).models
}

/** The catalog plus the ids that can serve an EDIT, best first.
 *
 *  Every row already carries `supports_video_to_video`, but the server also
 *  knows the ORDER it would route an edit in (`video_edit_models`) — an
 *  in-context editor before a general video model. Dropping that list left the
 *  client re-deriving a worse answer from the flag alone. */
export async function fetchVideoModelCatalog(
  signal?: AbortSignal,
): Promise<{ models: MediaVideoModel[]; videoEditModels: string[] }> {
  const response = await mediaFetch(`${mediaBaseUrl()}/models/videos`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response))
  }

  const payload = (await response.json()) as {
    models?: MediaVideoModel[]
    video_edit_models?: string[]
  }
  return {
    models: payload.models ?? [],
    videoEditModels: payload.video_edit_models ?? [],
  }
}

// Lists text (chat/LLM) models from the media-ai-service (GET /models/text). It
// returns the top "smartest" chat models ranked by a heuristic `smart_score`; only
// `id` is relied on for the picker, the rest is best-effort metadata — the text
// twin of `fetchImageModels` / `fetchVideoModels`. No header is required (the CDP
// gateway derives the tenant from the JWT). The listing is cached ~1h upstream and
// returns an EMPTY list on a cold/failed cache rather than erroring, so callers
// must handle `models: []`.
export async function fetchTextModels(signal?: AbortSignal): Promise<MediaTextModel[]> {
  const response = await mediaFetch(`${mediaBaseUrl()}/models/text`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response))
  }

  const payload = (await response.json()) as { models?: MediaTextModel[] }
  return payload.models ?? []
}

// Text-to-text pre-flight (POST /jobs/clarify): a single LLM pass that rewrites the
// user's prompt into a clean, production-ready form and (optionally) surfaces
// follow-up questions. It returns TEXT only — it never generates media, so it is
// the step BEFORE `createMediaJob`. `inputFiles` are artifact ids / URLs the
// backend reads for image-to-text grounding; `model` overrides the LLM (e.g.
// "openai/gpt-4o-mini"). Tenant is derived server-side by the CDP gateway, so no
// X-Tenant-Id header is sent (mirrors the other media calls). Reply is in the same
// language as `prompt`. Throws on 5xx/422 with the backend's reason.
export async function enrichPrompt(
  args: {
    prompt: string
    inputFiles?: string[]
    model?: string
    /** Ask for 2-4 plausible example answers per question, so the theme card
     *  can offer chips instead of five empty boxes. */
    suggestAnswers?: boolean
    /** Ask about how the render should LOOK as well as whether it can run.
     *  ANDed with the server's own flag, so this cannot turn the round on by
     *  itself. */
    themeRound?: boolean
    /** What the settings bar currently holds. Sent so the round does not ask
     *  about a shape or a count the user already picked, which POST /jobs
     *  would then have to arbitrate a second time. `*Explicit` is the point
     *  of the pair: a pill's default is not an answer. */
    aspectRatio?: string
    aspectExplicit?: boolean
    n?: number
    nExplicit?: boolean
    /** Axes the card ALREADY collected, named on the SECOND call. Without it
     *  the second pass re-asks what the first one just answered — seen live as
     *  "do you want a different palette?" against a prompt that already named
     *  one. Authoritative on the server, unlike its own prose heuristics,
     *  because we hold the fields and the answers. */
    answeredAxes?: string[]
    /** Only for the confirm card's FALLBACK chrome, when the model returns a
     *  complete result without writing its own confirm block. */
    locale?: string
  },
  signal?: AbortSignal,
): Promise<ClarifyResult> {
  const response = await mediaFetch(`${mediaBaseUrl()}/jobs/clarify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      prompt: args.prompt,
      input_files: args.inputFiles ?? [],
      ...(args.model ? { model: args.model } : {}),
      ...(args.suggestAnswers ? { suggest_answers: true } : {}),
      ...(args.themeRound ? { theme_round: true } : {}),
      ...(args.aspectRatio ? { aspect_ratio: args.aspectRatio } : {}),
      ...(args.aspectExplicit ? { aspect_explicit: true } : {}),
      ...(args.n !== undefined ? { n: args.n } : {}),
      ...(args.nExplicit ? { n_explicit: true } : {}),
      ...(args.answeredAxes?.length
        ? { answered_axes: args.answeredAxes }
        : {}),
      ...(args.locale ? { locale: args.locale } : {}),
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response))
  }

  return response.json() as Promise<ClarifyResult>
}
