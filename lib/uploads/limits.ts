import { formatBytes } from "@/lib/format/bytes";
import { formatStorageAllowance, formatStorageBytes } from "@/lib/format/storageBytes";

// The upload limits CDP enforces, mirrored client-side.
//
// Why mirror them at all: the service caps a file at 25 MiB and validates its MIME
// type, and a rejection arrives as a 413/415 only AFTER the whole body has been
// sent. For a 200 MB video on a home connection that is minutes of upload followed
// by a failure. Checking locally first turns that into an instant, explainable
// "this file is too big" — the network never gets touched.
//
// CDP stays the authority. These values are a fast path, not a
// replacement: a limit changed server-side (or a file that slips past a stale
// build) still comes back as a 413/415, and `mapUploadFailure` renders it with the
// same copy. Keep them in step with `UPLOAD_MAX_FILE_BYTES` /
// `UPLOAD_ALLOWED_MIME` in CLUEGA_CDP_PLATFORM_SERVICES
// (packages/shared-config/src/env.ts).
export const MAX_UPLOAD_BYTES = 26_214_400; // 25 MiB — UPLOAD_MAX_FILE_BYTES


// Video has its own, larger ceiling server-side (`UPLOAD_MAX_VIDEO_BYTES`).
// A document fits under the general cap; a five-minute phone clip does not —
// real reference ads run 157-780 kB/s, so five minutes is 45-223 MiB and the
// general cap is reached in as little as 33 seconds. Preflighting a clip
// against the document number rejected exactly the files this product is built
// to read, before a byte left the browser.
export const MAX_VIDEO_UPLOAD_BYTES = 524_288_000; // 500 MiB — UPLOAD_MAX_VIDEO_BYTES

// Images and documents sit between the two. The upload limits table of 13-10
// sets 30 MiB per image and 50 MiB per document (documents were raised from the
// general cap under LIB-071; images were 50 MiB until that table).
export const MAX_IMAGE_UPLOAD_BYTES = 31_457_280; // 30 MiB — UPLOAD_MAX_IMAGE_BYTES

/** The upload service also refuses an image wider or taller than this (its header is read). */
export const MAX_IMAGE_SIDE_PX = 8000;
export const MAX_DOCUMENT_UPLOAD_BYTES = 52_428_800; // 50 MiB — UPLOAD_MAX_DOCUMENT_BYTES

/**
 * The document formats that earn the document ceiling.
 *
 * A list, not an `application/*` prefix: that prefix also matches
 * `application/octet-stream`, which is what a browser sends when it cannot
 * identify a file — and an unidentified file must not buy a raised limit.
 */
const DOCUMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // The template siblings. A .potx is the same bytes and the same ceiling as a
  // .pptx; leaving them out gave a client's own deck template the 25 MiB cap.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
]);

/**
 * The ceiling that applies to one file. Mirrors `maxBytesFor` server-side
 * (CLUEGA_CDP_PLATFORM_SERVICES packages/shared-config/src/config.ts) — the two
 * have to agree tier for tier, or the browser preflights against a number the
 * service does not enforce and the user pays for it with a 413 after the upload.
 */
export function maxUploadBytesFor(type: string): number {
  const mime = type.trim().toLowerCase();
  if (mime.startsWith("video/")) return MAX_VIDEO_UPLOAD_BYTES;
  if (mime.startsWith("image/")) return MAX_IMAGE_UPLOAD_BYTES;
  if (DOCUMENT_MIME_TYPES.has(mime)) return MAX_DOCUMENT_UPLOAD_BYTES;
  // Audio, plain text and the long tail. An empty type lands here too: a browser
  // reporting nothing is not evidence of a large file.
  return MAX_UPLOAD_BYTES;
}

/**
 * Whether the advice about compressing applies.
 *
 * The refusal used to end "or compress the video before uploading" whatever had
 * been refused, so a 60 MB PNG, a deck and an mp3 were all told to compress a
 * video they had not uploaded (BUG-707). Advice you cannot follow reads as the
 * product not knowing what you did.
 */
function isVideoType(type: string): boolean {
  return type.trim().toLowerCase().startsWith("video/");
}

/** The largest thing this workspace accepts at all — what a "drop anything" hint quotes. */
export const MAX_ANY_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES;

