import { translateStatic } from "@/hooks/useTranslate";
import { admitAttachments } from "@/lib/creative/attachmentAdmission";
import { mintMentionName, roleFromKind } from "@/lib/creative/attachmentRoles";
import { resolveUploadMessage } from "@/lib/uploads/limits";
import { notifyUploadFailures } from "@/lib/uploads/uploadFailureToast";
import { useToastStore } from "@/lib/stores/useToastStore";
import type {
  AttachmentKind,
  AttachmentStatus,
  ComposerAttachment,
} from "@/lib/stores/useComposerAttachmentStore";
import {
  archiveEntryCopy,
  expandArchive,
  type ArchiveExpansion,
  type ArchiveItem,
} from "./archiveAttachmentClient";
import { describeUploadError, uploadFailureCode } from "./composerUploadTransport";
import { describeDocumentFailure } from "./documentFailure";
import { isDocumentFile, waitForAttachmentDocument, type AttachmentDocument } from "./documentAttachmentClient";

/**
 * A composer .zip, from placeholder chip to ordinary chips (F1).
 *
 * One placeholder row holds the send while the Backend opens the archive. Then every entry
 * becomes the row it would have been had it been dropped on its own: a picture or clip is
 * ready, a document reads (`processing`) until its poll settles, and every entry the archive
 * could not add is a failed row named "<zip> › <path>" — which is what the existing send
 * confirmation ("send without the failed files", R10) lists. OS metadata is one toast.
 */

type Store = {
  set: (fn: (state: { attachments: ComposerAttachment[] }) => { attachments: ComposerAttachment[] }) => void;
  get: () => { attachments: ComposerAttachment[]; cap: number; roleCaps: unknown };
};

let counter = 0;
function rowId(): string {
  counter += 1;
  return `att_zip_${Date.now()}_${counter}`;
}

function live(list: ComposerAttachment[]): ComposerAttachment[] {
  return list.filter((item) => item.status !== "error");
}

function failedRow(fileName: string, error: string, errorCode?: string): ComposerAttachment {
  return {
    id: rowId(),
    fileName,
    kind: "document",
    role: "product",
    mentionName: mintMentionName("product", 1),
    isVideo: false,
    status: "error",
    error,
    errorCode,
  };
}

export function entryName(zip: string, path: string): string {
  return `${zip} › ${path}`;
}

/** What kind of chip an entry becomes, by the same rule a dropped file goes by. */
function kindOfItem(item: ArchiveItem): AttachmentKind {
  if (item.document || item.attach_error) return "document";
  const media = (item.media_type || item.mime_type || "").toLowerCase();
  if (media.startsWith("video")) return "video";
  if (media.startsWith("audio")) return "audio";
  if (media.startsWith("image")) return "image";
  return isDocumentFile(new File([], item.file_name)) ? "document" : "image";
}

export type ArchiveRows = {
  rows: ComposerAttachment[];
  /** Document rows still reading, by row id → document id. */
  reading: Map<string, string>;
  ignored: number;
};

/** The rows an expansion becomes, admitted against what the composer already holds. */
export function archiveRows(
  expansion: ArchiveExpansion,
  zipName: string,
  held: ComposerAttachment[],
  cap: number,
): ArchiveRows {
  const rows: ComposerAttachment[] = [];
  const reading = new Map<string, string>();
  const kinds = expansion.items.map(kindOfItem);
  // Admitted again here: a file picked while the archive was opening may have used a slot.
  const { admitted } = admitAttachments(
    live(held),
    kinds.map((kind) => ({ role: roleFromKind(kind) })),
    { cap, roleCaps: null },
  );
  const slotOf = new Map(admitted.map((slot) => [slot.index, slot]));
  expansion.items.forEach((item, index) => {
    const kind = kinds[index];
    const slot = slotOf.get(index);
    const name = item.file_name || item.path;
    if (!slot) {
      rows.push(
        failedRow(
          entryName(zipName, item.path),
          resolveUploadMessage(translateStatic, {
            messageKey: "uploads.tooManyAttachments",
            params: { limit: String(cap) },
          }),
          "TOO_MANY_ATTACHMENTS",
        ),
      );
      return;
    }
    const base = {
      id: rowId(),
      fileName: name,
      kind,
      role: slot.role,
      mentionName: slot.mentionName,
      isVideo: kind === "video",
    };
    if (kind !== "document") {
      rows.push({ ...base, status: "ready", artifactId: item.file_id, url: item.url });
      return;
    }
    const document = item.document;
    if (!document) {
      const failure = describeDocumentFailure(item.attach_error?.code);
      rows.push({
        ...base,
        fileName: entryName(zipName, item.path),
        status: "error",
        error: resolveUploadMessage(translateStatic, { messageKey: failure.messageKey, params: { name } }),
        errorCode: item.attach_error?.code?.toUpperCase() || "ATTACH_FAILED",
      });
      return;
    }
    const row = documentRow({ ...base, status: "processing" }, document, zipName, item.path);
    if (row.status === "processing") reading.set(row.id, document.id);
    rows.push(row);
  });
  for (const rejected of expansion.rejected) {
    rows.push(
      failedRow(
        entryName(zipName, rejected.path),
        resolveUploadMessage(translateStatic, archiveEntryCopy(rejected.code)),
        rejected.code.toUpperCase(),
      ),
    );
  }
  return { rows, reading, ignored: expansion.ignored.length };
}

