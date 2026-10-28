"use client";

import { useCallback, useState, type SyntheticEvent } from "react";
import { UsersRound } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslate } from "@/hooks/useTranslate";
import type { VirtualCharacter, VirtualCharacterQuota } from "@/lib/virtualCharacters/types";

import { CAST_MAX } from "../../constants";
import { addPicks } from "../../helpers";
import type { DrawerView, UploadDraft } from "../../types";
import { QuotaMeter } from "../QuotaMeter";
import { EditCharacter } from "./components/EditCharacter";
import { LibraryTab } from "./components/LibraryTab";
import { UploadTab } from "./components/UploadTab";

export interface LibraryDrawerProps {
  view: DrawerView;
  characters: VirtualCharacter[];
  quota?: VirtualCharacterQuota;
  loading: boolean;
  /** The node's cast when the drawer opened; the Library tab edits a copy until Use. */
  picked: string[];
  upload: UploadDraft;
  onViewChange: (view: DrawerView) => void;
  onUploadChange: (update: (upload: UploadDraft) => UploadDraft) => void;
  /** New characters join the node's cast at once (they are cast once approved). */
  onCreated: (ids: string[]) => void;
  /** A character deleted here leaves the node's cast too. */
  onDeleted: (id: string) => void;
  onUse: (ids: string[]) => void;
  onClose: () => void;
}

const TAB_CLASS =
  "rounded-lg text-[13px] data-[state=active]:text-neutral-900 dark:data-[state=active]:text-neutral-50";

// A portal still bubbles through the React tree: keep presses and keys off the canvas node.
const stop = (event: SyntheticEvent) => event.stopPropagation();

/** The workspace's character library beside the canvas: pick the cast, upload, edit, delete. */
export const LibraryDrawer = ({
  view,
  characters,
  quota,
  loading,
  picked,
  upload,
  onViewChange,
  onUploadChange,
  onCreated,
  onDeleted,
  onUse,
  onClose,
}: LibraryDrawerProps) => {
  const { t } = useTranslate();
  const [selected, setSelected] = useState(picked);
  const [fresh, setFresh] = useState<string[]>([]);
  const editing = view.editId ? characters.find((c) => c.id === view.editId) : undefined;

  const toggle = useCallback(
    (id: string) =>
      setSelected((s) =>
        s.includes(id) ? s.filter((x) => x !== id) : s.length < CAST_MAX ? [...s, id] : s,
      ),
    [],
  );
  const openEdit = useCallback((editId: string) => onViewChange({ tab: "library", editId }), [
    onViewChange,
  ]);
  const dropDeleted = useCallback(
    (id: string) => {
      setSelected((s) => s.filter((x) => x !== id));
      onDeleted(id);
    },
    [onDeleted],
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        side="right"
        showCloseButton
        className="flex w-[440px] flex-col p-0"
        onClick={stop}
        onKeyDown={stop}
        onPointerDown={stop}
      >
        <header className="flex flex-col gap-3 border-b border-neutral-200/80 bg-gradient-to-b from-teal-50/80 to-transparent px-5 pb-4 pt-5 dark:border-neutral-800 dark:from-teal-950/30">
          <div className="flex items-center gap-3 pr-8">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-500 text-white shadow-md shadow-teal-500/20">
              <UsersRound className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base">{t("appChat.characters.drawer.title")}</DialogTitle>
              <DialogDescription className="text-[12px] leading-snug">
                {t("appChat.characters.drawer.description")}
              </DialogDescription>
            </div>
          </div>
          {quota ? <QuotaMeter quota={quota} /> : null}
        </header>

        {editing ? (
          <EditCharacter
            key={editing.id}
            character={editing}
            quota={quota}
            onBack={() => onViewChange({ tab: "library" })}
            onDeleted={(id) => {
              dropDeleted(id);
              onViewChange({ tab: "library" });
            }}
          />
        ) : (
          <Tabs
            value={view.tab}
            onValueChange={(tab) => onViewChange({ tab: tab === "upload" ? "upload" : "library" })}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-5 mt-4 grid h-10 grid-cols-2 rounded-xl">
              <TabsTrigger value="library" className={TAB_CLASS}>
                {t("appChat.characters.drawer.library")}
              </TabsTrigger>
              <TabsTrigger value="upload" className={TAB_CLASS}>
                {t("appChat.characters.drawer.upload")}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="library"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-left-2"
            >
              <LibraryTab
                characters={characters}
                loading={loading}
                selected={selected}
                fresh={fresh}
                onToggle={toggle}
                onEdit={openEdit}
                onDeleted={dropDeleted}
                onUpload={() => onViewChange({ tab: "upload" })}
                onUse={() => onUse(selected)}
              />
            </TabsContent>
            <TabsContent
              value="upload"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-2"
            >
              <UploadTab
                upload={upload}
                quota={quota}
                onChange={onUploadChange}
                onCreated={(created) => {
                  const ids = created.map((c) => c.id);
                  setSelected((s) => addPicks(s, ids));
                  setFresh(ids);
                  onCreated(ids);
                  onViewChange({ tab: "library" });
                }}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
