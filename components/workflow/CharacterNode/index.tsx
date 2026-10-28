"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Settings2, UsersRound } from "lucide-react";
import type { CharacterNodeBodyProps } from "@dogclaw-ad/workflow";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { useVirtualCharacters } from "@/lib/virtualCharacters/queries";

import { CastTiles } from "./components/CastTiles";
import { LibraryDrawer } from "./components/LibraryDrawer";
import { WiredImages } from "./components/WiredImages";
import { CAST_MAX } from "./constants";
import { addPicks, readNodeState, usableIds, withWiredImages } from "./helpers";
import type { CharacterNodeState, DraftImage, DrawerView, UploadDraft } from "./types";

/** The Character node's body: the cast it sends to a wired Video, and the library drawer. */
export function CharacterNodeBody({
  // A package build older than the `images` input passes none.
  inputs = [],
  data,
  onDataChange,
  readOnly = false,
}: CharacterNodeBodyProps) {
  const { t } = useTranslate();
  const { data: library, isPending } = useVirtualCharacters();
  const [drawer, setDrawer] = useState<DrawerView | null>(null);
  const state = readNodeState(data);
  const characters = useMemo(() => library?.characters ?? [], [library]);

  // Every write re-derives the usable ids, so the wired Video never sends one in review.
  const writeState = useCallback(
    (change: (s: CharacterNodeState) => CharacterNodeState) =>
      onDataChange((d) => {
        const next = change(readNodeState(d));
        return { characterIds: usableIds(next.picked, characters), draft: next };
      }),
    [onDataChange, characters],
  );

  // Approvals, and edits or deletes from elsewhere, reach the wired Video once the library reloads.
  const usableKey = library ? usableIds(state.picked, characters).join(",") : null;
  const savedKey = (data.characterIds ?? []).join(",");
  useEffect(() => {
    if (readOnly || usableKey === null || usableKey === savedKey) return;
    writeState((s) => s);
  }, [readOnly, usableKey, savedKey, writeState]);

  const setUpload = useCallback(
    (update: (upload: UploadDraft) => UploadDraft) =>
      writeState((s) => ({ ...s, upload: update(s.upload) })),
    [writeState],
  );

  // The wired pictures land in the Upload form, where the name and the attestation are asked.
  const createFromWired = (images: DraftImage[]) => {
    setUpload((upload) => withWiredImages(upload, images));
    setDrawer({ tab: "upload" });
  };

  const tiles = state.picked.map((id) => ({ id, character: characters.find((c) => c.id === id) }));
  const inReview = tiles.some((tile) => tile.character?.status === "processing");
  const openDrawer = () =>
    setDrawer({ tab: characters.length || isPending ? "library" : "upload" });

  return (
    <div className="flex flex-col gap-3">
      {inputs.length && !readOnly ? (
        <WiredImages inputs={inputs} onCreate={createFromWired} />
      ) : null}
      {tiles.length ? (
        <>
          <CastTiles
            tiles={tiles}
            loading={isPending}
            readOnly={readOnly}
            onRemove={(id) => writeState((s) => ({ ...s, picked: s.picked.filter((x) => x !== id) }))}
            onFix={(editId) => setDrawer({ tab: "library", editId })}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {t("appChat.characters.node.inCast")
                .replace("{n}", String(tiles.length))
                .replace("{max}", String(CAST_MAX))}
            </span>
            {inReview ? (
              <span className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                {t("appChat.characters.node.inReviewHint")}
              </span>
            ) : null}
          </div>
          {readOnly ? null : (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={openDrawer}>
              <Settings2 className="size-3.5" aria-hidden="true" />
              {t("appChat.characters.node.manage")}
            </Button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-gradient-to-b from-teal-50/60 to-transparent px-4 py-5 text-center dark:border-neutral-800 dark:from-teal-950/20">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-500 text-white shadow-md shadow-teal-500/20">
            <UsersRound className="size-5" aria-hidden="true" />
          </span>
          <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("appChat.characters.node.emptyTitle")}
          </p>
          <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t("appChat.characters.node.emptyHint").replace("{max}", String(CAST_MAX))}
          </p>
          {readOnly ? null : (
            <Button variant="primary" size="sm" className="mt-1 rounded-xl" onClick={openDrawer}>
              <Plus className="size-4" aria-hidden="true" />
              {t("appChat.characters.node.add")}
            </Button>
          )}
        </div>
      )}

      {drawer && !readOnly ? (
        <LibraryDrawer
          view={drawer}
          characters={characters}
          quota={library?.quota}
          loading={isPending}
          picked={state.picked}
          upload={state.upload}
          onViewChange={setDrawer}
          onUploadChange={setUpload}
          onCreated={(ids) => writeState((s) => ({ ...s, picked: addPicks(s.picked, ids) }))}
          onDeleted={(id) => writeState((s) => ({ ...s, picked: s.picked.filter((x) => x !== id) }))}
          onUse={(picked) => {
            writeState((s) => ({ ...s, picked }));
            setDrawer(null);
          }}
          onClose={() => setDrawer(null)}
        />
      ) : null}
    </div>
  );
}
