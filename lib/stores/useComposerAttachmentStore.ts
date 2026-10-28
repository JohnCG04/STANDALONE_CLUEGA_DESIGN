import { create } from "zustand";

import { trackEvent } from "@/lib/analytics/productEvents";
import type { AssetRef, AssetSource } from "@/lib/creative/assetRef";
import { admitAttachments } from "@/lib/creative/attachmentAdmission";
import {
  mintMentionName,
  roleFromKind,
  type AttachmentRole,
  type RoleCaps,
} from "@/lib/creative/attachmentRoles";
import {
  UPLOAD_BATCH_ENABLED,
  UPLOAD_FALLBACK_CONCURRENCY,
  chunkByBudget,
  runWithConcurrency,
  withRetry,
  type SettledResult,
} from "@/lib/uploads/batching";
import {
  UploadRejectedError,
  isArchiveFile,
  preflightUpload,
  resolveUploadMessage,
} from "@/lib/uploads/limits";
import { expandArchiveIntoRows } from "@/lib/attachments/archiveRows";
import {
  describeUploadError,
  uploadEachFile,
  uploadFailureCode,
} from "@/lib/attachments/composerUploadTransport";
import { isDocumentFile } from "@/lib/attachments/documentAttachmentClient";
import {
  droppedRecord,
  failedAttachments,
  type DroppedAttachment,
} from "@/lib/attachments/failedAttachments";
import { translateStatic } from "@/hooks/useTranslate";
import {
  isBatchUploadUnsupported,
  uploadArtifactFile,
  uploadArtifactFiles,
  type ArtifactUploadResult,
} from "@/resources/app/pages/app/components/Conversation/components/MediaAddonPanel/components/ImageCanvasEditor/mediaImageClient";

// Video is detected by file extension (per product requirement) with a MIME
// fallback. Anything not matching is treated as an image.
const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "mpeg",
  "mpg",
  "3gp",
  "ogv",
];

function hasVideoExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac"];

function hasAudioExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return hasVideoExtension(file.name);
}

/** What kind of attachment a file becomes. Exported so the drop path can
 *  measure a pick against the same document-vs-media rule `upload` applies —
 *  the cap depends on it, and a second classifier would disagree. */
export function attachmentKind(file: File): AttachmentKind {
  if (isVideoFile(file)) return "video";
  if (file.type.startsWith("audio/") || hasAudioExtension(file.name)) {
    return "audio";
  }
  // Documents are checked BEFORE the image fallback. That fallback is why a
  // PDF used to become an attachment of kind "image": it was uploaded as
  // media, rendered as a broken <img>, and never parsed.
  if (isDocumentFile(file)) return "document";
  return "image";
}

// Composer accepts at most this many attachments at once — images and
// documents counted together. The creative module raises it per tab at runtime
// via `setCap`; every other surface keeps this. Defined in `lib/uploads/limits`
// with the other upload limits and re-exported here, so a pure-logic caller can
// read the number without pulling in the store and the React tree behind it.
export { MAX_ATTACHMENTS } from "@/lib/uploads/limits";
import { MAX_ATTACHMENTS } from "@/lib/uploads/limits";
import { inspectUploadContent } from "@/lib/uploads/contentCheck";
import { notifyUploadFailures } from "@/lib/uploads/uploadFailureToast";

export type AttachmentStatus = "uploading" | "processing" | "ready" | "error";

/**
 * Whether this attachment is still on its way and must hold the submit.
 *
 * A predicate rather than a comparison at each call site, because the set grew:
 * "uploading" used to mean the whole journey, and when the Backend's parse phase
 * got its own status every `=== "uploading"` gate silently stopped covering it.
 * A message sent mid-parse carries a document the agent cannot open — the
 * failure a user is least able to explain.
 */
export function isAttachmentInFlight(status: AttachmentStatus): boolean {
  return status === "uploading" || status === "processing";
}

/** What the file is. `isVideo` stays alongside it because the submit path and
 *  the downstream `MessageAttachment` / `ChatAttachment.media_type` types are
 *  still binary image-or-video; audio only reaches the composer's own chips
 *  until the backend confirms it accepts an audio material. A document is
 *  neither: it never becomes pixels, and the agent reaches it by id. */
export type AttachmentKind = "image" | "video" | "audio" | "document";

