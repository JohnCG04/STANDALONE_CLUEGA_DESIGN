import {
  UPLOAD_BATCH_ENABLED,
  UPLOAD_FALLBACK_CONCURRENCY,
  chunkByBudget,
  runWithConcurrency,
  withRetry,
  type SettledResult,
} from "@/lib/uploads/batching";
import { isBatchUploadUnsupported } from "@/resources/app/pages/app/components/Conversation/components/MediaAddonPanel/components/ImageCanvasEditor/mediaImageClient";
import { describeDocumentFailure, describeDocumentTimeout } from "./documentFailure";
import {
  UploadRejectedError,
  mapUploadFailure,
  resolveUploadMessage,
  type UploadCopy,
} from "@/lib/uploads/limits";
import { CdpApiError } from "@/lib/cdp/errors";
import { translateStatic } from "@/hooks/useTranslate";
import {
  clearInFlightDocument,
  isDocumentFile,
  recallInFlightDocument,
  registerAttachmentDocument,
  trackInFlightDocument,
  uploadDocumentBytes,
  waitForAttachmentDocument,
  type AttachmentDocument,
} from "@/lib/attachments/documentAttachmentClient";
import {
  uploadArtifactFile,
  uploadArtifactFiles,
  type ArtifactUploadResult,
} from "@/resources/app/pages/app/components/Conversation/components/MediaAddonPanel/components/ImageCanvasEditor/mediaImageClient";
import { CHAT_ATTACHMENT_PURPOSE } from "./chatAttachmentPurpose";

/**
 * The wire half of staging an attachment.
 *
 * Split out of the store because the two answer different questions: the store
 * owns admission, caps and per-row state, and this owns how bytes reach a
 * service and come back as something addressable. They also differ per KIND —
 * media takes one endpoint, a document takes two plus a wait — which is exactly
 * the kind of branching that does not belong next to state management.
 */

export type UploadedAttachment = {
  artifactId: string;
  url: string;
  documentAssetId?: string;
  segmentUnit?: string;
  segmentCount?: number;
  shortDescription?: string;
  error?: string;
};

export type UploadOutcome = SettledResult<UploadedAttachment>;

/** Documents uploading, registering and parsing at once; the same bound media uses. */
export const DOCUMENT_UPLOAD_CONCURRENCY = UPLOAD_FALLBACK_CONCURRENCY;

/**
 * Upload every file, returning one outcome per file IN INPUT ORDER.
 *
 * Two transports, chosen per file. Media goes to the artifacts endpoint;
 * documents go to the storage upload endpoint and then through a
 * parse-and-index round-trip. The two run CONCURRENTLY — a document can take
 * tens of seconds, and making a picked image wait behind it (or vice versa)
 * would add that delay for no reason.
 */
export async function uploadEachFile(
  files: File[],
  sessionId?: string,
  onDocumentParsing?: (index: number) => void,
  onProgress?: (index: number, percent: number) => void,
): Promise<UploadOutcome[]> {
  // Documents take a different transport entirely — a different upload
  // endpoint, then a parse-and-index round-trip — so they are split out and
  // spliced back by position. Order is what lets each outcome find its row.
  const documentIndexes = new Set(
    files.map((file, index) => (isDocumentFile(file) ? index : -1)).filter((i) => i >= 0),
  );
  if (documentIndexes.size > 0) {
    const media = files.filter((_, index) => !documentIndexes.has(index));
    const documents = files.filter((_, index) => documentIndexes.has(index));
    const [mediaOutcomes, documentOutcomes] = await Promise.all([
      media.length ? uploadMediaFiles(media) : Promise.resolve([]),
      // Bounded like media (R10, M11-077): 13 unbounded register-and-poll cycles against the
      // parser left 6 CSVs failed or timed out.
      runWithConcurrency(documents, DOCUMENT_UPLOAD_CONCURRENCY, (file, position) => {
        // Reported against the caller's index, not this filtered one: the
        // store keys its rows off the original order, and handing back a
        // position from the documents-only slice would move the spinner
        // onto somebody else's chip.
        const original = [...documentIndexes].sort((a, b) => a - b)[position];
        return uploadDocumentFile(
          file,
          sessionId,
          () => {
            if (original !== undefined) onDocumentParsing?.(original);
          },
          (percent) => {
            if (original !== undefined) onProgress?.(original, percent);
          },
        );
      }).then((settled) =>
        settled.map((result): UploadOutcome => (result.ok ? result.value : result)),
      ),
    ]);
    let mediaCursor = 0;
    let documentCursor = 0;
    return files.map((_, index) =>
      documentIndexes.has(index)
        ? documentOutcomes[documentCursor++]
        : mediaOutcomes[mediaCursor++],
    );
  }
  return uploadMediaFiles(files);
}

