"use client";

import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { useMediaUpload } from "@/resources/app/pages/app/components/AvatarStudio/shared/useMediaUpload";

import {
  CHARACTER_DESCRIPTION_MAX,
  CHARACTER_NAME_MAX,
  CHARACTER_UPLOAD_TYPE,
  FIELD_CLASS,
} from "../constants";
import { imageKey, validateCharacterImage } from "../helpers";
import type { DraftCharacter } from "../types";
import { CharacterImages } from "./CharacterImages";

const UPLOAD_OPTIONS = {
  typeUpload: CHARACTER_UPLOAD_TYPE,
  failedMessageKey: "appChat.characters.errors.upload",
  validate: validateCharacterImage,
};

export interface DraftCharacterRowProps {
  row: DraftCharacter;
  /** 1-based; shown only in a group, where rows need telling apart. */
  position?: number;
  maxImages: number;
  disabled: boolean;
  onChange: (update: (row: DraftCharacter) => DraftCharacter) => void;
  /** Set when the row may go (one of several new characters). */
  onRemove?: () => void;
}

/** One character of the draft: its name, look and images. */
export const DraftCharacterRow = ({
  row,
  position,
  maxImages,
  disabled,
  onChange,
  onRemove,
}: DraftCharacterRowProps) => {
  const { t } = useTranslate();
  // The hook validates and guards stale picks; accepted images are saved into the node.
  const upload = useMediaUpload(UPLOAD_OPTIONS);

  // One at a time: the hook keeps only the latest pick, so parallel uploads would drop all but one.
  const add = async (files: File[]) => {
    for (const file of files) {
      const accepted = await upload.upload(file);
      if (!accepted) continue;
      const image = { artifactId: accepted.artifactId, url: accepted.url };
      onChange((c) => ({ ...c, images: [...c.images, image] }));
    }
  };

  const removeImage = (key: string) =>
    onChange((c) => ({ ...c, images: c.images.filter((i) => imageKey(i) !== key) }));

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        position != null &&
          "rounded-xl border border-neutral-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 animate-in fade-in-0 slide-in-from-top-1 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
      )}
    >
      {position != null ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {t("appChat.characters.node.characterLabel").replace("{n}", String(position))}
          </span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="rounded-md p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              aria-label={t("appChat.characters.node.removeCharacter")}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <Input
        value={row.name}
        maxLength={CHARACTER_NAME_MAX}
        disabled={disabled}
        placeholder={t("appChat.characters.form.namePlaceholder")}
        aria-label={t("appChat.characters.form.name")}
        className={cn(FIELD_CLASS, "h-9")}
        onChange={(event) => {
          const name = event.target.value;
          onChange((c) => ({ ...c, name }));
        }}
      />
      <Textarea
        value={row.description}
        rows={2}
        maxLength={CHARACTER_DESCRIPTION_MAX}
        disabled={disabled}
        placeholder={t("appChat.characters.form.lookPlaceholder")}
        aria-label={t("appChat.characters.form.look")}
        className={cn(FIELD_CLASS, "min-h-0 resize-none py-2 text-[12px] leading-relaxed")}
        onChange={(event) => {
          const description = event.target.value;
          onChange((c) => ({ ...c, description }));
        }}
      />
      <CharacterImages
        images={row.images}
        max={maxImages}
        uploading={upload.uploading}
        disabled={disabled}
        onAdd={(files) => void add(files)}
        onRemove={removeImage}
      />
      {upload.error ? (
        <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {upload.error}
        </p>
      ) : null}
    </div>
  );
};
