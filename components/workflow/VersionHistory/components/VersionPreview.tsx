"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Eye, RotateCcw } from "lucide-react";
import type { WorkflowLocale, WorkflowTheme } from "@dogclaw-ad/workflow";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { formatDateTimeWithSeconds } from "@/lib/format/datetime";
import type { FlowDocumentVersion } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { documentToGraph, documentViewport } from "../../shared/flowGraph";
import { WorkflowLoadingView } from "../../shared/components/WorkflowLoadingView";
import { PREVIEW_ACTIONS } from "../constants";

const WorkflowEditor = dynamic(
  () => import("@dogclaw-ad/workflow").then((mod) => mod.WorkflowEditor),
  { ssr: false, loading: () => <WorkflowLoadingView /> },
);

export interface VersionPreviewProps {
  version: number;
  doc: FlowDocumentVersion | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  theme: WorkflowTheme;
  locale: WorkflowLocale;
  storyboardPresets?: unknown;
  onBack: () => void;
  onRestore: () => void;
}

/**
 * A kept version drawn read-only over the live canvas, which stays mounted underneath:
 * its unsaved edits and pending autosave carry on untouched.
 */
export function VersionPreview({
  version,
  doc,
  loading,
  error,
  onRetry,
  theme,
  locale,
  storyboardPresets,
  onBack,
  onRestore,
}: VersionPreviewProps) {
  const { t, lang } = useTranslate();
  const graph = useMemo(() => (doc ? documentToGraph(doc) : null), [doc]);

  return (
    <div className="nokey absolute inset-0 z-20 bg-background">
      {graph && doc ? (
        <WorkflowEditor
          key={version}
          actions={PREVIEW_ACTIONS}
          readOnly
          className="h-full w-full"
          theme={theme}
          locale={locale}
          defaultNodes={graph.nodes}
          defaultEdges={graph.edges}
          defaultViewport={documentViewport(doc)}
          storyboardPresets={storyboardPresets}
        />
      ) : error ? (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-[13px] text-muted-foreground">{t("appChat.flow.versions.previewFailed")}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("appChat.flow.versions.retry")}
          </Button>
        </div>
      ) : loading ? (
        <WorkflowLoadingView />
      ) : null}

      <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-400px)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-lg max-md:max-w-[calc(100%-24px)]">
        <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate text-[13px]">
          <span className="font-semibold">
            {t("appChat.flow.versions.versionLabel").replace("{version}", String(version))}
          </span>
          {doc && (
            <span className="text-muted-foreground"> · {formatDateTimeWithSeconds(doc.saved_at, lang)}</span>
          )}
        </span>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={onBack}>
          {t("appChat.flow.versions.backToCurrent")}
        </Button>
        <Button variant="primary" size="sm" className="rounded-full" disabled={!doc} onClick={onRestore}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {t("appChat.flow.versions.restore")}
        </Button>
      </div>
    </div>
  );
}
