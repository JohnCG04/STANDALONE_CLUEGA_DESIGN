import type { DubVideoRequest } from "@dogclaw-ad/workflow";

export function dubRequestBody(videoUrl: string, req: DubVideoRequest, workflowId = "", flowTarget?: Record<string, unknown>) {
  return {
    source_video_ref: videoUrl,
    ...(workflowId ? { workflow_id: workflowId } : {}),
    ...(req.nodeId ? { node_id: req.nodeId } : {}),
    ...(flowTarget ?? {}),
    ...(req.sourceScript ? { source_script: req.sourceScript } : {}),
    targets: [{ lang: req.targetLanguage, ...(req.voice ? { voice: req.voice } : {}) }],
    ...(req.pipelineVersion === 2 ? {
      pipeline_version: 2,
      voice_mode: req.voiceMode,
      // Absent means no: lip-sync engines bill per output second.
      lip_sync: req.lipSync ?? false,
      preserve_background_audio: req.preserveBackgroundAudio ?? true,
      source_language: req.sourceLanguage ?? "auto",
      voice_owner: req.voiceOwner ?? "self",
      consent_record_id: req.consentRecordId ?? "",
      self_attested: req.selfAttested ?? false,
    } : {}),
    ...(req.keepOriginalMusic ? { keep_original_music: true } : {}),
    ...(req.captions ? { captions: true, captions_burn_in: !!req.captionsBurnIn } : {}),
  };
}

export function dubResultAsset(
  result: Record<string, any>,
  urls: string[],
  pipelineVersion?: number,
) {
  if (!urls.length) throw new Error("dub result has no video URL");
  const fileId = Array.isArray(result.output_file_ids) ? result.output_file_ids[0] : undefined;
  if (pipelineVersion === 2 && !fileId) throw new Error("Dub v2 result has no canonical file ID");
  return {
    id: fileId ?? (globalThis.crypto?.randomUUID?.() ?? `dub-${Date.now()}`),
    url: urls[0],
    kind: "video" as const,
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}
