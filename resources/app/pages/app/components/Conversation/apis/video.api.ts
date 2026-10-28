import { mediaConversationFields, type MediaConversationTurn } from "@/lib/media/conversationContext";
import type { CreativeGenerationPayload } from "@/lib/creative/generationPayload";
import { useCreativeComposerStore } from "@/lib/stores/useCreativeComposerStore";
import type { VideoGenConfig } from "../../../components/SuggestionPills/videoGenConfig";
import { snapVideoDuration } from "../../../components/SuggestionPills/videoGenConfig";
import { cachedVideoCatalog } from "../../../hooks/useVideoCatalog";
import { findVideoModelRow, videoDurationsOf } from "@/lib/media-library/videoDurations";
import { videoBaseUrl, videoFetch } from "./video.helper";
import { currentChatSessionId, streamOpenError, upstreamErrorMessage } from "./api.helper";
import { throwIfInsufficientPoints } from "./billing.api";
import { throwIfIntentConflict } from "./intentConflict.api";
import { throwIfReshapeRequiresRender } from "./videoReshape.api";
import { throwIfUnsupportedVideoOption } from "./videoOptions.api";
import type { FlowJobTarget } from "@/components/workflow/shared/types";
import type { MediaJobCancelOptions } from "@/lib/ai-agent/mediaJobPolling";
import { skillJobFields, type SkillsInput } from '@/lib/media-skills/selection'

export type VideoJobResult = {
  intent?: string;
  tool_id?: string;
  output_refs?: string[];
  output_urls?: string[];
  text?: string | null;
  // Which opening this sibling rendered, and how strongly it reads. Only a
  // hook-axis job carries it. Per-job by nature, which is why it rides here
  // rather than on the block stream: the sibling watcher already polls this
  // record, so the label needs no new event.
  hook?: VideoJobHook;
};

export type VideoJobHook = {
  id?: string;
  type?: string;
  title?: string;
  brief?: string;
  seconds?: number;
  // "strong" | "moderate" | "weak" when scoring ran, absent when it did not or
  // when it failed — the render is delivered either way.
  strength?: string;
  // 0–10 engagement, never a percentage: there is no platform hook-rate behind
  // this number and a percentage would read as a measurement.
  score?: number;
  reason?: string;
  // The strength of the opening being REPLACED, so the user has a before.
  baseline_strength?: string;
};

export type VideoJobStatusResponse = {
  job_id?: string;
  // The sibling group this job belongs to. A solo job is its own group, so the
  // backend never sends this empty — but older deployments may omit it.
  group_id?: string;
  status?: string;
  // PRD §6.3 vocabulary (queued | generating | done | failed | stopped).
  state?: string;
  // PRD §6.3 progress, 0–100, monotonic. This is the REAL per-job percent the
  // sibling watcher reads — unlike the block stream, it needs no SSE connection.
  progress?: number;
  tenant_id?: string;
  result?: VideoJobResult | null;
  error?: string | null;
  created_at?: number;
};

// Accepted-but-adjusted note from POST /jobs (e.g. the group was started with
// fewer siblings than requested because points ran out mid-fan-out).
export type VideoCreateJobWarning = { code?: string; message?: string };

// What one POST /jobs actually created. A video request for n deliverables
// fans out into that many sibling jobs server-side; `jobId` is the primary
// (first) job and is all the single-output paths ever read.
export type VideoJobGroup = {
  jobId: string;
  jobIds: string[];
  groupId: string;
  warnings: VideoCreateJobWarning[];
  // What each sibling IS, when they differ by more than a seed. Slot-aligned
  // with `jobIds`; slot 0 is the primary. Only the opening (hook) axis fills
  // this today, so an empty array is the normal case — and it is also what an
  // older deployment returns.
  variants: VideoJobVariant[];
};

// One named sibling. Arrives on the CREATE response, before anything has
// rendered, which is the point: the user reads what they are waiting for.
export type VideoJobVariant = {
  jobId: string;
  kind: string;
  title: string;
  brief: string;
  /** The clip these are alternatives FOR, and how long each one runs. */
  sourceRef: string;
  seconds: number;
};