// The full set CDP accepts. SVG is deliberately absent: it is executable
// markup, and these files are served back to browsers.
export const ALLOWED_UPLOAD_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
  "audio/ogg",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  // Office TEMPLATES. Measured 23/09/2026 on M01-017 and M01-076 — the two
  // acceptance cases whose brief says "use the client's template" — where a
  // .potx was refused and the run continued without the template it was about.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "text/csv",
  "text/plain",
  "text/markdown",
  // Text-shaped formats the document extractor reads. Accepted to be READ, not
  // to be rendered: the upload service serves every one of them with
  // Content-Disposition: attachment and X-Content-Type-Options: nosniff, which
  // is what makes accepting markup safe at all.
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
  "text/tab-separated-values",
];

/**
 * Source code and config files, read as plain text (N09, 07/10/2026: a
 * parse_budget.py was refused with "Files of type text/x-python can't be
 * uploaded", so a "fix this crash and add a test" request could not start).
 * Browsers name these inconsistently (text/x-python, text/x-python-script,
 * application/x-sh, text/javascript, "" …), so they are recognised by
 * extension and sent as text/plain, the type the upload service already takes
 * and serves as an attachment with nosniff. They are documents to the composer
 * (`isDocumentFile`), so they are registered and read; keep this list in step
 * with the Backend's `codeLanguages` (internal/adapter/segment/code.go).
 */
export const CODE_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  "py", "ipynb", "js", "mjs", "cjs", "ts", "tsx", "jsx", "sql", "sh", "bash",
  "go", "java", "kt", "rb", "php", "rs", "c", "h", "cpp", "hpp", "cs", "swift",
  "r", "scala", "css", "scss", "yaml", "yml", "toml", "ini", "cfg", "conf",
]);

function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

/** Whether `file` is a source/config file the composer accepts as text. */
export function isCodeTextFile(file: Pick<File, "name">): boolean {
  return CODE_TEXT_EXTENSIONS.has(extensionOf(file.name));
}

/** The file as it is sent: a code file re-typed text/plain, anything else as is. */
export function asUploadableFile(file: File): File {
  if (!isCodeTextFile(file) || file.type === "text/plain") return file;
  return new File([file], file.name, { type: "text/plain", lastModified: file.lastModified });
}

// Ready for an <input type="file" accept="…">, so the picker never offers a type
// the service would reject. Extensions ride along because browsers match some
// office formats by extension rather than by MIME.
export const UPLOAD_ACCEPT_ATTR = [
  ...ALLOWED_UPLOAD_MIME,
  ".docx",
  ".xlsx",
  ".pptx",
  ".dotx",
  ".xltx",
  ".potx",
  ".csv",
  ".md",
  // Extensions the OS picker matches by name rather than by type. Browsers
  // disagree about what a .htm or a .tsv IS — several report an empty type or
  // application/octet-stream — so without these the picker greys out files the
  // service would happily accept.
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".tsv",
  ".markdown",
  ".mdx",
  ".txt",
  ".log",
  ".doc",
  ".xls",
  ".ppt",
  ...Array.from(CODE_TEXT_EXTENSIONS, (ext) => `.${ext}`),
].join(",");

/**
 * A .zip the CHAT COMPOSER opens into ordinary attachments (F1). Composer only: the Library,
 * AvatarStudio and the other pickers share UPLOAD_ACCEPT_ATTR and ALLOWED_UPLOAD_MIME, and a
 * zip there would be stored as a zip. `preflightUpload` still refuses it, on purpose — the
 * composer takes zips out of the pick before preflight (useComposerAttachmentStore.upload).
 */
export const ARCHIVE_MIME: readonly string[] = ["application/zip", "application/x-zip-compressed"];

/** The most a composer .zip may weigh; the Backend's MaxArchiveUploadBytes. */
export const MAX_ARCHIVE_UPLOAD_BYTES = 50 * 1024 * 1024;
/** The Backend's archive caps (attacharchive.DefaultCaps), quoted in the refusal. */
export const MAX_ARCHIVE_ENTRIES = 200;

export function isArchiveFile(file: Pick<File, "name" | "type">): boolean {
  return file.name.toLowerCase().endsWith(".zip") || ARCHIVE_MIME.includes(file.type.trim().toLowerCase());
}

/** The composer's picker: everything uploadable, plus .zip. */
export const CHAT_ATTACHMENT_ACCEPT = [UPLOAD_ACCEPT_ATTR, ".zip", ...ARCHIVE_MIME].join(",");

export type UploadCopy = {
  /**
   * i18n key under `uploads.*` — resolve with resolveUploadMessage.
   *
   * No `common.` prefix: common.json is SPREAD into the dictionary root
   * (`...enCommon` in hooks/useTranslate.tsx) while appChat.json is mounted under a
   * key (`appChat: enAppChat`). Prefixing it made `t()` fall back to returning the
   * path, so the upload row showed `common.uploads.unsupportedTypeGeneric` to users.
   */
  messageKey: string;
  /** Interpolation values for that key. */
  params: Record<string, string>;
};

