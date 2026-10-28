export const DUB_MESSAGES = {
  noVideo: "Video Dub & Translate received no source video.",
  noLanguage: "Video Dub & Translate received no target language.",
  jobFailed: "Video dub job failed.",
  timeout:
    "Video dub is still running after 10 minutes. It may still finish — check your media library shortly.",
  noVideoUrl: "Video dub job finished without a video url.",
  missingJobId: "Video dub response is missing a job id for the target language.",
} as const;

/** media-ai's `/avatars/dub` gate codes as sentences; unlisted ones go to the generic reader. */
export const DUB_CODE_MESSAGES: Record<string, string> = {
  script_unavailable:
    "The spoken script could not be read from this clip. Type the script into the node, or try a shorter clip.",
  translation_failed:
    "Translation failed for this language. Try again, or a different target language.",
  capability_unavailable:
    "That voice mode is not available for this language here. Pick a preset voice.",
  // Worker `error_code`s from GET /jobs/{id}: earlier steps are paid, so each names a control.
  voice_clone_unsupported:
    "Keeping the speaker's voice needs a cloning model this deployment does not have. Switch Voice mode to a preset voice.",
  voice_clone_failed:
    "The speaker's voice could not be cloned from this clip. Try a clip with clearer speech, or a preset voice.",
  preset_voice_required: "Pick a preset voice before dubbing.",
  multiple_speakers_unsupported:
    "This clip has more than one speaker. One voice reading every line would put one person's words in another's mouth, so the dub was refused.",
  speaker_count_unverified:
    "The number of speakers in this clip could not be established, so the dub was refused rather than guessed.",
  duration_exceeded: "This clip is longer than dubbing allows here. Trim it and try again.",
  transcript_unreadable:
    "The speech in this clip could not be read. Try a clip with clearer audio.",
  timing_unfit:
    "The translation needs more time than the clip's own pauses allow. Try a shorter line or another language.",
  lipsync_unsupported:
    "Lip-sync is not available here; the dub keeps the original picture with the new voice.",
  router_not_configured: "Dubbing is not configured on this deployment.",
  dub_attempts_exhausted: "Dubbing kept failing and was given up on. Try again later.",
};
