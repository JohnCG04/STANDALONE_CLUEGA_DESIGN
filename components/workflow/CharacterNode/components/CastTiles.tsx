"use client";

import { AlertTriangle, Check, Loader2, UserRound, X } from "lucide-react";

import { SignedImg } from "@/components/media/SignedMedia";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { VirtualCharacter } from "@/lib/virtualCharacters/types";

export interface CastTile {
  id: string;
  /** Unset while the library loads, where it can't, or once the character was deleted. */
  character?: VirtualCharacter;
}

export interface CastTilesProps {
  tiles: CastTile[];
  loading: boolean;
  readOnly: boolean;
  onRemove: (id: string) => void;
  onFix: (id: string) => void;
}

/** The node's cast: one portrait per character with its BytePlus review state on it. */
export const CastTiles = ({ tiles, loading, readOnly, onRemove, onFix }: CastTilesProps) => {
  const { t } = useTranslate();

  return (
    <ul className="grid grid-cols-5 gap-2">
      {tiles.map(({ id, character }) => (
        <li
          key={id}
          className="group/cast flex min-w-0 flex-col gap-1 animate-in fade-in-0 zoom-in-95 duration-300"
        >
          <div
            className={cn(
              "relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-black/5 transition-shadow duration-200 group-hover/cast:shadow-md dark:bg-neutral-800 dark:ring-white/10",
              character?.status === "failed" && "ring-2 ring-red-500 dark:ring-red-500",
              !character && loading && "animate-pulse",
            )}
          >
            {character?.coverUrl ? (
              <SignedImg
                src={character.coverUrl}
                alt=""
                draggable={false}
                className="size-full object-cover transition-transform duration-300 group-hover/cast:scale-105"
              />
            ) : (
              <UserRound
                className="absolute inset-0 m-auto size-5 text-neutral-400"
                aria-hidden="true"
              />
            )}
            {character?.status === "processing" ? (
              <span
                className="absolute inset-0 flex items-center justify-center bg-black/35"
                title={t("appChat.characters.status.processing")}
              >
                <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
              </span>
            ) : null}
            {character?.status === "active" ? (
              <span
                className="absolute bottom-1 left-1 flex size-4 items-center justify-center rounded-full bg-teal-400 text-white shadow-sm"
                title={t("appChat.characters.status.active")}
              >
                <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
              </span>
            ) : null}
            {character?.status === "failed" && !readOnly ? (
              <button
                type="button"
                onClick={() => onFix(id)}
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-red-600/90 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-red-600"
              >
                <AlertTriangle className="size-2.5" aria-hidden="true" />
                {t("appChat.characters.node.fix")}
              </button>
            ) : null}
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => onRemove(id)}
                aria-label={t("appChat.characters.node.removeFromCast")}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity duration-150 group-hover/cast:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
          </div>
          <span
            className={cn(
              "truncate text-center text-[11px] font-medium text-neutral-700 dark:text-neutral-300",
              !character && "text-neutral-400 dark:text-neutral-500",
            )}
          >
            {character?.name ?? (loading ? "\u00a0" : t("appChat.characters.node.deleted"))}
          </span>
        </li>
      ))}
    </ul>
  );
};
