"use client";

import { MoreHorizontal, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import { BrandFontChip } from "./BrandFontChip";
import { BrandPaletteStrip } from "./BrandPaletteStrip";
import type { BrandKitCardModel } from "../types";

import { SignedImg } from "@/components/media/SignedMedia";

/**
 * One brand kit as a grid tile.
 *
 * The cover bleeds to the card's top and sides with a straight bottom edge: the
 * first photography asset behind the two type families, or a plain fill without
 * one — §3 keeps `logo.variants` and `photography.moodboard` empty in EVERY
 * template, so samples always fall back. The first logo (the one composited
 * onto renders) sits in the cover's top-right corner, and nothing is drawn
 * there without one.
 *
 * The open button and the overflow menu are SIBLINGS, never nested: a button
 * within a button is invalid HTML.
 */
export const BrandKitCard = ({
  card,
  isActive,
  onOpen,
  onSetActive,
  onDelete,
}: {
  card: BrandKitCardModel;
  isActive: boolean;
  onOpen: () => void;
  /** Absent for a template: a sample is not a brand until it is imported. */
  onSetActive?: () => void;
  onDelete?: () => void;
}) => {
  const { t } = useTranslate();
  const hasMenu = Boolean(onSetActive || onDelete);

  return (
    <div className="group relative flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("appChat.brandKit.openKit").replace("{name}", card.name)}
        className={cn(
          "flex flex-1 flex-col overflow-hidden rounded-2xl border text-left transition-colors",
          isActive
            ? "border-neutral-900 dark:border-neutral-100"
            : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600",
        )}
      >
        <div className="relative flex h-[104px] items-end gap-2 bg-neutral-50 p-3 dark:bg-neutral-900">
          {card.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- an artifact
               id or an arbitrary https url, neither of which next/image can size. */
            <SignedImg
              src={card.coverUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          {/* `relative` so the chips paint above the absolutely placed cover. */}
          <div className="relative flex min-w-0 items-end gap-2">
            {card.displayFont ? (
              <BrandFontChip
                fontFamily={card.displayFont}
                caption={card.displayFont}
              />
            ) : (
              <BrandFontChip fontFamily="" caption={t("appChat.brandKit.fontUnset")} />
            )}
            {card.bodyFont ? (
              <BrandFontChip fontFamily={card.bodyFont} caption={card.bodyFont} />
            ) : null}
          </div>
          {card.logoUrl ? (
            <span className="absolute right-3 top-3 flex h-10 max-w-[45%] items-center rounded-lg bg-white/90 px-2 shadow-sm backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
              <img
                src={card.logoUrl}
                alt=""
                className="max-h-7 max-w-full object-contain"
              />
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-3">
          <BrandPaletteStrip hexes={card.hexes} />

          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-neutral-900 dark:text-neutral-50">
              {card.name}
            </p>
            {/* Always two lines tall, filled or not, so every card in the grid
                is the same height whatever its summary runs to. */}
            <p className="mt-0.5 line-clamp-2 min-h-[36px] text-[12px] font-medium leading-[18px] text-neutral-500 dark:text-neutral-400">
              {card.summary}
            </p>
          </div>
        </div>
      </button>

      {isActive ? (
        <Badge variant="default" className="absolute left-3 top-3">
          {t("appChat.brandKit.active")}
        </Badge>
      ) : null}

      {hasMenu && !isActive ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={card.name}
              className="absolute right-2 top-2 bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 dark:bg-neutral-900/80"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            {onSetActive ? (
              <button
                type="button"
                onClick={onSetActive}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Star className="size-4" aria-hidden="true" />
                {t("appChat.brandKit.setActive")}
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t("appChat.brandKit.delete")}
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
};
