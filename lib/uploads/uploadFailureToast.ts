import { translateStatic } from "@/hooks/useTranslate";
import { useToastStore } from "@/lib/stores/useToastStore";
import { reasonWithoutName } from "@/lib/uploads/uploadFailureText";

/** Names beyond this are folded into one "N files" toast instead of a stack of them. */
const MAX_NAMED_TOASTS = 2;

/** Long enough to read a file name; the tile keeps the reason on screen after it goes. */
const TOAST_MS = 7000;

/**
 * The floating "Unable to upload <file>" notice, raised beside the failed tile.
 *
 * The tile in the composer already carries the reason, but it sits in the corner
 * the reader is not looking at once they have dropped the file and moved on. This
 * is the part that says "something just failed" where the eye already is.
 *
 * One toast per file up to {@link MAX_NAMED_TOASTS}, then a single count: dropping
 * twenty broken files must not paint twenty banners over the page. Keyed by name,
 * so retrying the same file replaces its toast rather than stacking another.
 */
export function notifyUploadFailures(
  fileNames: readonly string[],
  /** Why, per file name: a second line for a refusal that has no tile to carry it. */
  reasons?: Readonly<Record<string, string>>,
): void {
  const names = fileNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return;
  const push = useToastStore.getState().push;
  if (names.length <= MAX_NAMED_TOASTS) {
    for (const name of names) {
      const head = translateStatic("uploads.failedToast").replace("{name}", name);
      const reason = reasonWithoutName(reasons?.[name], name);
      push(reason ? `${head}\n${reason}` : head, "error", {
        key: `upload-failed:${name}`,
        durationMs: TOAST_MS,
      });
    }
    return;
  }
  push(translateStatic("uploads.failedToastMany").replace("{count}", String(names.length)), "error", {
    key: "upload-failed:many",
    durationMs: TOAST_MS,
  });
}
