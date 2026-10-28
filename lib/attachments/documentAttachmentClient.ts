import { cdpFetch } from "@/lib/cdp/fetch";
import { postForm } from "./formUpload";
import { CHAT_ATTACHMENT_PURPOSE } from "./chatAttachmentPurpose";
import {
  asUploadableFile,
  isCodeTextFile,
  UploadRejectedError,
  mapUploadFailure,
  preflightUpload,
} from "@/lib/uploads/limits";
import { assertUploadContent } from "@/lib/uploads/contentCheck";

/**
 * Making an attached PDF/Office file readable by the agent.
 *
 * Two hops, and the first one is deliberately NOT the composer's usual upload.
 * Images and video go to POST /api/v1/media/artifacts, whose client keeps only
 * an `artifactId`; the Backend needs a storage-service `file_id` to read the
 * bytes back for parsing, so a document takes the same door the Knowledge Base
 * uses (POST /api/v1/media/upload, which returns one) and then registers it.
 *
 * The second hop answers immediately with `processing`. Parsing an 80-page PDF
 * and summarizing it takes longer than a request should, so the caller polls —
 * which is also why this whole thing runs while the user is still typing rather
 * than when they press send.
 */

/** What the picker treats as a document.
 *
 * A mirror of the Backend's segmenter registry, and deliberately a soft one:
 * fetching the authoritative list would add a round-trip to every page load,
 * and drift degrades safely in the direction that matters. A format listed here
 * that the Backend cannot segment comes back as a 415 with a clear message; one
 * the Backend supports but this list omits is simply not offered. Neither
 * silently mis-handles a file. */
export const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".md",
  ".txt",
  ".xls",
  ".xlsx",
  ".csv",
  // The text-shaped formats. `.tsv` was held out of this list for exactly the
  // reason the note here used to give — no MIME allowlist accepted it, so the
  // upload service 415'd the file before the segmenter ever saw it, and
  // offering it in the picker only produced a format that always failed. That
  // is fixed at the source: text/tab-separated-values, text/html,
  // application/json, application/xml and text/xml are now in the allowlist,
  // and the upload service serves every one of them as a download rather than
  // rendering it (apps/upload/src/files/render-policy.ts) — which is what makes
  // accepting markup safe.
  ".tsv",
  ".html",
  ".htm",
  ".json",
  ".xml",
  // Read by the Markdown extractor; no MIME of their own, so they ride on
  // text/plain or arrive typeless and are matched here by name.
  ".markdown",
  ".mdx",
  ".log",
] as const;

export type AttachmentDocumentStatus = "queued" | "processing" | "ready" | "failed";

export type AttachmentDocument = {
  id: string;
  file_name: string;
  status: AttachmentDocumentStatus;
  segment_unit?: string;
  segment_count: number;
  short_description?: string;
  text_extracted: boolean;
  failure_code?: string;
  /** When the Backend last moved this row. Present so a `processing` row can be
   *  aged: without it the wire cannot tell a document that is working from one
   *  whose pipeline died, and both render as the same spinner. */
  updated_at?: string;
};

/**
 * Whether this file takes the document path rather than the media one.
 *
 * Extension-first, with no MIME fallback, because the two disagree in exactly
 * the case that matters: browsers routinely report nothing or
 * application/octet-stream for .docx and .xlsx, so trusting file.type would
 * send the office formats down the image path — where they would be uploaded
 * as media, rendered as a broken <img>, and never parsed.
 */
export function isDocumentFile(file: File): boolean {
  const name = file.name.toLowerCase();
  // Source and config files are documents too (N09, 07/10/2026): accepting a
  // .py at pre-flight was not enough — it fell through to the image path, was
  // stored as media and never registered, so the agent said it had not been
  // attached. The Backend's segment registry reads them as code.
  return DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension)) || isCodeTextFile(file);
}

/**
 * Upload the bytes and return the storage-service file id.
 *
 * Through postForm, not a bare fetch (B16): it refreshes a lapsed token, reports
 * byte progress, and ends with UPLOAD_STALLED / UPLOAD_TIMEOUT instead of
 * hanging when the connection or the server stops answering.
 */
