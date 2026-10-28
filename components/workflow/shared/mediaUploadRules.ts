import { formatBytes } from "@/lib/format/bytes";
import { readMediaDuration } from "@/lib/media/mediaPreflight";
import type { UploadRejection } from "@/lib/uploads/limits";
import {
  CANVAS_AUDIO_MAX_BYTES,
  CANVAS_MEDIA_MAX_SECONDS,
  CANVAS_MEDIA_TYPES,
  CANVAS_VIDEO_MAX_BYTES,
  MEDIA_TYPE_ALIASES,
  MEDIA_TYPE_BY_EXTENSION,
} from "./constants";

/** The type the service should see: an alias, or a blank type read from the extension. */
export function canonicalMediaType(file: Pick<File, "name" | "type">): string {
  const type = file.type.trim().toLowerCase();
  if (type) return MEDIA_TYPE_ALIASES[type] ?? type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_TYPE_BY_EXTENSION[extension] ?? "";
}

/** Whether the canvas's own video/audio rule applies; everything else keeps the app's checks. */
export function isCanvasMedia(file: Pick<File, "name" | "type">): boolean {
  const type = canonicalMediaType(file);
  return type.startsWith("video/") || type.startsWith("audio/");
}

/** `file` under its canonical type, or itself when it already carries it. */
export function withCanonicalType(file: File): File {
  const type = canonicalMediaType(file);
  if (!type || type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Size and type against the canvas rule; `null` when the file fits it. */
export function canvasMediaRefusal(
  file: Pick<File, "name" | "type" | "size">,
): UploadRejection | null {
  const type = canonicalMediaType(file);
  const video = type.startsWith("video/");
  if (!CANVAS_MEDIA_TYPES.has(type)) {
    return {
      code: "unsupported_type",
      messageKey: "uploads.unsupportedType",
      params: { type: type || file.type || file.name },
      detail: `file ${file.name} has unsupported canvas type ${type || "(none)"}`,
    };
  }
  const limit = video ? CANVAS_VIDEO_MAX_BYTES : CANVAS_AUDIO_MAX_BYTES;
  if (file.size <= limit) return null;
  return {
    code: "too_large",
    messageKey: video ? "uploads.tooLargeVideo" : "uploads.tooLarge",
    params: { limit: formatBytes(limit), size: formatBytes(file.size) },
    detail: `file ${file.name} is ${file.size}B, canvas limit ${limit}B`,
  };
}

/** "m:ss" for the length a refusal quotes. */
function clockOf(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Over the canvas length cap; an unreadable length passes, the service may still take it. */
export function canvasDurationRefusal(
  seconds: number | null,
  name: string,
): UploadRejection | null {
  if (seconds == null || seconds <= CANVAS_MEDIA_MAX_SECONDS) return null;
  return {
    code: "too_long",
    messageKey: "uploads.tooLongMedia",
    params: {
      minutes: String(CANVAS_MEDIA_MAX_SECONDS / 60),
      length: clockOf(seconds),
    },
    detail: `file ${name} runs ${seconds}s, canvas limit ${CANVAS_MEDIA_MAX_SECONDS}s`,
  };
}

/** The whole canvas rule for one video/audio file: type, size, then length. */
export async function canvasMediaCheck(file: File): Promise<UploadRejection | null> {
  const refusal = canvasMediaRefusal(file);
  if (refusal) return refusal;
  const seconds = await readMediaDuration(withCanonicalType(file));
  return canvasDurationRefusal(seconds, file.name);
}
