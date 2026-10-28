"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Search, Upload, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { VirtualCharacter } from "@/lib/virtualCharacters/types";

import { CAST_MAX, FIELD_CLASS } from "../../../constants";
import { describeCharacterError } from "../../../helpers";
import { useCharacterMutations } from "../../../hooks/useCharacterMutations";
import { DeleteCharacterDialog } from "../../DeleteCharacterDialog";
import { CharacterCard } from "./CharacterCard";

export interface LibraryTabProps {
  characters: VirtualCharacter[];
  loading: boolean;
  selected: string[];
  fresh: string[];
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDeleted: (id: string) => void;
  onUpload: () => void;
  onUse: () => void;
}

/** The workspace's characters to pick the cast from; edit, delete and retry work in place. */
export const LibraryTab = ({
  characters,
  loading,
  selected,
  fresh,
  onToggle,
  onEdit,
  onDeleted,
  onUpload,
  onUse,
}: LibraryTabProps) => {
  const { t } = useTranslate();
  const { retry, remove } = useCharacterMutations();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<VirtualCharacter | null>(null);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? characters.filter((c) => c.name.toLowerCase().includes(q)) : characters),
    [characters, q],
  );
  const full = selected.length >= CAST_MAX;
  const onRetry = useCallback((id: string) => retry.mutate(id), [retry]);
  const error = retry.error ?? remove.error;

  const useLabel =
    selected.length === 0
      ? t("appChat.characters.drawer.useNone")
      : selected.length === 1
        ? t("appChat.characters.drawer.useOne")
        : t("appChat.characters.drawer.useMany").replace("{n}", String(selected.length));

  if (!loading && characters.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center animate-in fade-in-0 duration-300">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 to-emerald-500 text-white shadow-lg shadow-teal-500/20">
          <UsersRound className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold">{t("appChat.characters.drawer.empty")}</p>
        <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("appChat.characters.drawer.emptyHint")}
        </p>
        <Button variant="primary" onClick={onUpload} className="mt-1 rounded-xl">
          <Upload className="size-4" aria-hidden="true" />
          {t("appChat.characters.drawer.upload")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="relative mx-5 mt-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("appChat.characters.drawer.search")}
          aria-label={t("appChat.characters.drawer.search")}
          className={cn(FIELD_CLASS, "h-9 pl-9")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <ul className="grid grid-cols-3 gap-3" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </ul>
        ) : shown.length ? (
          <ul className="grid grid-cols-3 gap-3">
            {shown.map((c) => (
              <CharacterCard
                key={c.id}
                character={c}
                selected={selected.includes(c.id)}
                locked={full}
                fresh={fresh.includes(c.id)}
                busy={retry.isPending || remove.isPending}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={setDeleting}
                onRetry={onRetry}
              />
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-[12px] text-neutral-500 dark:text-neutral-400">
            {t("appChat.characters.drawer.noMatch")}
          </p>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-5 mb-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[12px] font-medium text-red-700 animate-in fade-in-0 dark:bg-red-950/40 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {describeCharacterError(error, t)}
        </p>
      ) : null}

      <footer className="flex items-center justify-between gap-3 border-t border-neutral-200/80 bg-white/80 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.characters.drawer.selected")
            .replace("{n}", String(selected.length))
            .replace("{max}", String(CAST_MAX))}
        </span>
        <Button variant="primary" onClick={onUse} className="rounded-xl">
          {useLabel}
        </Button>
      </footer>

      <DeleteCharacterDialog
        name={deleting?.name ?? ""}
        open={deleting !== null}
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              onDeleted(deleting.id);
              setDeleting(null);
            },
          });
        }}
      />
    </>
  );
};