export type ComposerAttachment = {
  // Local id — the upload has no server id until it resolves, so pills key off this.
  id: string;
  fileName: string;
  kind: AttachmentKind;
  /** What the generator should DO with it (PRD: product images preserve the
   *  subject, the reference video contributes style only). Stored rather than
   *  derived: a role is an intent, and no MIME check can express it — a cover
   *  still can stand in for a reference video when no footage is reachable. */
  role: AttachmentRole;
  /** The `@name` token for this asset, also its chip label. */
  mentionName: string;
  isVideo: boolean;
  status: AttachmentStatus;
  /** Bytes sent so far, 0–100, while `uploading` (B16). Absent when the transport cannot tell. */
  progress?: number;
  // Populated once the /artifacts upload resolves.
  artifactId?: string;
  url?: string;
  error?: string;
  /** Why it failed, as the service named it (`INDEX_UNAVAILABLE`), when it named anything. */
  errorCode?: string;
  // Where the attachment came from (PRD Screen 2-6 pickers). Local uploads
  // leave it unset; remote adds carry it for asset_add tracking + handoff.
  source?: AssetSource;
  assetRef?: AssetRef;
  /** Set once the Backend has parsed and indexed a document attachment. It is
   *  what the chat request carries, and what the agent's tools address. */
  documentAssetId?: string;
  /**
   * Set ONLY on a pick from the user's own granted folder. The bytes are on
   * their disk, so there is no url and no artifactId to carry — `relPath` is
   * resolved against the folder handle this tab holds and means nothing
   * anywhere else, which is what keeps a filesystem path off the wire.
   */
  localRef?: { relPath: string; mime: string; sizeBytes: number };
  /** Manifest facts, shown on the chip so the user can see what the agent got. */
  segmentUnit?: string;
  segmentCount?: number;
  shortDescription?: string;
};

export type RemoteAttachmentInput = {
  url: string;
  fileName: string;
  isVideo: boolean;
  source: AssetSource;
  artifactId?: string;
  meta?: AssetRef["meta"];
  /** What the asset is FOR. Omitted → derived from `isVideo` (the pre-role
   *  behaviour). A trend pick MUST set it: its url is a cover image. */
  role?: AttachmentRole;
};

/** One file picked out of the folder the user lent this tab. */
export type LocalFolderAttachmentInput = {
  /** Where it sits inside the granted folder — the only handle on the bytes. */
  relPath: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  isVideo: boolean;
  role?: AttachmentRole;
};


/**
 * The longest a row may stay `uploading` (B16). Above the transport's own bounds (stall 60 s,
 * then 300 s for the answer, one 401 retry), so this only fires when something below them
 * never settled; it turns the row into an error so the send is no longer held behind it.
 */
export const UPLOAD_ROW_CEILING_MS = 12 * 60_000;

/** Rows of `ids` still `uploading` become UPLOAD_TIMEOUT errors. */
export function expireStuckUploads(list: ComposerAttachment[], ids: ReadonlySet<string>): ComposerAttachment[] {
  return list.map((item) =>
    ids.has(item.id) && item.status === "uploading"
      ? {
          ...item,
          status: "error" as AttachmentStatus,
          progress: undefined,
          error: resolveUploadMessage(translateStatic, { messageKey: "uploads.uploadTimeout", params: {} }),
          errorCode: "UPLOAD_TIMEOUT",
        }
      : item,
  );
}

/** The rows that count toward the cap and the dedupe: everything that did not fail. */
function liveAttachments(list: ComposerAttachment[]): ComposerAttachment[] {
  return list.filter((item) => item.status !== "error");
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `att_${Date.now()}_${idCounter}`;
}