export type UploadRejection = UploadCopy & {
  // `too_short`/`too_long` are duration verdicts, which only a media file has —
  // see lib/media/mediaPreflight.ts. They share this shape so one renderer
  // (resolveUploadMessage) covers every local refusal.
  code: "too_large" | "unsupported_type" | "too_short" | "too_long" | "empty_file" | "bad_content";
  /** For logs and analytics, never for the user. */
  detail: string;
};

/** Thrown when a rejection has to travel through a non-React module. */
export class UploadRejectedError extends Error {
  readonly copy: UploadCopy;

  /** HTTP status this came from, when it came from a response at all. Absent for
   *  a pre-flight rejection, which no retry can help. Read by
   *  `isRetryableUploadFailure` — the copy alone cannot say whether trying again
   *  is worth anything. */
  readonly status?: number;

  /** The service's own failure code (`INDEX_UNAVAILABLE`), shown on the chip beside the copy. */
  readonly code?: string;

  constructor(copy: UploadCopy, status?: number, code?: string) {
    // The key is the message so an untranslated log line still says what happened.
    super(copy.messageKey);
    this.name = "UploadRejectedError";
    this.copy = copy;
    this.status = status;
    this.code = code;
  }
}

/**
 * Render an upload message with the caller's translator (`t` from useTranslate, or
 * translateStatic outside React). Kept here so the key/param contract has exactly one
 * implementation, while this module still imports nothing from React.
 */
export function resolveUploadMessage(
  translate: (key: string) => string,
  copy: UploadCopy,
): string {
  return Object.entries(copy.params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    translate(copy.messageKey),
  );
}

/**
 * Re-exported, not reimplemented: the limit sentence and the size on a library
 * row have to come out of the same function or they drift — which is exactly
 * what happened when this file said "25.0 MB" (binary) about a ceiling the
 * library rendered against a differently-rounded binary number.
 */
export { formatBytes } from "@/lib/format/bytes";

/**
 * Check a file before uploading it. Returns null when it is fine.
 *
 * An unknown/empty `file.type` is allowed through rather than rejected: browsers
 * report nothing for some office and markdown files, and refusing those locally
 * would block content the service accepts. The service still has the last word.
 */
/**
 * The types a browser sends when it does not know what the file is.
 *
 * An empty string has always fallen through this check to the service, which is
 * right: "I cannot tell" is not "this is forbidden", and the service has its own
 * allowlist. `application/octet-stream` means exactly the same thing and was
 * being REFUSED — so the two halves of one condition disagreed.
 *
 * Measured 23/09/2026 with a client's own .potx deck template: the chip came
 * back reading "Files of type application/octet-stream can't be uploaded", over
 * a file whose extension the picker's own accept list names. This module
 * already knew the cause — `UPLOAD_ACCEPT_ATTR` carries extensions precisely
 * because "browsers match some office formats by extension rather than by MIME"
 * — and `detectKnowledgeFileSourceType` in lib/knowledge already reads the
 * extension first for the same reason. The chat attachment path was the one
 * that did not, which is why it was the one that refused the template.
 *
 * Refusing here can only ever be a guess about a file the browser could not
 * name; the service is the side that knows, and it answers 415 with a message
 * this module already maps.
 */
const SAYS_NOTHING_ABOUT_THE_FILE: ReadonlySet<string> = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/unknown",
]);

export function preflightUpload(file: File): UploadRejection | null {
  const limit = maxUploadBytesFor(file.type);
  if (file.size > limit) {
    return {
      code: "too_large",
      messageKey: isVideoType(file.type) ? "uploads.tooLargeVideo" : "uploads.tooLarge",
      params: { limit: formatBytes(limit), size: formatBytes(file.size) },
      detail: `file ${file.name} is ${file.size}B, limit ${limit}B`,
    };
  }
  const type = file.type.trim().toLowerCase();
  if (isCodeTextFile(file)) return null;
  if (!SAYS_NOTHING_ABOUT_THE_FILE.has(type) && !ALLOWED_UPLOAD_MIME.includes(type)) {
    return {
      code: "unsupported_type",
      messageKey: "uploads.unsupportedType",
      params: { type },
      detail: `file ${file.name} has unsupported type ${type}`,
    };
  }
  return null;
}

