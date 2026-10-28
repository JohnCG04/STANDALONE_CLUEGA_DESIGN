/** `feature` is the node's display name, so a shared sentence still names the node. */
export const MEDIA_JOB_MESSAGES = {
  notConfigured: "Media AI API is not configured.",
  missingJobId: "Media job response is missing job_id.",
  rejected: (feature: string, status: number) =>
    `${feature} job was rejected (HTTP ${status}).`,
  // Worded to hit `runError.ts`'s `noOutput` signature: the job came back empty, it did not fail.
  noImageUrl: (feature: string) =>
    `${feature} job finished without producing an image.`,
  /** Same, for a job that said why. The reason is the only actionable half. */
  noImageUrlBecause: (feature: string, reason: string) =>
    `${feature} job finished without producing an image: ${reason}`,
  /** The node stopped waiting — the JOB did not stop, so don't call it a failure. */
  stillRunning: (feature: string, budgetMs: number) =>
    `${feature} is still running after ${Math.round(budgetMs / 60_000)} minutes. It may still finish — check your media library shortly.`,
  noVideoUrl: (feature: string) =>
    `${feature} job finished without a video url.`,
  /** Same `noOutput` wording as `noImageUrl`: the job came back empty, it did not fail. */
  noAudio: (feature: string) =>
    `${feature} job finished without producing audio.`,
  /** Speech to Text came back with no words: the track held no speech it could hear. */
  noTranscript: (feature: string) =>
    `${feature} job finished without a transcript: no speech was heard.`,
  /** The node was run with nothing wired into its Audio input. */
  noSpeechInput: (feature: string) => `${feature} needs a voice track.`,
  unreachableInput: (feature: string, url: string) =>
    `${feature} needs publicly reachable images — the model fetches them server-side. This url is not: ${url}. Set NEXT_PUBLIC_ARTIFACT_PUBLIC_BASE_URL to a public artifact origin (e.g. https://cdp-stg-core-api.cluega.com/media/artifact-files) and restart the dev server.`,
} as const;

export const ARTIFACT_MESSAGES = {
  uploadUnavailable: "Media upload is unavailable (no base url).",
  noFileId: "Upload succeeded but the response carried no file id.",
  downloadFailed: (status: number) => `Download failed: ${status}`,
  templateCoverRequired:
    "Pick a cover image or video before saving the template.",
} as const;

export const PROMPT_ENHANCE_MESSAGES = {
  unbakedEdits:
    "This image still has unbaked edits (crop/filter/levels/blur). Export it to a new image first, then connect that image to Copilot.",
  noSourceUrl: "Prompt enhancement received an image with no source url.",
  noImageText: "Image prompt enhancement returned no text.",
  noText: "Prompt enhancement returned no text.",
  jobFailed: "Prompt enhancement job failed.",
  missingJobId: "Prompt enhancement job response is missing job_id.",
  describeImage: "Describe this image as a detailed, production-ready prompt.",
} as const;
