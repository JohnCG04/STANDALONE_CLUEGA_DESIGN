/**
 * What to tell someone whose document did not become readable.
 *
 * Every outcome used to render as one sentence: "could not be read. Scanned or
 * protected files may not be supported." It is true for exactly one of the
 * codes below and wrong — and unfair — for the rest. Measured on a real
 * ten-file upload: two documents failed with INDEX_UNAVAILABLE, an embedding
 * service rate limit that had nothing to do with either file, and both users
 * were told their file was scanned or protected. The advice that follows from
 * that message is to go find a better copy of a file that was already fine.
 *
 * Three kinds of failure, and they call for three different actions:
 *   - ours, and temporary        -> try again
 *   - ours, and not temporary    -> tell someone, do not retry
 *   - the file's                 -> the current message, where it is true
 *
 * Kept as data rather than branches so the split is readable, and so a code
 * nobody has mapped falls into a safe generic rather than borrowing the
 * scanned-or-protected sentence by accident.
 */

/** Failure codes the Backend reports on an attachment document. */
export const RETRYABLE_FAILURES: ReadonlySet<string> = new Set([
  // The embedding/index service was unreachable, overloaded, or rate-limiting.
  // Nothing about the document is wrong; the same bytes succeed a minute later.
  "INDEX_UNAVAILABLE",
  // The reader service was up but could not answer in time.
  "SOURCE_ADAPTER_TIMEOUT",
  // The stored bytes could not be fetched back for reading.
  "SOURCE_BLOB_UNAVAILABLE",
]);

export const DEPLOYMENT_FAILURES: ReadonlySet<string> = new Set([
  // This deployment has no document reader wired up. Retrying cannot fix it and
  // the file is not at fault — saying "scanned or protected" here sends the
  // user to solve a problem that is not theirs.
  "DOCUMENT_PARSER_UNAVAILABLE",
]);

export const UNSUPPORTED_FAILURES: ReadonlySet<string> = new Set([
  "UNSUPPORTED_FORMAT",
]);

/** A scan (no text layer) the deployment cannot OCR (B18). Deterministic, so never "try
 *  later", and the file is not damaged, so never "unreadable": it is a scan we cannot read. */
export const SCAN_FAILURES: ReadonlySet<string> = new Set(["SCAN_UNREADABLE"]);

/** The only codes for which "scanned or protected" is an honest thing to say. */
export const FILE_FAILURES: ReadonlySet<string> = new Set([
  // The reader opened it and found no text layer — a scan, an image-only deck.
  "SOURCE_EMPTY_CONTENT",
  // The reader opened it and the content was not what the extension claimed.
  "SOURCE_INVALID_DOCUMENT",
  // The reader failed on this specific file's structure.
  "DOCUMENT_PARSE_ERROR",
]);

export type DocumentFailure = {
  /** i18n key under `uploads.*`. */
  messageKey: string;
  /** Whether attaching the same file again is worth doing. */
  retryable: boolean;
};

export function describeDocumentFailure(code: string | undefined): DocumentFailure {
  const failure = (code || "").trim().toUpperCase();

  if (RETRYABLE_FAILURES.has(failure)) {
    return { messageKey: "uploads.documentIndexUnavailable", retryable: true };
  }
  if (DEPLOYMENT_FAILURES.has(failure)) {
    return { messageKey: "uploads.documentReaderUnavailable", retryable: false };
  }
  if (SCAN_FAILURES.has(failure)) {
    return { messageKey: "uploads.documentScanUnavailable", retryable: false };
  }
  if (UNSUPPORTED_FAILURES.has(failure)) {
    return { messageKey: "uploads.documentUnsupported", retryable: false };
  }
  if (FILE_FAILURES.has(failure)) {
    return { messageKey: "uploads.documentUnreadable", retryable: false };
  }
  // An unmapped or absent code. Deliberately NOT the scanned-or-protected
  // sentence: that one makes a claim about the file, and we do not have one to
  // make. This says what is known — it did not finish — and nothing more.
  return { messageKey: "uploads.documentFailed", retryable: true };
}

/**
 * What to tell someone whose document was still `processing`/`queued` when the
 * poll gave up.
 *
 * Deliberately not routed through `describeDocumentFailure`: that table answers
 * "the Backend told us it failed, for this reason", and a poll timeout is not
 * that — the Backend never said failed, and per POLL_TIMEOUT_MS's own comment
 * in documentAttachmentClient.ts it may still finish minutes later with nobody
 * watching. Collapsing the two meant a document the Backend was still
 * legitimately working on got the same "did not finish processing" sentence as
 * one it had actually given up on, discarding exactly the "still working"
 * distinction waitForAttachmentDocument's docstring says a timeout preserves.
 * 24/09/2026.
 */
export function describeDocumentTimeout(): DocumentFailure {
  return { messageKey: "uploads.documentStillProcessing", retryable: true };
}
