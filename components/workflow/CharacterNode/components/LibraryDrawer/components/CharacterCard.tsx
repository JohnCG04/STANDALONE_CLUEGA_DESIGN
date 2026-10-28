"use client";

import { memo } from "react";
import { Check, ImageIcon, Loader2, Pencil, RotateCcw, Trash2, UserRound } from "lucide-react";

import { SignedImg } from "@/components/media/SignedMedia";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { VirtualCharacter } from "@/lib/virtualCharacters/types";

import { CAST_MAX, CAST_RING_CLASS } from "../../../constants";

export interface CharacterCardProps {
  character: VirtualCharacter;
  selected: boolean;
  /** The cast is full: only a selected card can still be clicked (to drop it). */
  locked: boolean;
  /** Just uploaded: drawn once with a pop so it is easy to find. */
  fresh: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (character: VirtualCharacter) => void;
  onRetry: (id: string) => void;
}

const ACTION =
  "rounded-full bg-black/55 p-1.5 text-white backdrop-blur-sm transition-colors duration-150 hover:bg-black/75 disabled:opacity-50";

/** A library character: click picks it for the cast; hover offers edit and delete. */
export const CharacterCard = memo(function CharacterCard({
  character,
  selected,
  locked,
  fresh,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onRetry,
}: CharacterCardProps) {
  const { t } = useTranslate();
  const failed = character.status === "failed";
  const disabled = locked && !selected;

  return (
    <li
      className={cn(
        "group/card relative aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-black/5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:bg-neutral-800 dark:ring-white/10",
        selected && CAST_RING_CLASS,
        failed && "ring-2 ring-red-500 dark:ring-red-500",
        disabled && "opacity-50 hover:translate-y-0 hover:shadow-none",
        fresh && "animate-in zoom-in-90 fade-in-0 duration-500",
      )}
    >
      {character.coverUrl ? (
        <SignedImg
          src={character.coverUrl}
          alt=""
          draggable={false}
          className="size-full object-cover transition-transform duration-500 group-hover/card:scale-105"
        />
      ) : (
        <UserRound className="absolute inset-0 m-auto size-6 text-neutral-400" aria-hidden="true" />
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />

      {/* A refused character is fixed, not cast: its press opens the edit form. */}
      <button
        type="button"
        aria-pressed={failed ? undefined : selected}
        aria-label={character.name}
        title={
          disabled
            ? t("appChat.characters.drawer.castFull").replace("{max}", String(CAST_MAX))
            : undefined
        }
        disabled={disabled}
        onClick={() => (failed ? onEdit(character.id) : onToggle(character.id))}
        className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400 disabled:cursor-not-allowed"
      />

      {failed ? null : (
        <span
          className={cn(
            "pointer-events-none absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all duration-200",
            selected
              ? "scale-100 border-teal-400 bg-teal-400 text-white"
              : "scale-90 border-white/80 bg-black/20 opacity-0 group-hover/card:opacity-100",
          )}
        >
          {selected ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
        </span>
      )}

      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100">
        <button
          type="button"
          className={ACTION}
          disabled={busy}
          onClick={() => onEdit(character.id)}
          aria-label={t("appChat.characters.node.edit")}
        >
          <Pencil className="size-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ACTION}
          disabled={busy}
          onClick={() => onDelete(character)}
          aria-label={t("appChat.characters.drawer.deleteCharacter")}
        >
          <Trash2 className="size-3" aria-hidden="true" />
        </button>
      </div>

      {character.status === "processing" ? (
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {t("appChat.characters.status.processing")}
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2 text-white">
        <span className="truncate text-[12px] font-semibold leading-tight">{character.name}</span>
        {failed ? (
          <>
            <span className="line-clamp-2 text-[10px] leading-snug text-red-200">
              {character.failureReason || t("appChat.characters.status.failed")}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRetry(character.id)}
              className="pointer-events-auto mt-1 flex items-center gap-1 self-start rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-white disabled:opacity-50"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              {t("appChat.characters.retry")}
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-white/75">
            <ImageIcon className="size-3" aria-hidden="true" />
            {character.images.length}
          </span>
        )}
      </div>
    </li>
  );
});