/**
 * Upload, register and wait for one document.
 *
 * Waits here rather than resolving early so the attachment reaches "ready" only
 * when the agent can actually read it. The submit path already filters on that
 * status, so resolving before indexing finished would let a message be sent
 * with a document the agent cannot open — the failure the user is least able to
 * explain.
 */
async function uploadDocumentFile(
  file: File,
  sessionId?: string,
  onParsing?: () => void,
  onProgress?: (percent: number) => void,
): Promise<UploadOutcome> {
  try {
    // A row from an EARLIER register of this same file, IN THIS SAME SESSION,
    // may still be inside the Backend's own processing budget (see
    // documentAttachmentClient's inFlightDocuments doc-comment, 24/09/2026).
    // Re-uploading and re-registering would hash-match that row and detach a
    // second Process() goroutine racing the first — so a retry within that
    // window resumes the wait on the row it already has instead of starting a
    // new one. Scoped by sessionId (not just the file) because the register
    // call is also what asks the Backend to link the document to THIS
    // session (service.go's Attach() link() call) — recalling a different
    // session's row would skip that link entirely for this one.
    const recalledId = recallInFlightDocument(file, sessionId);
    let document: AttachmentDocument;
    if (recalledId) {
      onParsing?.();
      document = await waitForAttachmentDocument(recalledId);
    } else {
      const fileId = await uploadDocumentBytes(file, onProgress);
      document = await registerAttachmentDocument({
        fileId,
        sessionId,
        fileName: file.name,
      });
      trackInFlightDocument(file, document.id, sessionId);
      if (document.status !== "ready" && document.status !== "failed") {
        // The bytes are up; what is left is the Backend reading them, which for a
        // large file is the long half. Said out loud because it did not used to
        // be: the chip showed one undifferentiated spinner from the file picker
        // to the last segment, so a document being parsed and an upload that had
        // silently died looked exactly alike.
        onParsing?.();
        document = await waitForAttachmentDocument(document.id);
      }
    }
    if (document.status === "ready" || document.status === "failed") {
      clearInFlightDocument(file, sessionId);
    } else {
      // The wait above gave up while the row is still processing/queued — the
      // Backend never said failed, it just outlasted this poll. The entry
      // `trackInFlightDocument` wrote a few lines up (or the one this call just
      // recalled) has a TTL of `Date.now() + POLL_TIMEOUT_MS` computed BEFORE
      // `waitForAttachmentDocument` took its own `Date.now() + POLL_TIMEOUT_MS`
      // deadline moments later from the same call site — so that deadline is
      // always >= the entry's expiresAt, and the entry is already expired (or
      // expiring the same tick) the instant we get here. A user who retries
      // right after seeing the "still processing" copy — the exact scenario
      // finding #09 exists for — would find recallInFlightDocument returning
      // undefined and fall through to a brand-new upload+register, dispatching
      // the second Process() goroutine finding #09 was written to prevent.
      // Re-arming with a fresh TTL measured from NOW (after this wait ended,
      // not before it started) gives a retry the headroom it needs, and keeps
      // re-arming on every subsequent timeout for as long as the Backend keeps
      // the row genuinely in flight. 24/09/2026, blocker review of the #09
      // fix-up round 2.
      trackInFlightDocument(file, document.id, sessionId);
    }
    if (document.status !== "ready") {
      // The Backend says WHY in failure_code, and that was ignored here: every
      // outcome rendered as "scanned or protected files may not be supported",
      // which is true for three of the codes and an accusation for the rest.
      // See ./documentFailure.ts.
      //
      // A `failed` status is the Backend saying so; anything else here means the
      // POLL_TIMEOUT_MS wait above gave up while the row was still
      // `processing`/`queued` — the Backend never said failed, and per that
      // constant's own comment it may still finish minutes later with nobody
      // watching. Routing that through describeDocumentFailure(undefined) said
      // "did not finish processing" as if that were established; it is not.
      // 24/09/2026.
      const failure =
        document.status === "failed"
          ? describeDocumentFailure(document.failure_code)
          : describeDocumentTimeout();
      return {
        ok: false,
        error: new UploadRejectedError(
          { messageKey: failure.messageKey, params: { name: file.name } },
          undefined,
          document.status === "failed"
            ? document.failure_code?.trim().toUpperCase() || DOCUMENT_FAILED_CODE
            : DOCUMENT_TIMEOUT_CODE,
        ),
      };
    }
    return {
      ok: true,
      value: {
        // A document has no artifact and no displayable url; its identity is
        // the asset id, and the empty strings keep the shared shape rather
        // than forcing every consumer to branch.
        artifactId: "",
        url: "",
        documentAssetId: document.id,
        segmentUnit: document.segment_unit,
        segmentCount: document.segment_count,
        shortDescription: document.short_description,
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}

async function uploadMediaFiles(files: File[]): Promise<UploadOutcome[]> {
  if (UPLOAD_BATCH_ENABLED && !isBatchUploadUnsupported()) {
    const batched = await uploadInChunks(files);
    if (batched) return batched;
  }
  return runWithConcurrency(files, UPLOAD_FALLBACK_CONCURRENCY, (file) =>
    // Both images and videos upload through the CDP media artifacts endpoint
    // (POST /api/v1/media/artifacts), tagged as a user upload — and as a chat
    // attachment, so an unsent one never lands in the Library (BUG-AI-0668).
    withRetry(async () => {
      const uploaded = await uploadArtifactFile(file, "user_upload", CHAT_ATTACHMENT_PURPOSE);
      if (!uploaded) throw new Error("Upload failed: no artifact returned");
      return uploaded;
    }),
  );
}

/** Returns null when the endpoint turned out not to exist, so the caller falls
 *  back for the WHOLE pick rather than reporting rows that were never tried. */
async function uploadInChunks(files: File[]): Promise<UploadOutcome[] | null> {
  const outcomes: UploadOutcome[] = [];
  for (const chunk of chunkByBudget(files)) {
    let results: ArtifactUploadResult[];
    try {
      results = await withRetry(() => uploadArtifactFiles(chunk, "user_upload", CHAT_ATTACHMENT_PURPOSE));
    } catch (error) {
      if (isBatchUploadUnsupported()) return null;
      // A real failure for this chunk only: its rows report it, later chunks still
      // get their turn.
      outcomes.push(...chunk.map(() => ({ ok: false as const, error })));
      continue;
    }
    outcomes.push(
      ...results.map((result) =>
        result.ok
          ? { ok: true as const, value: { artifactId: result.artifactId, url: result.url } }
          : { ok: false as const, error: new UploadRejectedError(result.copy) },
      ),
    );
  }
  return outcomes;
}

/** A `failed` row the Backend gave no failure_code for. */
const DOCUMENT_FAILED_CODE = "DOCUMENT_FAILED";
/** The poll gave up while the row was still processing. */
const DOCUMENT_TIMEOUT_CODE = "DOCUMENT_TIMEOUT";

/**
 * The short code a failed row shows beside its reason, and the send confirmation lists.
 * The Backend's own code when it named one, else the HTTP status, else none.
 */
export function uploadFailureCode(error: unknown): string | undefined {
  if (error instanceof UploadRejectedError) {
    return error.code ?? (error.status ? `HTTP_${error.status}` : rejectionCode(error.copy));
  }
  if (error instanceof CdpApiError) {
    return error.code || (error.status ? `HTTP_${error.status}` : undefined);
  }
  if (isTimeout(error)) return "UPLOAD_TIMEOUT";
  return error instanceof TypeError ? "NETWORK" : undefined;
}

/** A bounded call that ran out (AbortSignal.timeout, B16). */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

/** A refusal made here, before any service answered: `uploads.tooLarge` → `TOO_LARGE`. */
function rejectionCode(copy: UploadCopy): string {
  return copy.messageKey
    .replace(/^uploads\./, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

/**
 * What a failed row says.
 *
 * A rejection carries translated copy (`uploads.*`), which is the whole
 * point of `UploadRejectedError`; anything else is a programming error whose
 * message is for the console, so it falls back to the generic sentence rather
 * than putting `TypeError: fetch failed` in the UI.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof UploadRejectedError) {
    return resolveUploadMessage(translateStatic, error.copy);
  }
  // The document path's SECOND hop throws CdpApiError, not UploadRejectedError:
  // registerAttachmentDocument goes through cdpFetch, which has no notion of
  // upload copy. Without this branch every failure of
  // POST /api/v1/attachment-documents fell through to the sentence below and
  // rendered as "The upload failed (error ). Please try again." — an empty code
  // in a message whose only content IS the code. The backend was naming the
  // fault all along (attachment_invalid, attachment_source_unavailable, …); the
  // chip simply threw it away.
  if (error instanceof CdpApiError) {
    console.error("[composerAttachments] upload failed", error.code, error.message, error);
    return resolveUploadMessage(
      translateStatic,
      mapUploadFailure(error.status, { code: error.code }),
    );
  }
  console.error("[composerAttachments] upload failed", error);
  // Said as what it is: a timeout or a dropped connection is not "the upload failed (error )".
  if (isTimeout(error)) {
    return resolveUploadMessage(translateStatic, { messageKey: "uploads.uploadTimeout", params: {} });
  }
  if (error instanceof TypeError) {
    return resolveUploadMessage(translateStatic, { messageKey: "uploads.network", params: {} });
  }
  return resolveUploadMessage(translateStatic, {
    messageKey: "uploads.failed",
    params: { status: "" },
  });
}