type VideoCreateJobResponse = {
  job_id?: string;
  job_ids?: string[];
  group_id?: string;
  status?: string;
  warnings?: VideoCreateJobWarning[];
  variants?: {
    job_id?: string;
    kind?: string;
    title?: string;
    brief?: string;
    source_ref?: string;
    seconds?: number;
  }[];
};

// The documented video option is `seconds` (clip length). The rest of the UI config is
// forwarded inside `options` too — the Media Service treats `options` as pass-through to
// the tool, so unknown keys are ignored rather than rejected.
export function videoOptions(
  config: VideoGenConfig,
  model?: string,
  // The operation this turn runs as. Only "video_edit" changes anything: on an
  // edit turn the duration pill is asking for a length the EXISTING clip should
  // come back as, which is a different question from how long a new video runs.
  operation?: string,
) {
  const isEdit = operation === "video_edit";
  return {
    // Last line of defence for the clip length: whatever picker produced this
    // config, an off-list value must not leave the browser — the service rejects
    // it with a 400 (Sora renders 4/8/12/16/20, so 10s is not a rounding error
    // but a failed job). Snapped against the WARM catalog only: submitting must
    // never become a network round-trip, and a cold cache means nothing is known
    // about the model, in which case the value passes through untouched.
    seconds: snapVideoDuration(
      config.duration,
      videoDurationsOf(findVideoModelRow(cachedVideoCatalog(), model)),
      config.duration,
    ),
    // Marks `seconds` as the user's own choice rather than a config default.
    // Only sent when true, so a request that never picked one stays
    // byte-identical — and the backend then lets the prompt's own "30 秒" win.
    ...(config.durationExplicit ? { seconds_explicit: true } : {}),
    // The length axis for an EDIT (media-ai `app/intent/retime.py`). `seconds`
    // cannot carry it: the composer sends that on every turn to describe a
    // hypothetical new video, so reading it as "re-cut this clip to 30s" would
    // retime a clip the user only wanted recoloured. Its own key, sent only when
    // a human picked a length, and the backend still requires the prompt to name
    // the direction ("rút gọn", "kéo dài") before it acts on the number.
    //
    // Unsnapped, unlike `seconds` above: this is the DELIVERED length of the
    // finished film, not the length of one provider take. Snapping it onto the
    // model's clip list would read "cut this to 20s" as 12s on anything that
    // renders 4/8/12 — the exact class of bug the length axis exists to fix.
    // The composer has already clamped it to 4-120 (clampVideoTotalDuration).
    ...(isEdit && config.durationExplicit
      ? { retime_target_seconds: config.duration }
      : {}),
    // ...and the same for the count. Only sent when a human picked a tile, so a
    // request that inherited the default 2 stays byte-identical and the
    // service's intent gate can tell an instruction from a default.
    ...(config.videoCountExplicit ? { n_explicit: true } : {}),
    mode: config.mode,
    orientation: config.orientation,
    // Omitted when nobody picked: an absent key is 「AI 決定」 server-side, and
    // sending `true` unconditionally is what made the composer's auto setting a
    // lie (lib/creative/outputAudio.ts).
    ...(config.backgroundMusic !== undefined
      ? { background_music: config.backgroundMusic }
      : {}),
    ...(config.audioVoice !== undefined
      ? { audio_voice: config.audioVoice }
      : {}),
    // A concrete voice id (media-ai `GlobalAudio.voice`) — only sent when a
    // caller resolved one (today: the Workflow node's Male/Female picker).
    ...(config.voice ? { voice: config.voice } : {}),
    resolution: config.resolution,
    // Only sent when the caller pinned it, so existing callers stay byte-identical.
    ...(config.aspectRatio ? { aspect_ratio: config.aspectRatio } : {}),
    // ...and the provenance of that ratio, on the same only-when-true terms as
    // `seconds_explicit`. Without it the service cannot tell a frame the user
    // tapped from this tab's long-standing 9:16 pin — which is why a prompt
    // saying "16:9" used to lose to a value nobody chose.
    ...(config.aspectExplicit ? { aspect_explicit: true } : {}),
    ...(config.avatarId ? { avatar_id: config.avatarId } : {}),
    ...(config.characterIds?.length ? { character_ids: config.characterIds } : {}),
    // Workflow Seedance nodes only; absent everywhere else, so other bodies stay byte-identical.
    ...(config.generateAudio !== undefined ? { generate_audio: config.generateAudio } : {}),
    ...(config.omniReference ? { omni_reference: config.omniReference } : {}),
    // Only present on the retry that answers the edit-scope question, so a
    // first submission (and every generation turn) stays byte-identical.
    ...(config.editScope ? { edit_scope: config.editScope } : {}),
    // The face-swap lane's answers, present only on the retry that carries
    // them (media-ai asks via 409 before anything renders).
    ...(config.faceSwapConsent ? { face_swap_consent: true } : {}),
    ...(config.faceSwapTarget ? { face_swap_target: config.faceSwapTarget } : {}),
    ...(config.faceSwapTargetFace
      ? { face_swap_target_face: config.faceSwapTargetFace }
      : {}),
    // How many ALTERNATIVES for the existing clip. Only on an edit turn, and
    // deliberately NOT as `n`: that field means "how many new videos", so an
    // edit body carrying it would keep the n=1 shape this codebase protects
    // while asking a different question. A number typed in the prompt still
    // wins — the service resolves that axis and says so.
    ...(isEdit && config.videoCount && config.videoCount > 1
      ? {
          hook_count: config.videoCount,
          ...(config.videoCountExplicit ? { hook_count_explicit: true } : {}),
        }
      : {}),
    // The commit step of the opening axis. Every key is needed: without
    // `hook_commit` the service would re-read the original sentence and plan
    // three MORE openings for a request that is finishing one.
    ...(config.hookCommit
      ? {
          hook_commit: true,
          hook_source_ref: config.hookCommit.sourceRef,
          hook_opening_ref: config.hookCommit.openingRef,
          ...(config.hookCommit.seconds
            ? { hook_seconds: config.hookCommit.seconds }
            : {}),
          hook_mode: config.hookCommit.mode ?? "prepend",
        }
      : {}),
  };
}