interface ComposerAttachmentState {
  attachments: ComposerAttachment[];
  /** How many attachments the CURRENT surface accepts. Defaults to
   *  MAX_ATTACHMENTS; the creative module raises it per tab and restores it on
   *  the way out, so chat and every other composer keep today's limit. */
  cap: number;
  setCap: (cap: number) => void;
  /** Per-role budget on top of `cap` (PRD: 9 product images / 1 reference video
   *  / 1 audio). `null` — the default — means role budgets are not in play, so
   *  chat, the canvas and workflow surfaces behave exactly as before: chat's
   *  "any 2 combined" limit cannot be expressed as per-role numbers. */
  roleCaps: RoleCaps | null;
  setRoleCaps: (caps: RoleCaps | null) => void;
  // Add local files; each is inserted immediately in the "uploading" state so
  // the composer can render a loading pill, then flipped to "ready"/"error".
  // `role` overrides the kind-derived default (the "+" menu knows which slot the
  // user opened).
  upload: (
    files: FileList | File[],
    opts?: { role?: AttachmentRole; sessionId?: string },
  ) => Promise<void>;
  // Add server-side assets picked from a library/trend/template modal. No
  // upload round-trip — entries land directly in "ready". Same cap as upload;
  // duplicates (same url or artifactId) are silently skipped. Returns how many
  // actually landed so the picker can size its confirm feedback.
  addRemote: (items: RemoteAttachmentInput[]) => number;
  // Add files from the folder the user granted this tab. No upload and no url:
  // the bytes stay on their disk until a browser run asks for them through the
  // extension bridge. Same cap and same admission rules as addRemote; dedupe is
  // on relPath, the only identity such a file has.
  addLocalFolder: (items: LocalFolderAttachmentInput[]) => number;
  remove: (id: string) => void;
  /** The failed files this turn goes without, after the sender confirmed it. Read by the
   *  prompt engine at submit, like the rows; emptied by `clear`. */
  dropped: DroppedAttachment[];
  /** Moves every failed row into `dropped`: the one way a failed file leaves the composer. */
  dropFailed: () => void;
  clear: () => void;
}

