import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_UPLOAD_BYTES,
  UploadRejectedError,
  formatBytes,
  mapUploadFailure,
  type UploadCopy,
} from "@/lib/uploads/limits";
import type { AttachmentDocument } from "./documentAttachmentClient";
import { postForm } from "./formUpload";

/**
 * Opening a .zip from the composer into ordinary attachments (F1).
 *
 * One call: the Backend opens the archive, checks it whole (paths, size, entry count), and
 * admits each entry through the same door a connector's file takes — stored, and for a
 * document attached to the session. The zip itself is never stored. Contract: CONTRACTS.md
 * "## Zip upload" (POST /api/v1/attachment-documents/archive).
 */

export type ArchiveItem = {
  index: number;
  path: string;
  file_id: string;
  file_name: string;
  mime_type: string;
  media_type: string;
  size: number;
  url: string;
  deduplicated?: boolean;
  /** Present when the entry was attached as a document; poll it like any other. */
  document?: AttachmentDocument;
  /** Stored but not attached (the reader refused it); `code` is the attach failure code. */
  attach_error?: { code: string; message?: string };
};

export type ArchiveRejected = { index: number; path: string; code: string; message: string };
export type ArchiveIgnored = { index: number; path: string; code: string };

export type ArchiveExpansion = {
  archive: { file_name: string; size: number };
  items: ArchiveItem[];
  rejected: ArchiveRejected[];
  ignored: ArchiveIgnored[];
};

export async function expandArchive(
  file: File,
  options: { sessionId?: string; slots: number; onProgress?: (percent: number) => void },
): Promise<ArchiveExpansion> {
  if (file.size > MAX_ARCHIVE_UPLOAD_BYTES) {
    throw new UploadRejectedError(archiveTooLargeCopy(), undefined, "ARCHIVE_TOO_LARGE");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("session_id", options.sessionId ?? "");
  form.append("slots", String(Math.max(0, options.slots)));
  const response = await postForm("/api/v1/attachment-documents/archive", form, {
    onProgress: options.onProgress,
  });
  if (response.status < 200 || response.status >= 300) {
    const failure = archiveFailure(response.status, response.body);
    throw new UploadRejectedError(failure.copy, response.status, failure.code);
  }
  const data = (response.body as { data?: Partial<ArchiveExpansion> } | null)?.data ?? {};
  return {
    archive: data.archive ?? { file_name: file.name, size: file.size },
    items: data.items ?? [],
    rejected: data.rejected ?? [],
    ignored: data.ignored ?? [],
  };
}

function archiveTooLargeCopy(): UploadCopy {
  return {
    messageKey: "uploads.archiveTooLarge",
    params: { limit: formatBytes(MAX_ARCHIVE_UPLOAD_BYTES), entries: String(MAX_ARCHIVE_ENTRIES) },
  };
}

function archiveFailure(status: number, body: unknown): { copy: UploadCopy; code?: string } {
  const code = errorCode(body);
  if (status === 413 || code === "archive_too_large") {
    return { copy: archiveTooLargeCopy(), code: "ARCHIVE_TOO_LARGE" };
  }
  if (code === "archive_invalid") {
    return { copy: { messageKey: "uploads.archiveInvalid", params: {} }, code: "ARCHIVE_INVALID" };
  }
  return { copy: mapUploadFailure(status, body), code: code ? code.toUpperCase() : undefined };
}

function errorCode(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

/** The copy for one entry the archive could not add, by the Backend's per-entry code. */
export function archiveEntryCopy(code: string): UploadCopy {
  const known = new Set([
    "too_many_attachments",
    "nested_archive",
    "unsupported_type",
    "compression_ratio",
    "quota_exceeded",
    "too_large",
    "store_failed",
  ]);
  return {
    messageKey: known.has(code) ? `uploads.archiveEntry.${code}` : "uploads.archiveEntry.store_failed",
    params: {},
  };
}
