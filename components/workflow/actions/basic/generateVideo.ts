import type { GenResult, GenVideoRequest, ImageInput } from "@dogclaw-ad/workflow";
import {
  cancelJobGroup,
  createVideoJobGroup,
} from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { pollJobVideoResult } from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobVideoUrl";
import {
  type OmniReferenceWire,
  type VideoOrientation,
} from "@/resources/app/pages/app/components/SuggestionPills/videoGenConfig";
import { snapDurationForVideoModel } from "@/resources/app/pages/app/hooks/useVideoCatalog";
import { FEATURES, STOP_CANCEL } from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { watchJob } from "../../shared/jobStop";
import { unproxyImageInput } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { VOICE_BY_GENDER } from "./constants";

const OMNI_TASKS: ReadonlySet<unknown> = new Set(["reference", "edit", "extend"]);

/** The node's Seedance refs as `options.omni_reference`, or undefined for a frames/text run. */
export function omniReferenceOf(req: GenVideoRequest): OmniReferenceWire | undefined {
  if (!OMNI_TASKS.has(req.task)) return undefined;
  const list = (inputs: unknown): ImageInput[] =>
    (Array.isArray(inputs) ? inputs : []).map(unproxyImageInput);
  const images = list(req.references?.images);
  const videos = list(req.references?.videos);
  const audios = list(req.references?.audios);
  // A prompt alone is text-to-video: Ark refuses a reference task with nothing in it.
  if (req.task === "reference" && !images.length && !videos.length && !audios.length) return undefined;
  // Ark fetches each by URL itself, so a canvas-only blob: never leaves the browser.
  assertPubliclyFetchable([...images, ...videos, ...audios].map((i) => i.url), FEATURES.video);
  return {
    task: req.task,
    ...(req.extendMode ? { extend_mode: req.extendMode } : {}),
    images: images.map(({ url, transforms }) => ({ url, ...(transforms?.length ? { transforms } : {}) })),
    videos: videos.map(({ url }) => ({ url })),
    audios: audios.map(({ url }) => ({ url })),
  };
}

/** Multi-shot: `req.prompt` may be a `string[]`, but POST /jobs takes a string, so the shots are
 *  serialized per the GenVideoRequest contract. */
export async function generateVideo(
  req: GenVideoRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  // Snap to a length the picked model advertises: a flat clamp demotes 16s/20s requests.
  const duration = await snapDurationForVideoModel(
    req.model,
    req?.params?.duration,
  );
  const wantMusic = req?.params?.backgroundMusic === true;
  const wantVoiceover = req?.params?.voiceover === true;
  const voiceGender = req?.params?.voiceGender as "male" | "female" | undefined;
  const isPromptEnhance = req?.params?.isPromptEnhance === true;
  const isMultiShot = Array.isArray(req.prompt) && req.prompt.length > 1;
  // `params.runs` → the job's `n`; anything but a positive number is a single clip.
  const runsParam = Number(req?.params?.runs);
  const runs =
    Number.isFinite(runsParam) && runsParam > 0 ? runsParam : undefined;
  // Ids of the Character nodes wired in; media-ai answers 422 if the model can't cast them.
  const characterIds = Array.isArray(req?.params?.characterIds)
    ? (req.params.characterIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const omniReference = omniReferenceOf(req);
  const aspectRatio = typeof req?.params?.aspectRatio === "string" ? req.params.aspectRatio : undefined;
  const generateAudio = req?.params?.generateAudio;

  req.signal?.throwIfAborted();
  const group = await createVideoJobGroup(
    req.prompt,
    {
      mode: "fast",
      orientation:
        (req?.params?.orientation as VideoOrientation | undefined) ||
        "landscape",
      duration,
      backgroundMusic: wantMusic,
      audioVoice: wantVoiceover,
      ...(wantVoiceover && voiceGender
        ? { voice: VOICE_BY_GENDER[voiceGender] }
        : {}),
      resolution: req?.params?.resolution as string | undefined,
      ...(characterIds.length ? { characterIds } : {}),
      ...(aspectRatio ? { aspectRatio, aspectExplicit: true } : {}),
      ...(typeof generateAudio === "boolean" ? { generateAudio } : {}),
      ...(omniReference ? { omniReference } : {}),
    },
    // Frames and Seedance references never ride together (Ark refuses the mix).
    !omniReference && req.imageUrl ? [unproxyImageInput(req.imageUrl)] : [],
    undefined,
    req.model,
    req.negativePrompt,
    workflowId,
    isPromptEnhance,
    isMultiShot,
    undefined,
    runs,
    undefined,
    undefined,
    undefined,
    undefined,
    track?.target,
    undefined,
    undefined,
    undefined,
    !omniReference && req.lastFrameUrl ? unproxyImageInput(req.lastFrameUrl).url : undefined,
  );
  // Every sibling id: a ledger missing one silently loses that `n>1` deliverable.
  track?.onCreated?.(group.jobIds, group.groupId);

  // Settled, not all-or-nothing: one failed sibling never drops clips that rendered (and billed).
  const settled = await watchJob(
    req.signal,
    () => cancelJobGroup(group.groupId, STOP_CANCEL),
    (signal) =>
      Promise.allSettled(
        group.jobIds.map((jobId) => pollJobVideoResult(jobId, signal)),
      ),
  );
  const urls = settled.flatMap((r) =>
    r.status === "fulfilled" && r.value.url ? [r.value.url] : [],
  );
  // One notice line per card: every sibling ran the same ask, so the first stands for all.
  const notice = settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value.notices : [],
  )[0];
  if (urls.length === 0) {
    const failed = settled.find((r) => r.status === "rejected");
    throw failed
      ? failed.reason
      : new Error(MEDIA_JOB_MESSAGES.noVideoUrl(FEATURES.video));
  }

  const assets = urls.map((url, i) => ({
    id: globalThis.crypto?.randomUUID?.() ?? `gen-video-${Date.now()}-${i}`,
    url,
    kind: "video" as const,
  }));
  return { asset: assets[0], assets, ...(notice ? { notice } : {}) };
}
