"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkflowLocale, WorkflowTheme } from "@dogclaw-ad/workflow";

import { useTranslate } from "@/hooks/useTranslate";
import { useToastStore } from "@/lib/stores/useToastStore";
import { FlowApiError } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { VersionHistoryPanel } from "./components/VersionHistoryPanel";
import { VersionPreview } from "./components/VersionPreview";
import {
  useDeleteDocumentVersion,
  useDocumentVersion,
  useDocumentVersions,
} from "./hooks/useDocumentVersions";

export interface VersionHistoryProps {
  projectId: string;
  /** Undefined for a project without pages (the legacy project-level document). */
  pageId?: string;
  theme: WorkflowTheme;
  locale: WorkflowLocale;
  storyboardPresets?: unknown;
  onClose: () => void;
  /** Writes `version` back as the live document; the container unmounts this view first. */
  onRestore: (version: number) => void;
}

/** Version history beside the canvas: rows preview read-only in place, Restore makes one live. */
export function VersionHistory({
  projectId,
  pageId,
  theme,
  locale,
  storyboardPresets,
  onClose,
  onRestore,
}: VersionHistoryProps) {
  const { t } = useTranslate();
  const pushToast = useToastStore((state) => state.push);
  const versions = useDocumentVersions(projectId, pageId);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const preview = useDocumentVersion(projectId, pageId, previewing);
  const removal = useDeleteDocumentVersion(projectId, pageId);
  const current = versions.data?.[0]?.version;

  const select = useCallback(
    (version: number) => {
      setConfirmingDelete(null);
      setPreviewing(version === current ? null : version);
    },
    [current],
  );

  const remove = useCallback(
    (version: number) => {
      setConfirmingDelete(null);
      removal.mutate(version, {
        onSuccess: () => {
          setPreviewing((shown) => (shown === version ? null : shown));
          pushToast(
            t("appChat.flow.versions.deleted").replace("{version}", String(version)),
            "info",
          );
        },
        onError: (err) => {
          const key =
            err instanceof FlowApiError && err.code === "flow_version_is_current"
              ? "deleteCurrent"
              : "deleteFailed";
          pushToast(t(`appChat.flow.versions.${key}`), "error");
        },
      });
    },
    [removal, pushToast, t],
  );

  // While previewing, keys stop at the window: the live canvas underneath still holds its
  // selection, and its Delete / undo / add-node hotkeys would act on it unseen.
  useEffect(() => {
    if (previewing === null) return;
    const swallow = (event: KeyboardEvent) => {
      if (event.type === "keydown" && event.key === "Escape") setPreviewing(null);
      if (event.key !== "Tab") event.stopPropagation();
    };
    window.addEventListener("keydown", swallow, true);
    window.addEventListener("keyup", swallow, true);
    return () => {
      window.removeEventListener("keydown", swallow, true);
      window.removeEventListener("keyup", swallow, true);
    };
  }, [previewing]);

  // Not previewing, Escape closes the panel; a focused field keeps its own Escape.
  useEffect(() => {
    if (previewing !== null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewing, onClose]);

  return (
    <>
      {previewing !== null && (
        <VersionPreview
          version={previewing}
          doc={preview.data}
          loading={preview.isPending}
          error={preview.isError}
          onRetry={() => void preview.refetch()}
          theme={theme}
          locale={locale}
          storyboardPresets={storyboardPresets}
          onBack={() => setPreviewing(null)}
          onRestore={() => onRestore(previewing)}
        />
      )}
      <VersionHistoryPanel
        versions={versions.data}
        loading={versions.isPending}
        error={versions.isError}
        onRetry={() => void versions.refetch()}
        previewing={previewing}
        confirmingDelete={confirmingDelete}
        deleting={removal.isPending ? (removal.variables ?? null) : null}
        onSelect={select}
        onAskDelete={setConfirmingDelete}
        onDelete={remove}
        onClose={onClose}
      />
    </>
  );
}