export type VideoInputFile = {
  transforms?: unknown[];
  url: string;
  /**
   * What these bytes ARE. Our storage URLs carry no extension
   * (`/media/artifact-files/<id>`), so a bare url leaves the service sniffing
   * bytes to tell a clip from a still — and when the sniff misses, an MP4 goes
   * to the provider under an image parameter and the render is refused naming
   * a slot the user never chose.
   */
  mediaKind?: "video" | "image" | "audio";
};

function toVideoInputFiles(
  files: Array<string | VideoInputFile>,
): Array<Record<string, unknown>> {
  return files
    .map((file) =>
      typeof file === "string"
        ? { transforms: [], url: file }
        : {
            transforms: file.transforms ?? [],
            url: file.url,
            // `asset.meta.mediaType` is the hint the service already reads
            // (AssetRefIn.media_type_hint); an untyped entry stays exactly the
            // shape it was, so nothing existing changes on the wire.
            ...(file.mediaKind
              ? {
                  asset: {
                    source: "generated",
                    url: file.url,
                    meta: { mediaType: file.mediaKind },
                  },
                }
              : {}),
          },
    )
    .filter((file) => Boolean(file.url));
}

// POST /jobs — create an async video job. Returns the full sibling group: a
// request with `runs` > 1 fans out server-side into that many jobs sharing a
// group_id, and the caller must track every id or the extra outputs are
// rendered (and billed) invisibly. Single-output callers use createVideoJob.
export async function createVideoJobGroup(
  prompt: string | string[],
  config: VideoGenConfig,
  inputFiles: Array<string | VideoInputFile> = [],
  signal?: AbortSignal,
  // User-selected video model id (GET /models/videos). Omit to let the service
  // auto-route ("Auto").
  model?: string,
  // What the video should avoid — folded into the `prompt` text (as an "Avoid:"
  // clause) rather than sent as a separate payload field. Omit/empty to skip.
  negativePrompt?: string,
  // The workflow project this job belongs to (workflow Video node). Only sent
  // from the workflow editor; the chat flow leaves it undefined.
  workflowId?: string,
  // Marks a generation kicked off by the workflow prompt-enhance flow. Only sent
  // when true; a normal generation leaves it off entirely.
  isPromptEnhance?: boolean,
  // Whether the prompt was split into multiple shots (SHOT1/SHOT2/...). Only sent
  // when true; a single-shot generation leaves it off entirely.
  isMultiShot?: boolean,
  // Explicit operation override. For a whole-video edit pass "video_edit" with
  // the prior video in `inputFiles` (i2v) — bypasses the intent router. Omit for
  // a normal generation (the service auto-routes intent).
  operation?: string,
  // Parallel output count (Agent tab "2 video" → n=2). Forwarded to POST /jobs `n`.
  runs?: number,
  // User-selected content language ("en" | "vi" | "zh") for generated speech/TTS.
  language?: string,
  // Role-typed materials + the generation method (PRD multimodal attachment).
  // When present it REPLACES `inputFiles` on the wire: the typed entries carry
  // the same urls plus the role each one plays, which `inputFiles` cannot say.
  // Absent → the body is byte-identical to before.
  creative?: CreativeGenerationPayload,
  // Enabled media skills (PRD IV): pins and, in auto mode, the candidate
  // pool for per-prompt relevance selection. Absent/empty → not sent.
  skills?: SkillsInput,
  // Active UI locale for user-visible progress strings. This is deliberately
  // independent from `language`, which belongs to the generated media.
  locale?: string,
  // The workflow page/node/seq that placed the job — seeds the page's job
  // ledger at the gateway. TOP-LEVEL fields on purpose (see FlowJobTarget).
  // Only sent from the workflow editor; the chat flow leaves it undefined.
  flow?: FlowJobTarget,
  // The user has answered the intent gate's question, so do not ask again
  // (media-ai `app/intent/gate.py`). The answer is IN this request — the chosen
  // count in `runs`, a chosen script direction in `prompt` — which is what keeps
  // the retry replayable under the same job dedupe key.
  intentConfirmed?: boolean,
  // Where this turn's prompt came from, when it was not typed. "script_direction"
  // means the prompt is a brief the user picked off a card of proposals, which
  // the service reads as "one film" — the parallel-outputs count is for skimming
  // variants of one idea, a different request from "make the one I chose".
  intentSource?: string,
  conversation?: MediaConversationTurn,
  // End-frame image URL (workflow Video node's End Frame port). Only sent when
  // the selected model's catalog entry advertises `last_frame` support
  // (`supported_frame_images`) — media-ai drops it silently otherwise.
  lastFrameUrl?: string,
) {
  // The conversation this job was asked for. Resolved here rather than taken as
  // an argument, exactly like the image path in apis.ts: every caller of this
  // function already stands in the chat that is asking, and threading a 16th
  // positional parameter through four drivers is how the field would go missing
  // again.
  //
  // A job belongs to ONE surface: inside the workflow editor the job is the
  // workflow's, so the conversation is deliberately not sent there.
  //
  // Without this the video path sent workflow_id and nothing else, so a video
  // generated in a chat reached the Material Center with no origin at all — the
  // card's badge read "Không có nguồn" the moment it appeared, while an IMAGE
  // from the same conversation carried its source correctly.
  const conversationId = workflowId ? "" : (conversation?.conversationId ?? currentChatSessionId());
  const response = await videoFetch(`${videoBaseUrl()}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // `type` is required by the media-ai-service and is the source of truth for
      // image-vs-video dispatch. This is the video generation path, so it is "video".
      type: "video",
      prompt: negativePrompt
        ? `${prompt}\n\nAvoid: ${negativePrompt}`
        : prompt,
      // An EMPTY typed list loses to the untyped refs, the same rule the image
      // lane already follows (apis.ts). A snapshot that came back empty is a
      // snapshot that failed, and letting it win sends a video job with nothing
      // attached while the bubble still shows the clip — which is exactly how
      // "I attached a video and it was never read" looked.
      input_files: creative?.input_files?.length
        ? creative.input_files
        : toVideoInputFiles(inputFiles),
      // The composer's Style pill. Kept as an explicit `null` when unpicked so
      // the body keeps the byte-shape it has always had; /jobs treats null and
      // absent alike, and 422s only on an unknown string.
      style: useCreativeComposerStore.getState().styleId,
      operation: operation ?? null,
      options: videoOptions(config, model, operation ?? undefined),
      ...(creative ? { generation_method: creative.generation_method } : {}),
      // Whether that method was PICKED (dropdown touched or a chip armed it) —
      // the backend's lane classifier may override a client default but never
      // a choice. Absent = legacy (present method reads as chosen).
      ...(creative
        ? { generation_method_explicit: creative.method_explicit === true }
        : {}),
      ...(creative?.reference_urls?.length
        ? { reference_urls: creative.reference_urls }
        : {}),
      ...(creative?.page_image_urls?.length
        ? { page_image_urls: creative.page_image_urls }
        : {}),
      ...(lastFrameUrl ? { last_frame_url: lastFrameUrl } : {}),
      ...(model ? { model } : {}),
      ...(workflowId ? { workflow_id: workflowId } : {}),
      // workflow_id's counterpart: what lets the library's "Hội thoại" badge open
      // the conversation this video came out of (§3.2).
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(!workflowId ? mediaConversationFields(conversation) : {}),
      ...(isPromptEnhance ? { is_prompt_enhance: true } : {}),
      ...(isMultiShot ? { is_multi_shot: true } : {}),
      ...(typeof runs === "number" && runs > 0 ? { n: runs } : {}),
      ...(intentConfirmed ? { intent_confirmed: true } : {}),
      ...(intentSource ? { intent_source: intentSource } : {}),
      // The clone-scope answer (or a trend-modal "Clone exactly" pick) — the
      // top-level field the service's confirm gate reads, like edit_scope is
      // for its own question but without the options detour.
      ...(config.cloneFidelity ? { clone_fidelity: config.cloneFidelity } : {}),
      // The page-gate answers, same reasoning: read at the request boundary,
      // so they travel top-level rather than inside `options`.
      ...(config.brandHint ? { brand_hint: config.brandHint } : {}),
      ...(config.pageGrounding ? { page_grounding: config.pageGrounding } : {}),
      // Which half of a two-step prompt to render. Top-level for the same
      // reason as the two above: the gate that reads it runs at the request
      // boundary, before `options` is looked at.
      ...(config.stepScope ? { step_scope: config.stepScope } : {}),
      ...(language ? { language } : {}),
      // Whether that language was PICKED, next to the field it describes (the
      // service reads `body.language_explicit`). Without it the service cannot
      // tell a pick from the interface-locale fallback the composer always
      // sends, so a language asked for in the prompt (「用英文旁白」) could never
      // outrank it. Absent = unknown, which the service treats as a pick, i.e.
      // exactly today's behaviour for every client that does not send it.
      ...(config.languageExplicit && language ? { language_explicit: true } : {}),
      ...skillJobFields(skills),
      ...(locale ? { locale } : {}),
      // Workflow ledger seed — top-level so the gateway reads it and media-ai
      // ignores it, exactly like workflow_id above.
      ...(flow ?? {}),
    }),
    signal,
  });

  // Billing gate: surface 402 insufficient_points as a typed, i18n'd error.
  await throwIfInsufficientPoints(response);
  // Per-model option gate: a 400 naming an unsupported clip length becomes a
  // sentence telling the user which lengths this model renders, never raw JSON.
  await throwIfUnsupportedVideoOption(response);
  // Intent gate: a 409 means the service wants ONE confirmation before it
  // spends anything, because the composer's settings and the typed request
  // disagree. Not an error — the driver parks and asks (see sseDriver).
  await throwIfIntentConflict(response);
  // Shape gate: a 422 means the ratio asked for needs a new RENDER, not an edit
  // of the existing clip. Nothing is queued and nothing is charged — the driver
  // re-submits the turn as a generation (see sseDriver).
  await throwIfReshapeRequiresRender(response);
  if (response.status !== 202) {
    // Sanitized: the raw body may be a CDN error page or a nested provider 400,
    // and whatever this throws becomes the turn's failure text. The typed gates
    // above already ran, so their friendlier messages are unaffected.
    throw new Error(await upstreamErrorMessage(response));
  }

  const payload = (await response.json()) as VideoCreateJobResponse;
  const jobId = payload.job_id;
  if (!jobId) {
    throw new Error("Video job response is missing job_id.");
  }

  return {
    jobId,
    // Older deployments predate the fan-out fields; a solo job is its own group.
    jobIds: payload.job_ids?.length ? payload.job_ids : [jobId],
    groupId: payload.group_id || jobId,
    warnings: payload.warnings ?? [],
    // Normalised here so no consumer has to cope with a half-filled label: a
    // variant with no title is a caption that renders as an empty line, which is
    // worse than the numbered fallback the block supplies.
    variants: (payload.variants ?? [])
      .map((v) => ({
        jobId: v.job_id ?? "",
        kind: v.kind ?? "",
        title: v.title ?? "",
        brief: v.brief ?? "",
        sourceRef: v.source_ref ?? "",
        seconds: v.seconds ?? 0,
      }))
      .filter((v) => v.title || v.kind),
  } satisfies VideoJobGroup;
}

// POST /jobs — single-output convenience over createVideoJobGroup. Returns just
// the primary job_id; every pre-fan-out caller (workflow, canvas edit, legacy
// driver) keeps this exact contract.
export async function createVideoJob(
  ...args: Parameters<typeof createVideoJobGroup>
): Promise<string> {
  return (await createVideoJobGroup(...args)).jobId;
}

// GET /jobs/{id}/stream — realtime SSE feed of job events (replays past events to late
// subscribers). Terminal events are `done` (success) and `error` (failure).
export async function openVideoJobStream(jobId: string, signal?: AbortSignal) {
  const response = await videoFetch(
    `${videoBaseUrl()}/jobs/${jobId}/stream`,
    { signal },
    "text/event-stream",
  );

  if (!response.ok || !response.body) {
    throw await streamOpenError(response);
  }

  return response;
}

// GET /jobs/{id}/stream/blocks — SSE feed already shaped as the message → phase →
// block lifecycle (the backend's BlockStreamAdapter does the folding the FE used
// to do client-side). Consumed by createSseDriver. Terminal event: `message_done`.
export async function openVideoJobBlockStream(
  jobId: string,
  signal?: AbortSignal,
) {
  const response = await videoFetch(
    `${videoBaseUrl()}/jobs/${jobId}/stream/blocks`,
    { signal },
    "text/event-stream",
  );

  if (!response.ok || !response.body) {
    throw await streamOpenError(response);
  }

  return response;
}

// GET /jobs/{id} — point-in-time job status (polling fallback / completion check).
export async function fetchVideoJobStatus(jobId: string, signal?: AbortSignal) {
  const response = await videoFetch(`${videoBaseUrl()}/jobs/${jobId}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response));
  }

  return response.json() as Promise<VideoJobStatusResponse>;
}