export async function uploadDocumentBytes(
  original: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const file = asUploadableFile(original);
  const rejection = preflightUpload(file);
  if (rejection) throw new UploadRejectedError(rejection);
  await assertUploadContent(file);

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("media_type", "document");
  // Picked, not yet sent: the attachment pipeline needs the stored file, the
  // Library does not (BUG-AI-0668).
  form.append("purpose", CHAT_ATTACHMENT_PURPOSE);

  const response = await postForm("/api/artifacts/media/upload", form, { onProgress });
  if (response.status < 200 || response.status >= 300) {
    throw new UploadRejectedError(mapUploadFailure(response.status, response.body), response.status);
  }
  const fileId = extractFileId(response.body);
  if (!fileId) {
    // A 200 with no id means the proxy dropped the field or the row predates
    // the storage service. Either way there is nothing for the Backend to read,
    // and registering it anyway would fail later with a worse message.
    throw new UploadRejectedError({ messageKey: "uploads.failed", params: { status: "" } });
  }
  return fileId;
}

/** The register call's bound: the Backend's inline read-back (~2x document_fetch_timeout). */
export const REGISTER_TIMEOUT_MS = 150_000;

/** Register an uploaded file so the agent can search and read it. */
export function registerAttachmentDocument(input: {
  fileId: string;
  sessionId?: string;
  fileName?: string;
}): Promise<AttachmentDocument> {
  return cdpFetch<AttachmentDocument>("/api/v1/attachment-documents", {
    method: "POST",
    // Bounded (B16): Attach reads the bytes back inline, with retries, before it answers.
    timeoutMs: REGISTER_TIMEOUT_MS,
    body: {
      file_id: input.fileId,
      session_id: input.sessionId ?? "",
      file_name: input.fileName ?? "",
    },
  });
}

export function getAttachmentDocument(
  documentId: string,
  signal?: AbortSignal,
): Promise<AttachmentDocument> {
  return cdpFetch<AttachmentDocument>(
    `/api/v1/attachment-documents/${encodeURIComponent(documentId)}`,
    { signal },
  );
}

export const POLL_INTERVAL_MS = 1500;
// The Backend's own budget for one document is 10 minutes — the background
// goroutine's context timeout (backgroundIndexTimeout,
// backend/internal/adapter/http/handler/attachment_document.go:26). This used
// to be 5 minutes here, so the poller gave up on a document the Backend was
// still legitimately working on: waitForAttachmentDocument returned the
// last-seen "processing" state, composerUploadTransport.ts read that as a
// failure, and a user who retried re-registered the SAME file while the first
// Process() goroutine could still be running — two goroutines writing the
// same row with no coordination (pipeline.go's ReplaceSegments/ReplaceChunks/
// Save are a plain upsert, no per-row lock). Set above the Backend's own
// budget with margin so the two ends agree on who gives up first. 24/09/2026.
export const POLL_TIMEOUT_MS = 10 * 60_000 + 2 * 60_000;

export interface WaitForDocumentOptions {
  /** Give up after this long and return the last state (default POLL_TIMEOUT_MS). */
  maxWaitMs?: number;
  signal?: AbortSignal;
  /** Poll interval (default POLL_INTERVAL_MS); tests pass 1. */
  pollMs?: number;
  /** The status read; tests pass a stand-in. */
  get?: typeof getAttachmentDocument;
}

/**
 * Wait until the document is readable, or give up.
 *
 * A timeout resolves with the last state rather than throwing: a document still
 * processing after the poll budget is not something the user can act on, and
 * the chip should say "still working" rather than "failed". An aborted signal
 * ends the wait the same way.
 */
export async function waitForAttachmentDocument(
  documentId: string,
  onUpdate?: (document: AttachmentDocument) => void,
  opts: WaitForDocumentOptions = {},
): Promise<AttachmentDocument> {
  const get = opts.get ?? getAttachmentDocument;
  const deadline = Date.now() + (opts.maxWaitMs ?? POLL_TIMEOUT_MS);
  let latest = await get(documentId, opts.signal);
  onUpdate?.(latest);

  while (latest.status !== "ready" && latest.status !== "failed") {
    if (Date.now() > deadline || opts.signal?.aborted) return latest;
    await new Promise((resolve) => setTimeout(resolve, opts.pollMs ?? POLL_INTERVAL_MS));
    if (opts.signal?.aborted) return latest;
    latest = await get(documentId, opts.signal);
    onUpdate?.(latest);
  }
  return latest;
}

