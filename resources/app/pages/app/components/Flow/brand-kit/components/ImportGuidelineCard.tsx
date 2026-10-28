"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, FileUp } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { useDragFileTarget } from "@/hooks/useDragFileTarget";
import { FLOW_BRANDS_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import { inspectUploadContent } from "@/lib/uploads/contentCheck";
import { dragCarriesFiles, filesFromDrop, resolveUploadMessage } from "@/lib/uploads/limits";
import { importBrandDocument } from "@/lib/media/brandKit";
import type { BrandDocumentImport } from "@/lib/media/brandKit";

import { describeDocumentImportError } from "../helpers";
import { useEstimatedProgress } from "../hooks/useEstimatedProgress";

/** What the service accepts. Its own list, not the composer's wider one. */
const ACCEPT = ".docx,.pdf";

/**
 * The service's own ceiling, restated so the file is refused here rather than
 * after it has been uploaded. It is smaller than `MAX_DOCUMENT_UPLOAD_BYTES`
 * (50 MiB) because reading a guideline costs a model call, not just storage.
 */
const MAX_BYTES = 15_000_000;

/**
 * The tile that turns a brand guideline into a brand.
 *
 * A full-width drop zone above the user's own kits: the three ways to start a
 * kit — blank, from a sample, from your own guideline — are one choice, and a
 * file input hidden behind a "more" menu would make the third the one nobody
 * finds.
 *
 * EXTENSION, NOT MIME. Browsers report nothing, or `application/octet-stream`,
 * for a .docx often enough that gating on `file.type` rejects real uploads —
 * the same reason `isDocumentFile` in `lib/attachments` checks the name. The
 * service decides from the bytes and answers 415, which is the real gate.
 */
export const ImportGuidelineCard = ({
  onImported,
}: {
  onImported: (result: BrandDocumentImport) => void;
}) => {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const progress = useEstimatedProgress();
  const { isDragging, dragHandlers, endDrag } = useDragFileTarget();

  const accepted = (file: File) =>
    ACCEPT.split(",").some((ext) => file.name.toLowerCase().endsWith(ext));

  const send = async (file: File) => {
    setError(null);
    if (!accepted(file)) {
      setError(t("appChat.brandKit.error.unsupportedDocument"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        t("appChat.brandKit.error.documentTooLarge").replace(
          "{max}",
          `${Math.floor(MAX_BYTES / 1_000_000)} MB`,
        ),
      );
      return;
    }
    // A .docx/.pptx is a ZIP: junk or a renamed PDF is refused here, not after the service
    // has been asked to read it (and billed for the reading).
    const unsound = await inspectUploadContent(file);
    if (unsound) {
      setError(resolveUploadMessage(t, unsound));
      return;
    }
    setReading(true);
    setFileName(file.name);
    progress.start();
    try {
      const result = await importBrandDocument(file);
      // The list is cached for BRANDS_STALE_MS, so without this the brand just
      // created is missing when the user comes back from its detail page.
      void queryClient.invalidateQueries({ queryKey: FLOW_BRANDS_QUERY_KEY });
      // Full before the hand-off: the parent navigates away on this, and the
      // bar should not be caught at 95% on the way out.
      progress.finish();
      onImported(result);
    } catch (cause) {
      progress.reset();
      setError(describeDocumentImportError(cause, t, MAX_BYTES));
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={reading}
        onClick={() => inputRef.current?.click()}
        {...dragHandlers}
        onDrop={(event) => {
          endDrag();
          if (!dragCarriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          const [file] = filesFromDrop(event.dataTransfer);
          if (file) void send(file);
        }}
        className={`flex min-h-[214px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-center transition-colors disabled:cursor-wait ${
          isDragging
            ? "border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30"
            : "border-neutral-300 hover:border-blue-400 hover:bg-blue-50/40 dark:border-neutral-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
        }`}
      >
        {progress.percent !== null ? (
          <span className="flex w-full max-w-md flex-col items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <FileText
                className="size-5 text-neutral-900 dark:text-neutral-50"
                aria-hidden="true"
              />
            </span>
            <span className="text-[14px] font-bold text-neutral-900 dark:text-neutral-50">
              {t("appChat.brandKit.importDoc.reading")}
            </span>
            <span
              title={fileName}
              className="max-w-full truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400"
            >
              {fileName}
            </span>
            <span className="mt-2 flex w-full items-center gap-3">
              <span
                role="progressbar"
                aria-label={t("appChat.brandKit.importDoc.reading")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              >
                <span
                  className="relative block h-full overflow-hidden rounded-full bg-neutral-900 transition-[width] duration-500 ease-out dark:bg-white"
                  style={{ width: `${progress.percent}%` }}
                >
                  {/* The estimate crawls near its ceiling, so the sweep is what
                      says the request is still alive. Gone at 100: done. */}
                  {progress.percent < 100 ? (
                    <span className="absolute inset-0 animate-[flow-media-shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/45 to-transparent motion-reduce:hidden dark:via-neutral-900/30" />
                  ) : null}
                </span>
              </span>
              <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                {progress.percent}%
              </span>
            </span>
          </span>
        ) : (
          <>
            <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <FileUp
                className="size-5 text-neutral-600 dark:text-neutral-300"
                aria-hidden="true"
              />
            </span>
            <span className="text-[14px] font-bold text-neutral-900 dark:text-neutral-50">
              {t("appChat.brandKit.importDoc.title")}
            </span>
            <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
              {t("appChat.brandKit.importDoc.hint")}
            </span>
            <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
              {t("appChat.brandKit.importDoc.accept")}
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          // Reset AFTER reading: clearing first empties the list, and choosing
          // the same file twice in a row has to fire a second change.
          event.target.value = "";
          if (file) void send(file);
        }}
      />

      {error ? (
        <p
          role="alert"
          className="px-1 text-[12px] font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
};