// GET /jobs?limit= — the newest jobs, newest first. Used to find a job whose
// create answer never reached us (see useCreativeRegenStore's adoption step).
export async function fetchRecentVideoJobs(limit: number, signal?: AbortSignal) {
  const response = await videoFetch(`${videoBaseUrl()}/jobs?limit=${limit}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response));
  }

  const payload = (await response.json()) as {
    jobs?: VideoJobStatusResponse[];
  };
  return payload.jobs ?? [];
}

// GET /jobs?group_id= — every live member of a sibling group, newest first.
// Used by the cross-tab resume path, where only the primary job id survived:
// the primary's status carries the group_id, and this lists the rest.
export async function fetchJobsByGroup(groupId: string, signal?: AbortSignal) {
  const response = await videoFetch(
    `${videoBaseUrl()}/jobs?group_id=${encodeURIComponent(groupId)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response));
  }

  const payload = (await response.json()) as {
    jobs?: VideoJobStatusResponse[];
  };
  return payload.jobs ?? [];
}

// POST /jobs/groups/{id}/cancel — cooperatively cancel every live member.
// Idempotent; a solo job's group_id equals its job_id, so this also serves as
// the single-job cancel. Artifacts produced before the cancel are kept and the
// backend settles the billing hold pro-rata — unless `discardOutputs` asks it
// to drop them (still billed; the workflow's Stop), which the response echoes
// as `discard_outputs` only when it was honoured.
export async function cancelJobGroup(
  groupId: string,
  { signal, discardOutputs, keepalive }: MediaJobCancelOptions = {},
) {
  const query = discardOutputs ? "?discard_outputs=true" : "";
  const response = await videoFetch(
    `${videoBaseUrl()}/jobs/groups/${encodeURIComponent(groupId)}/cancel${query}`,
    { method: "POST", signal, keepalive },
  );

  if (!response.ok) {
    throw new Error(await upstreamErrorMessage(response));
  }

  return response.json() as Promise<{
    group_id?: string;
    cancelled?: string[];
    already_terminal?: string[];
    discarded?: string[];
    discard_outputs?: boolean;
  }>;
}