/** A document row in the state its document is in. */
export function documentRow(
  row: ComposerAttachment,
  document: AttachmentDocument,
  zipName: string,
  path: string,
): ComposerAttachment {
  if (document.status === "ready") {
    return {
      ...row,
      status: "ready",
      documentAssetId: document.id,
      artifactId: "",
      url: "",
      segmentUnit: document.segment_unit,
      segmentCount: document.segment_count,
      shortDescription: document.short_description,
    };
  }
  if (document.status === "failed") {
    const failure = describeDocumentFailure(document.failure_code);
    return {
      ...row,
      fileName: entryName(zipName, path),
      status: "error",
      error: resolveUploadMessage(translateStatic, {
        messageKey: failure.messageKey,
        params: { name: row.fileName },
      }),
      errorCode: document.failure_code?.trim().toUpperCase() || "DOCUMENT_FAILED",
    };
  }
  return { ...row, status: "processing" as AttachmentStatus };
}

/** Open one archive into the composer: placeholder, expand, rows, then each document's poll. */
export async function expandArchiveIntoRows(
  archive: File,
  context: { sessionId?: string } & Store,
): Promise<void> {
  const { set, get } = context;
  if (get().roleCaps) {
    // The creative tabs take pictures and clips by role; a zip has no role to give them.
    const row = failedRow(
      archive.name,
      resolveUploadMessage(translateStatic, { messageKey: "uploads.archiveCreativeTab", params: {} }),
      "ARCHIVE_NOT_HERE",
    );
    set((state) => ({ attachments: [...state.attachments, row] }));
    notifyUploadFailures([archive.name]);
    return;
  }
  const placeholder: ComposerAttachment = {
    id: rowId(),
    fileName: archive.name,
    kind: "document",
    role: "product",
    mentionName: mintMentionName("product", 1),
    isVideo: false,
    status: "uploading",
  };
  const slots = Math.max(0, get().cap - live(get().attachments).length);
  set((state) => ({ attachments: [...state.attachments, placeholder] }));

  let expansion: ArchiveExpansion;
  try {
    expansion = await expandArchive(archive, {
      sessionId: context.sessionId,
      slots,
      onProgress: (percent) =>
        set((state) => ({
          attachments: state.attachments.map((item) =>
            item.id === placeholder.id && item.status === "uploading" ? { ...item, progress: percent } : item,
          ),
        })),
    });
  } catch (error) {
    set((state) => ({
      attachments: state.attachments.map((item) =>
        item.id === placeholder.id
          ? {
              ...item,
              status: "error" as AttachmentStatus,
              progress: undefined,
              error: describeUploadError(error),
              errorCode: uploadFailureCode(error),
            }
          : item,
      ),
    }));
    notifyUploadFailures([archive.name]);
    return;
  }

  // The person removed the placeholder while it opened: they no longer want these files.
  if (!get().attachments.some((item) => item.id === placeholder.id)) return;
  const held = get().attachments.filter((item) => item.id !== placeholder.id);
  const { rows, reading, ignored } = archiveRows(expansion, archive.name, held, get().cap);
  set((state) => ({
    attachments: [...state.attachments.filter((item) => item.id !== placeholder.id), ...rows],
  }));
  notifyUploadFailures(rows.filter((row) => row.status === "error").map((row) => row.fileName));
  if (ignored > 0) {
    useToastStore.getState().push(
      translateStatic("uploads.archiveIgnored")
        .replace("{count}", String(ignored))
        .replace("{name}", archive.name),
      "info",
      { key: `archive-ignored:${archive.name}` },
    );
  }

  const paths = new Map(expansion.items.map((item) => [item.file_name || item.path, item.path]));
  await Promise.all(
    [...reading].map(async ([id, documentId]) => {
      let settled: AttachmentDocument | undefined;
      try {
        settled = await waitForAttachmentDocument(documentId);
      } catch (error) {
        set((state) => ({
          attachments: state.attachments.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error" as AttachmentStatus,
                  error: describeUploadError(error),
                  errorCode: uploadFailureCode(error),
                }
              : item,
          ),
        }));
        return;
      }
      set((state) => ({
        attachments: state.attachments.map((item) => {
          if (item.id !== id) return item;
          if (settled!.status === "ready" || settled!.status === "failed") {
            return documentRow(item, settled!, archive.name, paths.get(item.fileName) ?? item.fileName);
          }
          // The poll gave up while the Backend is still reading (describeDocumentTimeout).
          return {
            ...item,
            status: "error" as AttachmentStatus,
            error: resolveUploadMessage(translateStatic, {
              messageKey: "uploads.documentStillProcessing",
              params: { name: item.fileName },
            }),
            errorCode: "DOCUMENT_TIMEOUT",
          };
        }),
      }));
    }),
  );
}
