"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useTranslate } from "@/hooks/useTranslate";
import type {
  CreateFlowVariableInput,
  FlowVariableKind,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import {
  AssetGrid,
  AssetGridSkeleton,
} from "@/resources/app/pages/app/components/PromptComposer/components/modals/AssetLibraryModal/AssetGrid";
import { PickerSearchInput } from "@/resources/app/pages/app/components/PromptComposer/components/modals/PickerSearchInput";
import { screenWorkflowUploads, uploadFilesToArtifacts } from "../../shared/artifacts";
import { MAX_VARIABLE_ITEMS, MAX_VARIABLE_TEXT } from "../constants";
import { uploadedTile } from "../helpers";
import type { PickedTile, PickerSource } from "../types";
import { KindTabs } from "./components/KindTabs";
import { SelectionFooter } from "./components/SelectionFooter";
import { SourceTabs } from "./components/SourceTabs";
import { TextPanel } from "./components/TextPanel";
import { UploadTile } from "./components/UploadTile";
import { useVariableAssets } from "./hooks/useVariableAssets";

export interface VariablePickerModalProps {
  projectId?: string;
  onClose: () => void;
  /** Rejects with display copy, shown above the footer. */
  onSave: (input: CreateFlowVariableInput) => Promise<void>;
}

/** "Create New Variable": name it, pick library files of one kind (or type text), save. */
export function VariablePickerModal({ projectId, onClose, onSave }: VariablePickerModalProps) {
  const { t } = useTranslate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<FlowVariableKind>("image");
  const [source, setSource] = useState<PickerSource>("upload");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ReadonlyMap<string, PickedTile>>(new Map());
  const [uploaded, setUploaded] = useState<PickedTile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const media = kind === "text" ? null : kind;
  const assets = useVariableAssets({ kind: media, source, q });
  const debounceQuery = useDebounce(setQ, 300);

  const tiles = useMemo(() => {
    const fresh = new Set(uploaded.map((tile) => tile.key));
    return [...uploaded, ...assets.tiles.filter((tile) => !fresh.has(tile.key))];
  }, [uploaded, assets.tiles]);

  const changeKind = useCallback((next: FlowVariableKind) => {
    setKind(next);
    // A variable holds one kind, so files picked for another one cannot come along.
    setSelected(new Map());
    setUploaded([]);
    setError(null);
  }, []);

  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      debounceQuery(value.trim());
    },
    [debounceQuery],
  );

  const toggle = useCallback(
    (tile: PickedTile) => {
      const next = new Map(selected);
      if (next.has(tile.key)) next.delete(tile.key);
      else if (next.size >= MAX_VARIABLE_ITEMS) {
        setError(
          t("appChat.flow.variables.picker.maxItems").replace("{max}", String(MAX_VARIABLE_ITEMS)),
        );
        return;
      } else next.set(tile.key, tile);
      setError(null);
      setSelected(next);
    },
    [selected, t],
  );

  const upload = useCallback(
    async (files: File[]) => {
      if (!media) return;
      setUploading(true);
      setError(null);
      try {
        const accepted = await screenWorkflowUploads(files);
        const assetsUp = await uploadFilesToArtifacts(accepted, projectId);
        const fresh = assetsUp.map((asset, i) => uploadedTile(asset, accepted[i], media));
        setUploaded((prev) => [...fresh, ...prev]);
        setSelected((prev) => {
          const next = new Map(prev);
          for (const tile of fresh) if (next.size < MAX_VARIABLE_ITEMS) next.set(tile.key, tile);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("appChat.flow.variables.errors.saveFailed"));
      } finally {
        setUploading(false);
      }
    },
    [media, projectId, t],
  );

  const picked = useMemo(() => [...selected.values()], [selected]);
  const textLength = [...text].length;
  const canSave = media
    ? picked.length > 0
    : text.trim().length > 0 && textLength <= MAX_VARIABLE_TEXT;

  const save = async () => {
    if (!canSave || saving) return;
    const label = name.trim() || t("appChat.flow.variables.picker.untitled");
    setSaving(true);
    setError(null);
    try {
      await onSave(
        media
          ? { name: label, kind: media, items: picked.map((tile) => tile.item) }
          : { name: label, kind: "text", text },
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  let body;
  if (!media) body = <TextPanel value={text} onChange={setText} />;
  else if (assets.loading) body = <AssetGridSkeleton />;
  else if (assets.error)
    body = (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[13px] text-neutral-500">{t("appChat.flow.variables.picker.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void assets.retry()}>
          {t("appChat.flow.variables.picker.retry")}
        </Button>
      </div>
    );
  else
    body = (
      <>
        <AssetGrid
          layout="masonry"
          items={tiles}
          selected={selected}
          onToggle={(tile) => toggle(tile as PickedTile)}
          leading={<UploadTile kind={media} uploading={uploading} onFiles={upload} />}
        />
        {tiles.length === 0 && (
          <p className="pb-6 text-center text-[13px] text-neutral-500">
            {t("appChat.flow.variables.picker.empty")}
          </p>
        )}
        {assets.hasMore && (
          <div className="flex justify-center pb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={assets.loadingMore}
              onClick={() => void assets.loadMore()}
            >
              {t("appChat.flow.variables.picker.loadMore")}
            </Button>
          </div>
        )}
      </>
    );

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        showCloseButton
        className="flex h-[min(780px,90vh)] w-[1320px] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex flex-col gap-4 px-7 pb-4 pr-14 pt-6">
          <DialogTitle className="sr-only">{t("appChat.flow.variables.picker.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("appChat.flow.variables.picker.description")}
          </DialogDescription>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("appChat.flow.variables.picker.untitled")}
            aria-label={t("appChat.flow.variables.picker.nameLabel")}
            maxLength={100}
            className="w-fit min-w-[220px] max-w-full border-b border-dotted border-neutral-300 bg-transparent pb-0.5 text-[22px] font-semibold text-foreground outline-none placeholder:text-foreground focus:border-neutral-500 dark:border-neutral-600"
          />
          <KindTabs value={kind} onChange={changeKind} />
          {media && (
            <>
              <SourceTabs value={source} onChange={setSource} />
              <PickerSearchInput
                value={query}
                onChange={changeQuery}
                placeholder={t("appChat.flow.variables.picker.search")}
              />
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7">{body}</div>
        {error && (
          <p role="alert" className="px-7 pt-2 text-[12px] text-destructive">
            {error}
          </p>
        )}
        <SelectionFooter
          kind={kind}
          picked={picked}
          canSave={canSave}
          saving={saving}
          onCancel={onClose}
          onSave={() => void save()}
        />
      </DialogContent>
    </Dialog>
  );
}