/**
 * Refuses, before a byte is sent, a file the company has no room for (LIB-058).
 *
 * The upload door refuses it too, but only once the whole body has arrived — for
 * a 500 MB video that is a long wait for a "no" the page could have given at
 * once. Same comparison as the server (used + size > write limit, the 110% of
 * LIB2-008 without credits), so the two never disagree about a file; the server
 * stays the authority, and a quota the page has not read yet (`null`) lets the
 * file through to it. A write limit of 0 means no cap (credits or auto top-up);
 * an older server sends none and capped at the plan itself.
 *
 * Figures in the Library's storage units (LIB2-013).
 */
export function preflightQuota(
  size: number,
  quota: { usedBytes: number; totalBytes: number; writeLimitBytes?: number } | null | undefined,
): UploadCopy | null {
  if (!quota || !(quota.totalBytes > 0) || !(size > 0)) return null;
  const limit = quota.writeLimitBytes ?? quota.totalBytes;
  if (limit === 0 || quota.usedBytes + size <= limit) return null;
  if (quota.writeLimitBytes) {
    return graceCopy("uploads.storageGraceExceededPreflight", quota.usedBytes, size, limit, quota.totalBytes);
  }
  return {
    messageKey: "uploads.storageFullPreflight",
    params: {
      used: formatStorageBytes(quota.usedBytes) || "0 B",
      total: formatStorageAllowance(quota.totalBytes),
    },
  };
}

/**
 * "{after} would exceed the {limit} grace limit ({capacity} + 10%)" — a write
 * refused past the 110% grace limit, said with usage after the write so the
 * reader sees by how much (LIB2-005 / LIB2-034). In the Library's storage units.
 */
function graceCopy(messageKey: string, used: number, size: number, limit: number, total: number): UploadCopy {
  return {
    messageKey,
    params: {
      after: formatStorageBytes(used + size) || "0 B",
      limit: formatStorageAllowance(limit),
      capacity: formatStorageAllowance(total),
    },
  };
}

/**
 * Turn a failed upload/attach response into the same copy the pre-flight check
 * produces, so the user sees one message per problem no matter which side caught
 * it. `body` is the parsed JSON when there was one.
 *
 * 413 and 415 are the two the service raises by contract (FILE_TOO_LARGE,
 * UNSUPPORTED_MEDIA_TYPE); 502 is the backend saying storage is unreachable,
 * which is the one case worth suggesting a retry.
 */
export function mapUploadFailure(
  status: number,
  body?: unknown,
  // The type of the file that failed, so a rejected video quotes the video
  // ceiling instead of the document one. Optional: callers that do not know it
  // get the general cap, which is what this said before.
  fileType = "",
): UploadCopy {
  const code = extractCode(body);
  if (status === 413 || code === "FILE_TOO_LARGE" || code === "payload_too_large") {
    // The server does not report the file's size back, so the sentence says "larger
    // than that" rather than inventing a number.
    // An image is refused for its pixels too, and the reason may not survive
    // the hops back to the browser — so the sentence names both limits.
    if (fileType.trim().toLowerCase().startsWith("image/")) {
      return {
        messageKey: "uploads.tooLargeServerImage",
        params: { limit: formatBytes(MAX_IMAGE_UPLOAD_BYTES), pixels: `${MAX_IMAGE_SIDE_PX}×${MAX_IMAGE_SIDE_PX}` },
      };
    }
    return {
      messageKey: isVideoType(fileType) ? "uploads.tooLargeServerVideo" : "uploads.tooLargeServer",
      params: { limit: formatBytes(maxUploadBytesFor(fileType)) },
    };
  }
  // The media gateway's own content refusals; before the 415 below, which would say "file type".
  if (code === "empty_file" || code === "content_mismatch") {
    return { messageKey: "uploads.documentInvalid", params: {} };
  }
  if (status === 415 || code === "UNSUPPORTED_MEDIA_TYPE" || code === "unsupported_media_type") {
    return { messageKey: "uploads.unsupportedTypeGeneric", params: {} };
  }
  // Refused at the door for space (LIB-058, §3.10). The server sends the company's
  // used and total so the sentence can say how full it is — the choice the user
  // faces is between clearing space and upgrading, and the numbers decide it.
  if (code === "quota_exceeded") {
    const used = extractDetail(body, "used_bytes");
    const total = extractDetail(body, "total_bytes");
    if (used === null || total === null) {
      return { messageKey: "uploads.storageFullNoFigures", params: {} };
    }
    // A server that names the grace limit and the refused write (LIB2-005).
    const limit = extractDetail(body, "write_limit_bytes");
    const size = extractDetail(body, "size_bytes");
    if (limit !== null && limit > 0 && size !== null && size > 0) {
      return graceCopy("uploads.storageGraceExceeded", used, size, limit, total);
    }
    // Storage figures, in the Library's storage units (LIB2-013).
    return {
      messageKey: "uploads.storageFull",
      params: { used: formatStorageBytes(used) || "0 B", total: formatStorageAllowance(total) },
    };
  }
  if (status === 502 || code === "storage_unavailable") {
    return { messageKey: "uploads.storageUnavailable", params: {} };
  }
  if (status === 401 || status === 403) {
    return { messageKey: "uploads.unauthorized", params: {} };
  }
  // The chat-attachment endpoint's own codes. Matched BEFORE the status
  // fall-through, and by code rather than by status, because the code says
  // which of several things went wrong where the status cannot: a 400 from
  // POST /api/v1/attachment-documents means the bytes were refused, and
  // rendering it as "(error 400)" tells the user nothing they can act on.
  if (code === "attachment_invalid") {
    return { messageKey: "uploads.documentInvalid", params: {} };
  }
  if (code === "attachment_source_unavailable") {
    return { messageKey: "uploads.storageUnavailable", params: {} };
  }
  if (code === "attachment_format_unsupported") {
    return { messageKey: "uploads.unsupportedTypeGeneric", params: {} };
  }
  // The upload proxy gave up waiting for the backend (B16): said as a timeout, not a fault.
  if (status === 504 || code === "upstream_timeout") {
    return { messageKey: "uploads.uploadTimeout", params: {} };
  }
  if (code === "attachment_internal_error" || code === "attachment_unavailable" || status >= 500) {
    return { messageKey: "uploads.serverError", params: {} };
  }
  return { messageKey: "uploads.failed", params: { status: String(status) } };
}

