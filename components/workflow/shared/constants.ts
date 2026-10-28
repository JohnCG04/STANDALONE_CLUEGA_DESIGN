/** The model every node without its own picker routes through. */
export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

export const MEDIA_JOB_TYPE_IMAGE = "image";
export const MEDIA_JOB_TYPE_VIDEO = "video";
/** One prompt → one voice / music / sound-effect track (media-ai `type: "audio"`). */
export const MEDIA_JOB_TYPE_AUDIO = "audio";
export const JOB_ACCEPTED_STATUS = 202;
/** The editor's cap on a node's `config.history`; merges and ledger applies keep no more. */
export const HISTORY_CAP = 60;
/** media-ai's video-edit lane; the edit axis picks captions, face swap, … */
export const VIDEO_EDIT_OPERATION = "video_edit";

export const REMOVE_BACKGROUND_OPERATION = "remove_background";
export const REMOVE_BACKGROUND_OPTIONS = {
  model: "isnet-general-use",
  alpha_matting: true,
} as const;

/** The server's name for the layer split; its options take none. */
export const DESIGN_LAYERS_OPERATION = "design_layers";

/** Every workflow Stop: still billed, outputs discarded, and the request outlives a closed tab. */
export const STOP_CANCEL = { discardOutputs: true, keepalive: true } as const;

/** Node labels used in messages. */
export const FEATURES = {
  image: "Image generation",
  removeBackground: "Remove Background",
  magicLayer: "Magic Layer",
  cameraAngles: "Camera angle",
  relight: "Relight",
  generativeFill: "Generative Fill",
  video: "Video generation",
  audio: "Audio generation",
  voiceTranslate: "Voice Translate",
  speechToText: "Speech to Text",
} as const;

/** Tells the backend a file the user uploaded (vs. a generated result). */
export const UPLOAD_TYPE_USER = "user_upload";
/** An intermediate (mask, padded canvas): stored, but never filed into the Assets library. */
export const UPLOAD_TYPE_SUPPORT = "support_ai_file";

/** Package intermediates, known by file name only: `onUploadFile` carries no purpose. */
export const PACKAGE_SUPPORT_FILE_NAMES: ReadonlySet<string> = new Set([
  "generative-fill-mask.png",
]);

/** Canvas video/audio caps, decimal as the copy prints them ("500 MB"); images keep the app's. */
export const CANVAS_VIDEO_MAX_BYTES = 500_000_000;
export const CANVAS_AUDIO_MAX_BYTES = 50_000_000;
export const CANVAS_MEDIA_MAX_SECONDS = 10 * 60;

/** Video and audio types the upload service stores (its UPLOAD_ALLOWED_MIME). */
export const CANVAS_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
]);

/** Other names browsers give those formats; the file is sent under the canonical one. */
export const MEDIA_TYPE_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
};

/** A type from the extension, for a browser that reports none (some leave .mp3 / .mov untyped). */
export const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** The package's mark for an Error whose message is display copy: its node shows it verbatim. */
export const WORKFLOW_RUN_ERROR_MARK = Symbol.for("cwf.runError");

/** A hosted file id is a ULID; a generated image's client id would be a guaranteed 404. */
export const HOSTED_FILE_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/** Hosted urls carry no extension (the type is only in the header). */
export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Same-origin proxy (app/api/artifacts/media/image/route.ts): R2 sends no CORS for canvas reads.
 *  The editor speaks proxied urls; the host un-proxies any url that leaves it (job input, DB). */
export const MEDIA_PROXY_PATH = "/api/artifacts/media/image";

// Only these, so freeform config (webhook urls, settings) is never rewritten.
export const IMAGE_URL_KEYS = ["url", "output", "result", "results", "asset", "assets"] as const;

/** The asset row is filed a beat after the artifact, so re-read a few widening times, then stop. */
export const ATTEMPT_DELAYS_MS = [0, 2_000, 5_000];
