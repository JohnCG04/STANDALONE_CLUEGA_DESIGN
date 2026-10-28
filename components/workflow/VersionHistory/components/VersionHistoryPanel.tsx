import { History, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslate } from "@/hooks/useTranslate";
import type { FlowDocumentVersionMeta } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { VersionRow } from "./VersionRow";

export interface VersionHistoryPanelProps {
  versions: FlowDocumentVersionMeta[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** The version being previewed; `null` while the live canvas shows. */
  previewing: number | null;
  confirmingDelete: number | null;
  deleting: number | null;
  onSelect: (version: number) => void;
  onAskDelete: (version: number | null) => void;
  onDelete: (version: number) => void;
  onClose: () => void;
}

/** A panel beside the canvas, not a modal over it: picking a row previews it right there. */
export function VersionHistoryPanel({
  versions,
  loading,
  error,
  onRetry,
  previewing,
  confirmingDelete,
  deleting,
  onSelect,
  onAskDelete,
  onDelete,
  onClose,
}: VersionHistoryPanelProps) {
  const { t } = useTranslate();

  let body;
  if (loading) {
    body = (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (error || !versions) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-[13px] text-muted-foreground">{t("appChat.flow.versions.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("appChat.flow.versions.retry")}
        </Button>
      </div>
    );
  } else if (versions.length === 0) {
    body = (
      <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
        {t("appChat.flow.versions.empty")}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-1 p-2">
        {versions.map((version, index) => (
          <VersionRow
            key={version.version}
            version={version}
            current={index === 0}
            active={previewing === null ? index === 0 : previewing === version.version}
            confirmingDelete={confirmingDelete === version.version}
            deleting={deleting === version.version}
            onSelect={onSelect}
            onAskDelete={onAskDelete}
            onDelete={onDelete}
          />
        ))}
      </ul>
    );
  }

  return (
    <aside
      aria-label={t("appChat.flow.versions.title")}
      className="nokey absolute bottom-3 right-3 top-3 z-30 flex w-[340px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
    >
      <div className="flex items-start gap-2 border-b border-border px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <History className="size-4" aria-hidden="true" />
            {t("appChat.flow.versions.title")}
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {t("appChat.flow.versions.description")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("appChat.flow.versions.close")}
          onClick={onClose}
          className="rounded-md p-1.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
