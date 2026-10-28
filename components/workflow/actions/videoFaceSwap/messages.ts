export const VIDEO_FACE_SWAP_MESSAGES = {
  noVideo: "Video Face Swap received no target video.",
  noFace: "Video Face Swap received no face image.",
  noConsent:
    "Video face swap requires consent from the person in the video. Tick the consent box on the node.",
  jobFailed: "Video face swap job failed.",
  timeout:
    "Video face swap is still running after 15 minutes. It may still finish — check your media library shortly.",
  noVideoUrl: "Video face swap finished without a video url.",
} as const;

/** The service's gate codes as sentences; unlisted ones go to the generic job-error reader. */
export const VIDEO_FACE_SWAP_CODE_MESSAGES: Record<string, string> = {
  face_swap_too_long:
    "The source video is longer than 60 seconds — trim it and try again.",
  face_swap_no_face: "No face was found in the sampled video frames.",
  face_swap_unavailable:
    "Video face swap is unavailable right now. Try again later.",
};

/** 409 clarification conflicts: both answers ride up-front, so one means contract drift. */
export const VIDEO_FACE_SWAP_CONFLICT_MESSAGES: Record<string, string> = {
  face_swap_consent: VIDEO_FACE_SWAP_MESSAGES.noConsent,
  face_swap_target:
    "The video has several faces — choose whether to swap the most prominent face or all of them on the node.",
};
