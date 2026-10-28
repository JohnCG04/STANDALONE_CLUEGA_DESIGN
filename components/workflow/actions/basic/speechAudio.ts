import type {
  GenResult,
  TranscribeAudioRequest,
  TranscribeAudioResult,
  TranslateVoiceRequest,
} from "@dogclaw-ad/workflow";
import {
  JobPollTimeoutError,
  pollJobImageResult,
} from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { FEATURES, STOP_CANCEL } from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { resolveAudioUrl, submitAudioJob } from "./generateAudio";
import { watchJob } from "../../shared/jobStop";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { speechInput } from "./helpers";

/** Voice Translate: the track re-spoken in the picked preset, or the speaker's own voice when none
 *  is picked (`voiceModel`'s default preset where cloning is unavailable). */
export async function translateVoice(
  req: TranslateVoiceRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  req.signal?.throwIfAborted();
  const feature = FEATURES.voiceTranslate;
  const audioRef = speechInput(req.audio, feature);
  const job = await submitAudioJob({
    options: {
      kind: "translate",
      audio_ref: audioRef,
      target_language: req.targetLanguage,
      ...(req.voice ? { voice: req.voice } : {}),
      ...(req.voiceModel ? { voice_model: req.voiceModel } : {}),
    },
    ...(workflowId ? { workflow_id: workflowId } : {}),
    ...(track?.target ?? {}),
  });
  track?.onCreated?.([job.jobId], job.groupId);

  const url = await watchJob(
    req.signal,
    () => cancelJobGroup(job.groupId, STOP_CANCEL),
    (signal) => resolveAudioUrl(job.jobId, signal, feature),
  );
  return {
    asset: {
      id: globalThis.crypto?.randomUUID?.() ?? `voice-translate-${job.jobId}`,
      url,
      kind: "video",
      // media-ai speaks every take to mp3.
      mimeType: "audio/mpeg",
    },
  };
}

/** The finished job's words; a timeout says the job is still running, not that it failed. */
async function resolveTranscript(jobId: string, signal?: AbortSignal): Promise<string> {
  const feature = FEATURES.speechToText;
  try {
    const { result } = await pollJobImageResult(jobId, signal);
    const text = (result as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(MEDIA_JOB_MESSAGES.noTranscript(feature));
    }
    return text.trim();
  } catch (err) {
    if (err instanceof JobPollTimeoutError) {
      throw new Error(MEDIA_JOB_MESSAGES.stillRunning(feature, err.budgetMs));
    }
    throw err;
  }
}

/** Speech to Text. Off the job ledger (no flow target), like `enhancePrompt`: a transcript is
 *  text, and the ledger can only replay media results onto a node. */
export async function transcribeAudio(
  req: TranscribeAudioRequest,
  workflowId?: string,
): Promise<TranscribeAudioResult> {
  req.signal?.throwIfAborted();
  const audioRef = speechInput(req.audio, FEATURES.speechToText);
  const job = await submitAudioJob({
    options: { kind: "transcribe", audio_ref: audioRef },
    ...(workflowId ? { workflow_id: workflowId } : {}),
    // Node, no page: the cost book books an editor run; the job ledger needs both, so stays out.
    ...(req.nodeId ? { node_id: req.nodeId } : {}),
  });
  const text = await watchJob(
    req.signal,
    () => cancelJobGroup(job.groupId, STOP_CANCEL),
    (signal) => resolveTranscript(job.jobId, signal),
  );
  return { text };
}
