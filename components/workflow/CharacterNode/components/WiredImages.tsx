"use client";

import { ImageIcon, Loader2, UserPlus } from "lucide-react";
import type { CharacterNodeInput } from "@dogclaw-ad/workflow";

import { SignedImg } from "@/components/media/SignedMedia";
import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";

import { CHARACTER_MAX_IMAGES } from "../constants";
import { imageKey, wiredImages } from "../helpers";
import type { DraftImage } from "../types";

export interface WiredImagesProps {
  inputs: CharacterNodeInput[];
  onCreate: (images: DraftImage[]) => void;
}

/** Images wired into the node, offered as the look of a new character. */
export const WiredImages = ({ inputs, onCreate }: WiredImagesProps) => {
  const { t } = useTranslate();
  const usable = wiredImages(inputs);
  const shown = usable.slice(0, CHARACTER_MAX_IMAGES);
  const running = inputs.some((i) => i.status === "running");

  const hint =
    usable.length > CHARACTER_MAX_IMAGES
      ? t("appChat.characters.node.wiredTooMany")
          .replace("{max}", String(CHARACTER_MAX_IMAGES))
          .replace("{n}", String(usable.length))
      : usable.length
        ? t("appChat.characters.node.wiredReady").replace("{n}", String(usable.length))
        : running
          ? t("appChat.characters.node.wiredRunning")
          : inputs.some((i) => i.status === "ready")
            ? t("appChat.characters.node.wiredUnsupported")
            : t("appChat.characters.node.wiredWaiting");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50/80 to-transparent p-2 animate-in fade-in-0 dark:border-teal-900/60 dark:from-teal-950/30">
      <div className="flex items-center gap-2.5">
        {shown.length ? (
          <div className="flex shrink-0 -space-x-3">
            {shown.map((image) => (
              <SignedImg
                key={imageKey(image)}
                src={image.url}
                alt=""
                draggable={false}
                className="aspect-[3/4] w-8 rounded-md object-cover shadow-sm ring-2 ring-white dark:ring-neutral-900"
              />
            ))}
          </div>
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-teal-600 shadow-sm dark:bg-neutral-900 dark:text-teal-400">
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-4" aria-hidden="true" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("appChat.characters.node.wiredTitle")}
          </p>
          <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{hint}</p>
        </div>
      </div>
      {shown.length ? (
        <Button variant="primary" size="sm" className="w-full rounded-lg" onClick={() => onCreate(shown)}>
          <UserPlus className="size-3.5" aria-hidden="true" />
          {t("appChat.characters.node.wiredCreate")}
        </Button>
      ) : null}
    </div>
  );
};