/** A number from the error envelope's `details`, or null when it is not there. */
function extractDetail(body: unknown, key: string): number | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const details = (error as Record<string, unknown>).details;
  if (!details || typeof details !== "object") return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractCode(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const direct = typeof b.code === "string" ? b.code : "";
  const nested =
    b.error && typeof b.error === "object"
      ? String((b.error as Record<string, unknown>).code ?? "")
      : "";
  return direct || nested;
}

/**
 * The files out of a drop, minus what cannot be uploaded.
 *
 * Two things a drop carries that a file picker never does:
 *
 *  - **Directories.** Dropping a folder yields an entry with no type and a size
 *    the browser makes up; sending it produces a failed row named after the
 *    folder. `webkitGetAsEntry` is the only way to tell — `File` alone cannot —
 *    and it is read here, synchronously, because the DataTransfer is emptied as
 *    soon as the event handler returns.
 *  - **Non-file payloads.** The library's own rows are draggable (moving an
 *    asset into a folder), so a drop can be plain text with no files at all.
 *
 * Returns the files in drop order. An empty array means "nothing uploadable was
 * dropped", which the caller should treat as a no-op, not an error.
 */
export function filesFromDrop(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];

  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  if (items.length > 0) {
    const files: File[] = [];
    for (const item of items) {
      if (item.kind !== "file") continue;
      // Not all browsers expose it; when they do, a directory is skipped.
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    return files;
  }

  return dataTransfer.files ? Array.from(dataTransfer.files) : [];
}

/** Whether a drag carries files at all — a row being dragged between folders does not. */
export function dragCarriesFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

/** How many files the chat composer holds at once — images and documents
 *  together, counted the same.
 *
 *  ONE number on purpose. There were two: images capped at 2 and a document
 *  raising the ceiling to 6, on the reasoning that an image costs context in
 *  pixels while a document costs one manifest line and is read on demand. True
 *  about cost, but it made the limit unexplainable — the ceiling moved
 *  depending on what you had already attached, and the two halves of the UI
 *  read it differently: admission applied the raised cap while the + button
 *  greyed out at the base one, so six documents were allowed and the control
 *  that would have added them was disabled at two.
 *
 *  A flat number is a limit a person can hold in their head, and it removes
 *  that whole class of disagreement. The creative module still sets its own
 *  per-tab cap through `setCap`; this is what every other surface uses and what
 *  creative restores to.
 *
 *  20, per the upload limits table of 13-10 ("up to 20 files per message").
 *  Deliberately BELOW the server's CHAT_TURN_MAX_ATTACHMENTS (50, CLUEGA_AI_CDP
 *  app/models/chat_limits.py), which also sizes how many of a session's
 *  documents the model sees — lowering that would hide documents from later
 *  turns. A composer under the server's cap never sends a batch it refuses.
 *
 *  It lives here rather than on the store because it is an upload LIMIT, next to
 *  the others, and because this module pulls in nothing heavier than a pure
 *  formatter: pure-logic callers (and their tests) must not have to load the
 *  whole attachment store — and through it the React tree — to read one number.
 */
export const MAX_ATTACHMENTS = 20;
