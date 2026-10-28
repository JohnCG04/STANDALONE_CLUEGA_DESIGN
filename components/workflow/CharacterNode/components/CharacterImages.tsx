"use client";

import { useId } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { SignedImg } from "@/components/media/SignedMedia";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import { CHARACTER_IMAGE_ACCEPT } from "../constants";
import { imageKey } from "../helpers";
import type { DraftImage } from "../types";

const TILE = "relative aspect-[3/4] w-[60px] shrink-0 overflow-hidden rounded-lg";

export interface CharacterImagesProps {
  images: DraftImage[];
  /** How many this character may hold right now (its own cap and the slots left). */
  max: number;
  uploading: boolean;
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}

/** The character's images as a strip: previews to remove, then one tile to add more. */
export const CharacterImages = ({
  images,
  max,
  uploading,
  disabled,
  onAdd,
  onRemove,
}: CharacterImagesProps) => {
  const { t } = useTranslate();
  const inputId = useId();
  const room = max - images.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((image) => (
        <div
          key={imageKey(image)}
          className={cn(
            TILE,
            "group/tile animate-in fade-in-0 zoom-in-95 duration-200",
            image.status === "failed" && "ring-2 ring-red-500",
          )}
        >
          <SignedImg src={image.url} alt="" draggable={false} className="size-full object-cover" />
          {image.status === "processing" ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
            </span>
          ) : null}
          {disabled ? null : (
            <button
              type="button"
              onClick={() => onRemove(imageKey(image))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 focus-visible:opacity-100"
              aria-label={t("appChat.characters.form.removeImage")}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {room > 0 || uploading ? (
        <label
          htmlFor={inputId}
          aria-label={t("appChat.characters.node.image")}
          className={cn(
            TILE,
            "flex cursor-pointer items-center justify-center border border-dashed border-neutral-300 bg-neutral-50/70 text-neutral-400 transition-colors duration-200 hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:hover:border-neutral-500 dark:hover:bg-neutral-800",
            (disabled || uploading) && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          <input
            id={inputId}
            type="file"
            accept={CHARACTER_IMAGE_ACCEPT}
            multiple={room > 1}
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(event) => {
              onAdd(Array.from(event.target.files ?? []).slice(0, room));
              // Same file twice still fires change after a remove.
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
};
