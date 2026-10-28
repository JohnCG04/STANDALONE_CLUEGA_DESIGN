import { memo } from "react";
import { Eye, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { formatDateTimeWithSeconds } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import type { FlowDocumentVersionMeta } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

export interface VersionRowProps {
  version: FlowDocumentVersionMeta;
  current: boolean;
  /** Shown on the canvas right now (the preview, or the live canvas for Current). */
  active: boolean;
  confirmingDelete: boolean;
  deleting: boolean;
  onSelect: (version: number) => void;
  onAskDelete: (version: number | null) => void;
  onDelete: (version: number) => void;
}

/** One kept version: click previews it on the canvas; any but Current can be deleted. */
export const VersionRow = memo(function VersionRow({
  version,
  current,
  active,
  confirmingDelete,
  deleting,
  onSelect,
  onAskDelete,
  onDelete,
}: VersionRowProps) {
  const { t, lang } = useTranslate();
  const label = t("appChat.flow.versions.versionLabel").replace(
    "{version}",
    String(version.version),
  );
  const counts = t("appChat.flow.versions.counts")
    .replace("{nodes}", String(version.node_count))
    .replace("{edges}", String(version.edge_count));

  return (
    <li
      className={cn(
        "group rounded-lg",
        active ? "bg-neutral-100 dark:bg-muted" : "hover:bg-neutral-50 dark:hover:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-1 pr-1.5">
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(version.version)}
          className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/40"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            {label}
            {current ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                {t("appChat.flow.versions.current")}
              </span>
            ) : active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                <Eye className="size-3" aria-hidden="true" />
                {t("appChat.flow.versions.viewing")}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {formatDateTimeWithSeconds(version.saved_at, lang)} · {counts}
          </span>
        </button>
        {!current && !confirmingDelete && (
          <button
            type="button"
            aria-label={t("appChat.flow.versions.delete")}
            title={t("appChat.flow.versions.delete")}
            disabled={deleting}
            onClick={() => onAskDelete(version.version)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-neutral-700 [@media(hover:none)]:opacity-100"
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </button>
        )}
      </div>
      {confirmingDelete && (
        <div className="mx-2 mb-2 flex flex-col gap-2 rounded-md bg-neutral-100 p-2.5 dark:bg-muted">
          <p className="text-[12px] text-foreground">{t("appChat.flow.versions.deleteConfirm")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAskDelete(null)}>
              {t("appChat.flow.versions.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(version.version)}>
              {t("appChat.flow.versions.delete")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
});
