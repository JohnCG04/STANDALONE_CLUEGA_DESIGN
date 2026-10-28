/**
 * Local checks for a media file before it is uploaded.
 *
 * Ordering is the whole design: size and type are checked FIRST, synchronously,
 * because a 200 MB file must fail instantly and reading its metadata means
 * handing it to the DOM. Duration comes second and needs a browser, so it lives
 * in its own function and the size/type rules stay unit-testable without one.
 *
 * CDP and media-ai stay the authority; this is a fast path that turns "minutes of
 * upload, then a 413" into an immediate, explainable refusal.
 */

import {
  ALLOWED_UPLOAD_MIME,
  preflightUpload,
  type UploadRejection,
} from "@/lib/uploads/limits";

/** Narration a single take can hold — mirrors AVATAR_SECONDS_MAX server-side. */
export const NARRATION_MAX_SECONDS = 20;

/** An enrollment clip has to show the presenter long enough to be usable. */
export const ENROLL_VIDEO_MIN_SECONDS = 10;
export const ENROLL_VIDEO_MAX_SECONDS = 120;

const AUDIO_MIME = ALLOWED_UPLOAD_MIME.filter((type) => type.startsWith("audio/"));
const VIDEO_MIME = ALLOWED_UPLOAD_MIME.filter((type) => type.startsWith("video/"));

export const AUDIO_ACCEPT_ATTR = [...AUDIO_MIME, ".mp3", ".m4a", ".wav"].join(",");
export const VIDEO_ACCEPT_ATTR = [...VIDEO_MIME, ".mp4", ".mov", ".webm"].join(",");

function narrowKind(
  file: File,
  allowed: readonly string[],
  messageKey: string,
): UploadRejection | null {
  // Size and type against the shared rules first, so one limit change is one edit.
  const shared = preflightUpload(file);
  if (shared) return shared;
  const type = file.type.trim().toLowerCase();
  // An empty type is allowed through for the same reason preflightUpload allows
  // it: browsers report nothing for some containers, and the service decides.
  if (type && !allowed.includes(type)) {
    return {
      code: "unsupported_type",
      messageKey,
      params: { type },
      detail: `file ${file.name} has unsupported type ${type}`,
    };
  }
  return null;
}

/** Size + type for a narration track. Duration is a separate, async question. */
export function preflightAudioFile(file: File): UploadRejection | null {
  return narrowKind(file, AUDIO_MIME, "appChat.avatarStudio.voiceover.audioUnsupported");
}

/** Size + type for a video (dub source, enrollment clip). */
export function preflightVideoFile(file: File): UploadRejection | null {
  return narrowKind(file, VIDEO_MIME, "appChat.avatarStudio.enroll.unsupportedFormat");
}

/**
 * The file's duration in seconds, or null when the browser cannot read it.
 *
 * Null is not a failure: a container the browser will not decode may still be
 * one the service accepts, and refusing it locally would block a valid upload.
 * The object URL is revoked in every path, including the error one.
 */
export function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
      resolve(null);
      return;
    }
    const element = document.createElement(
      file.type.startsWith("audio/") ? "audio" : "video",
    );
    const url = URL.createObjectURL(file);
    const settle = (value: number | null) => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
      resolve(value);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const seconds = Number(element.duration);
      settle(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    element.onerror = () => settle(null);
    element.src = url;
  });
}

/** Duration bounds as a rejection, or null when the length is acceptable. */
export function durationRejection(
  seconds: number | null,
  { min = 0, max }: { min?: number; max: number },
): UploadRejection | null {
  if (seconds == null) return null;
  if (min > 0 && seconds < min) {
    return {
      code: "too_short",
      messageKey: "appChat.avatarStudio.enroll.durationTooShort",
      params: { seconds: String(min) },
      detail: `duration ${seconds}s is under ${min}s`,
    };
  }
  if (seconds > max) {
    return {
      code: "too_long",
      messageKey: "appChat.avatarStudio.enroll.durationTooLong",
      params: { seconds: String(max) },
      detail: `duration ${seconds}s is over ${max}s`,
    };
  }
  return null;
}
