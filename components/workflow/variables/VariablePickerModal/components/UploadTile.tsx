import { useRef } from "react";
import { Loader2, Upload } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import type { MediaVariableKind } from "../../types";

export interface UploadTileProps {
  kind: MediaVariableKind;
  uploading: boolean;
  onFiles: (files: File[]) => void;
}

/** The grid's first cell: pick files from disk; they join the selection once uploaded. */
export function UploadTile({ kind, uploading, onFiles }: UploadTileProps) {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      disabled={uploading}
      onClick={() => inputRef.current?.click()}
      className="flex aspect-square w-full break-inside-avoid flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-[14px] font-medium text-neutral-800 transition-colors hover:bg-neutral-100 disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800">
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      </span>
      {uploading
        ? t("appChat.flow.variables.picker.uploading")
        : t("appChat.flow.variables.picker.upload")}
      <input
        ref={inputRef}
        type="file"
        accept={`${kind}/*`}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Reset so picking the same file again still fires `change`.
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </button>
  );
}