/**
 * Rows a register call may still be working on the Backend, keyed by a cheap
 * client-side fingerprint of the file (name+size+lastModified — the Backend
 * already hash-matches by content in Attach(), so this only has to be a good
 * enough proxy for "probably the same bytes" to avoid a second round trip)
 * AND the session that registered it.
 *
 * Why this exists: `attachment_document.go`'s handler detaches a NEW
 * background Process() goroutine on every register call whose hash-match
 * finds a row that is not yet "ready" (service.go Attach(), ~line 200) — it
 * has no way to know a goroutine from an EARLIER register of the same content
 * may still be inside its own 10-minute budget. If a user removes a "failed"
 * chip (produced by a poll timeout, not a real failure) and re-attaches the
 * same file, `registerAttachmentDocument` fires again and races the goroutine
 * still working the row. Remembering the row id here and resuming the wait on
 * it, instead of uploading and registering again, closes that window without
 * a Backend change. 24/09/2026, read against
 * internal/usecase/attachdoc/service.go and pipeline.go on origin/dev.
 *
 * The session is part of the key, not just the file, because this module is a
 * MODULE-LEVEL map that survives a client-side session switch (no reload):
 * `currentSessionId` (useCluegaAiChatStore) changes when the reader opens a
 * different conversation in the same tab, but a Map keyed only on the file
 * does not know that. A register call is also what asks the Backend to link
 * the document to the session making the call (service.go Attach()'s
 * `link()`, on both return paths) — so recalling session A's row for session
 * B would silently skip registering (and therefore linking) the document to
 * B, leaving B's attach depend entirely on an unrelated AI-service self-heal
 * (docctx/prepare.py's link_attachment_document_session) instead of the
 * normal attach path. Read against origin/dev, 24/09/2026.
 */
const inFlightDocuments = new Map<string, { documentId: string; expiresAt: number }>();

// `sessionId ?? ""` means every not-yet-created conversation (the composer
// before the first message is sent, where both live call sites —
// AttachmentPopover.tsx and useComposerFileDrop.ts — read
// `currentSessionId ?? undefined`) shares the single `""` scope. Two
// different brand-new chats that both attach the same file before either
// settles will recall each other's row and skip registering (and so linking)
// the document for the second one — this is a KNOWN, accepted gap (not the
// common single-session case the sessionId scoping above closes), flagged in
// review and left as-is pending a decision on scoping un-created sessions by
// something more unique (e.g. a per-composer draft id). 24/09/2026.
function fileFingerprint(file: File, sessionId: string | undefined): string {
  return `${sessionId ?? ""}:${file.name}:${file.size}:${file.lastModified}`;
}

/** The row a previous register call for this same file AND session is still
 *  working, if that attempt's own poll window has not yet elapsed.
 *  `undefined` once it has — at that point the row is old enough that a fresh
 *  attempt is no worse than what `StaleAfter` on the Backend already allows —
 *  or if the earlier register happened under a different session. */
export function recallInFlightDocument(file: File, sessionId?: string): string | undefined {
  const key = fileFingerprint(file, sessionId);
  const entry = inFlightDocuments.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    inFlightDocuments.delete(key);
    return undefined;
  }
  return entry.documentId;
}

/** Record that `documentId` is now the row for this file's content under this
 *  session, so a retry before it settles can wait on it instead of
 *  registering again. */
export function trackInFlightDocument(
  file: File,
  documentId: string,
  sessionId?: string,
): void {
  inFlightDocuments.set(fileFingerprint(file, sessionId), {
    documentId,
    expiresAt: Date.now() + POLL_TIMEOUT_MS,
  });
}

/** The row reached a terminal state (or its poll gave up) — nothing left to
 *  reuse, so a later attach of the same file under this session should
 *  register fresh. */
export function clearInFlightDocument(file: File, sessionId?: string): void {
  inFlightDocuments.delete(fileFingerprint(file, sessionId));
}

function extractFileId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown>;
  const fileId = data.file_id ?? data.fileId;
  return typeof fileId === "string" ? fileId : "";
}
