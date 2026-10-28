import type { ComposerAttachment } from "@/lib/stores/useComposerAttachmentStore";

/**
 * R10 (M11-077): a file that failed to upload is never dropped without the sender saying so.
 *
 * Thirteen CSVs were picked, six failed, Send stayed live and the turn went with seven: the
 * submit path kept only `ready` rows. Now Send asks once, and the files it leaves out are kept
 * on the user's turn as data (never in the prompt: the agent reads intent and language there).
 */

export type FailedAttachment = { id: string; fileName: string; code?: string; reason?: string };

export function failedAttachments(list: readonly ComposerAttachment[]): FailedAttachment[] {
  return list
    .filter((item) => item.status === "error")
    .map((item) => ({
      id: item.id,
      fileName: item.fileName,
      code: item.errorCode,
      reason: item.error,
    }));
}

/** What a submit may do with the composer as it stands. */
export type SendGate = "send" | "hold" | "confirmDrop";

export function sendGate(
  list: readonly ComposerAttachment[],
  inFlight: (status: ComposerAttachment["status"]) => boolean,
  dropConfirmed: boolean,
): SendGate {
  if (list.some((item) => inFlight(item.status))) return "hold";
  if (!dropConfirmed && list.some((item) => item.status === "error")) return "confirmDrop";
  return "send";
}

/** One file the sender chose to send without, as the user turn records it. */
export type DroppedAttachment = { name: string; code?: string };

export function droppedRecord(failed: readonly FailedAttachment[]): DroppedAttachment[] {
  return failed.map((f) => (f.code ? { name: f.fileName, code: f.code } : { name: f.fileName }));
}

/** "Đã bỏ 2 tệp lỗi: a.csv, b.csv", the muted line under the user's bubble. */
export function droppedLine(
  t: (key: string) => string,
  dropped: readonly DroppedAttachment[],
): string {
  const copy =
    dropped.length === 1
      ? t("appChat.chatComposer.attachments.dropFailed.droppedOne")
      : t("appChat.chatComposer.attachments.dropFailed.droppedOther");
  return copy
    .replace("{count}", String(dropped.length))
    .replace("{files}", dropped.map((d) => d.name).join(", "));
}