export const useComposerAttachmentStore = create<ComposerAttachmentState>(
  (set, get) => ({
    attachments: [],
    dropped: [],
    cap: MAX_ATTACHMENTS,
    roleCaps: null,

    setCap: (cap) => set({ cap: Math.max(1, cap) }),
    setRoleCaps: (roleCaps) => set({ roleCaps }),

    upload: async (chosen, opts) => {
      // A .zip is opened by the Backend into ordinary chips, not uploaded as a file (F1). Taken
      // out BEFORE preflight, which refuses zips on purpose: every other picker shares it.
      const all = Array.from(chosen);
      const files = all.filter((file) => !isArchiveFile(file));
      const archiveRuns = all
        .filter(isArchiveFile)
        .map((archive) => expandArchiveIntoRows(archive, { sessionId: opts?.sessionId, set, get }));
      const filesRun = (async () => {
        // A failed row stays until the sender removes it or confirms sending without it (R10):
        // clearing it here dropped the file from the turn with no word. It never counts toward
        // the cap, so a flaky backend still cannot wedge the limit. A re-pick of the same name
        // is the retry, and replaces its failed row.
        const picked = new Set(Array.from(files, (file) => file.name));
        const retried = get().attachments.filter(
          (item) => item.status === "error" && picked.has(item.fileName),
        );
        if (retried.length) {
          const gone = new Set(retried.map((item) => item.id));
          set({ attachments: get().attachments.filter((item) => !gone.has(item.id)) });
        }
        const kept = liveAttachments(get().attachments);

        // Size/MIME check BEFORE any bytes leave the browser: the upload service
        // answers 413/415 only once the whole body has arrived, which for a
        // reference clip is minutes of upload followed by a generic failure.
        const failures: ComposerAttachment[] = [];
        const candidates: { file: File; role: AttachmentRole; kind: AttachmentKind }[] = [];
        for (const file of Array.from(files)) {
          const kind = attachmentKind(file);
          const role = opts?.role ?? roleFromKind(kind);
          // Type/size first (free), then the bytes themselves: a file whose content is not what
          // its name says is refused here, before it travels.
          const failure = preflightUpload(file) ?? (await inspectUploadContent(file));
          if (failure) {
            failures.push({
              id: nextId(),
              fileName: file.name,
              kind,
              role,
              mentionName: mintMentionName(role, 1),
              isVideo: kind === "video",
              status: "error",
              error: resolveUploadMessage(translateStatic, failure),
              errorCode: failure.code.toUpperCase(),
            });
            continue;
          }
          candidates.push({ file, role, kind });
        }

        // One cap for every kind. It used to be raised here when a document was
        // in the pick, which meant the ceiling depended on what you had already
        // attached and the + button — reading the unraised cap — disagreed with
        // what this line would admit.
        const { admitted, evictedIds } = admitAttachments(kept, candidates, {
          cap: get().cap,
          roleCaps: get().roleCaps,
        });
        const evicted = new Set(evictedIds);

        // Every candidate the cap turned away, said out loud.
        //
        // They used to vanish. M01-002, 11-09-2026: fourteen files dragged in,
        // ten chips appeared, and CL-010 / CL-011 / CL-012 were gone with no
        // message anywhere — so the turn ran on nine clients' data while the
        // person believed it had twelve. A silent drop is worse than a refusal,
        // because a refusal can be answered.
        //
        // Rendered through the same failure row a rejected type uses, so there is
        // one place a reader looks for "what happened to my file".
        const admittedIndexes = new Set(admitted.map((slot) => slot.index));
        for (let index = 0; index < candidates.length; index += 1) {
          if (admittedIndexes.has(index)) continue;
          const { file, role, kind } = candidates[index];
          failures.push({
            id: nextId(),
            fileName: file.name,
            kind,
            role,
            mentionName: mintMentionName(role, 1),
            isVideo: kind === "video",
            status: "error",
            error: resolveUploadMessage(translateStatic, {
              messageKey: "uploads.tooManyAttachments",
              params: { limit: String(get().cap) },
            }),
            errorCode: "TOO_MANY_ATTACHMENTS",
          });
        }

        const list: File[] = [];
        const pending: ComposerAttachment[] = admitted.map((slot) => {
          const { file, kind } = candidates[slot.index];
          list.push(file);
          return {
            id: nextId(),
            fileName: file.name,
            kind,
            role: slot.role,
            mentionName: slot.mentionName,
            isVideo: kind === "video",
            status: "uploading" as AttachmentStatus,
          };
        });

        if (pending.length === 0 && failures.length === 0) return;
        set((state) => ({
          attachments: [
            ...state.attachments.filter((item) => !evicted.has(item.id)),
            ...pending,
            ...failures,
          ],
        }));
        // Refused before a byte left the browser (type, size, cap): say so now, beside the tile.
        notifyUploadFailures(failures.map((row) => row.fileName));
        if (list.length === 0) return;

        // Bounded, retried, and settled per item. A whole tab budget (9 product
        // images) used to leave as 9 simultaneous multipart bodies with no retry,
        // so one transient 502 permanently failed a row whose siblings landed.
        // Order is preserved, which is what lets each outcome find its row.
        // Per-row watchdog: whatever happens below, no row is left `uploading` forever (B16).
        const pendingIds = new Set(pending.map((item) => item.id));
        const watchdog = setTimeout(() => {
          set((state) => ({ attachments: expireStuckUploads(state.attachments, pendingIds) }));
        }, UPLOAD_ROW_CEILING_MS);
        const outcomes = await uploadEachFile(
          list,
          opts?.sessionId,
          (index) => {
            const row = pending[index];
            if (!row) return;
            set((state) => ({
              attachments: state.attachments.map((item) =>
                item.id === row.id && item.status === "uploading"
                  ? { ...item, status: "processing" as AttachmentStatus, progress: undefined }
                  : item,
              ),
            }));
          },
          (index, percent) => {
            const row = pending[index];
            if (!row) return;
            set((state) => ({
              attachments: state.attachments.map((item) =>
                item.id === row.id && item.status === "uploading" ? { ...item, progress: percent } : item,
              ),
            }));
          },
        ).finally(() => clearTimeout(watchdog));
        set((state) => ({
          attachments: state.attachments.map((item) => {
            const index = pending.findIndex((row) => row.id === item.id);
            const outcome = index >= 0 ? outcomes[index] : undefined;
            if (!outcome) return item;
            return outcome.ok
              ? {
                  ...item,
                  status: "ready" as AttachmentStatus,
                  progress: undefined,
                  artifactId: outcome.value.artifactId,
                  url: outcome.value.url,
                  documentAssetId: outcome.value.documentAssetId,
                  segmentUnit: outcome.value.segmentUnit,
                  segmentCount: outcome.value.segmentCount,
                  shortDescription: outcome.value.shortDescription,
                }
              : {
                  ...item,
                  status: "error" as AttachmentStatus,
                  progress: undefined,
                  error: describeUploadError(outcome.error),
                  errorCode: uploadFailureCode(outcome.error),
                };
          }),
        }));

        // Refused or broken after the bytes travelled (server said no, or the file is unreadable).
        notifyUploadFailures(
          pending.filter((_, index) => outcomes[index] && !outcomes[index].ok).map((row) => row.fileName),
        );

        // PRD 8.2 `asset_add`: only uploads that actually landed count.
        const succeeded = get().attachments.filter(
          (item) => pendingIds.has(item.id) && item.status === "ready",
        ).length;
        if (succeeded > 0) {
          trackEvent("asset_add", { source: "upload", count: succeeded });
        }
      })();
      await Promise.all([filesRun, ...archiveRuns]);
    },

    addRemote: (items) => {
      const kept = liveAttachments(get().attachments);

      const seen = new Set(
        kept.flatMap((item) => [item.url, item.artifactId].filter(Boolean)),
      );
      // Dedupe first, then run the same admission rules as `upload` so a picker
      // and a file drop cannot disagree about the budget.
      const fresh = items.filter((item) => {
        if (seen.has(item.url) || (item.artifactId && seen.has(item.artifactId))) {
          return false;
        }
        seen.add(item.url);
        if (item.artifactId) seen.add(item.artifactId);
        return true;
      });
      const roleOf = (item: RemoteAttachmentInput): AttachmentRole =>
        item.role ?? (item.isVideo ? "referenceVideo" : "product");
      const { admitted, evictedIds } = admitAttachments(
        kept,
        fresh.map((item) => ({ role: roleOf(item) })),
        { cap: get().cap, roleCaps: get().roleCaps },
      );
      const evicted = new Set(evictedIds);

      const added: ComposerAttachment[] = [];
      const bySource = new Map<AssetSource, number>();
      for (const slot of admitted) {
        const item = fresh[slot.index];
        const attachment: ComposerAttachment = {
          id: nextId(),
          fileName: item.fileName,
          // A trend pick is an IMAGE (the post's cover) in the referenceVideo
          // role, so kind follows the media while role follows the intent.
          kind: item.isVideo ? "video" : "image",
          role: slot.role,
          mentionName: slot.mentionName,
          isVideo: item.isVideo,
          status: "ready",
          artifactId: item.artifactId,
          url: item.url,
          source: item.source,
          assetRef: {
            source: item.source,
            id: item.artifactId,
            url: item.url,
            meta: item.meta ?? {
              mediaType: item.isVideo ? "video" : "image",
              title: item.fileName,
            },
          },
        };
        added.push(attachment);
        bySource.set(item.source, (bySource.get(item.source) ?? 0) + 1);
      }

      if (added.length > 0 || evicted.size > 0) {
        set((state) => ({
          attachments: [
            ...state.attachments.filter((item) => !evicted.has(item.id)),
            ...added,
          ],
        }));
        // PRD 8.2 asset_add — one event per source so the funnel can tell the
        // pickers apart (library/trend/template/...).
        for (const [source, count] of bySource) {
          trackEvent("asset_add", { source, count });
        }
      }

      return added.length;
    },

    addLocalFolder: (items) => {
      const kept = liveAttachments(get().attachments);

      const seen = new Set(
        kept
          .map((item) => item.localRef?.relPath)
          .filter((path): path is string => Boolean(path)),
      );
      const fresh = items.filter((item) => {
        if (seen.has(item.relPath)) return false;
        seen.add(item.relPath);
        return true;
      });
      const roleOf = (item: LocalFolderAttachmentInput): AttachmentRole =>
        item.role ?? (item.isVideo ? "referenceVideo" : "product");
      const { admitted, evictedIds } = admitAttachments(
        kept,
        fresh.map((item) => ({ role: roleOf(item) })),
        { cap: get().cap, roleCaps: get().roleCaps },
      );
      const evicted = new Set(evictedIds);

      const added: ComposerAttachment[] = [];
      for (const slot of admitted) {
        const item = fresh[slot.index];
        added.push({
          id: nextId(),
          fileName: item.fileName,
          kind: item.isVideo ? "video" : "image",
          role: slot.role,
          mentionName: slot.mentionName,
          isVideo: item.isVideo,
          // Nothing is in flight — the file is already on the user's machine —
          // so the composer must not hold the submit waiting for an upload.
          status: "ready",
          source: "local",
          localRef: {
            relPath: item.relPath,
            mime: item.mime,
            sizeBytes: item.sizeBytes,
          },
        });
      }

      if (added.length > 0 || evicted.size > 0) {
        set((state) => ({
          attachments: [
            ...state.attachments.filter((item) => !evicted.has(item.id)),
            ...added,
          ],
        }));
      }
      if (added.length > 0) {
        trackEvent("asset_add", { source: "local", count: added.length });
      }

      return added.length;
    },

    remove: (id) =>
      set((state) => ({
        attachments: state.attachments.filter((item) => item.id !== id),
      })),

    dropFailed: () =>
      set((state) => ({
        attachments: state.attachments.filter((item) => item.status !== "error"),
        dropped: droppedRecord(failedAttachments(state.attachments)),
      })),

    clear: () => set({ attachments: [], dropped: [] }),
  }),
);
