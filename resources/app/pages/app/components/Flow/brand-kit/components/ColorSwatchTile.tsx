"use client";

import type { BrandDraftColor } from "@/lib/media/brandKit";

import { useTranslate } from "@/hooks/useTranslate";

/**
 * One colour: a rounded square of the hex, its name underneath.
 *
 * `w-full` because a button is shrink-to-fit even when `display: flex`: without
 * it the tile took its width from the caption, so every square in the row came
 * out a different size.
 *
 * The accessible name is "name, hex" and NEVER the fill alone — the swatch is
 * `aria-hidden`, because a colour nobody can see is a colour nobody can read.
 * The hairline border is what keeps `#FFFFFF` visible on a white card, which is
 * exactly how "Petal White" went missing in the design mock-up.
 */
export const ColorSwatchTile = ({
  color,
  onEdit,
}: {
  color: BrandDraftColor;
  onEdit: () => void;
}) => {
  const { t } = useTranslate();
  const name = color.name || t("appChat.brandKit.colors.untitled");

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={t("appChat.brandKit.colors.tile")
        .replace("{name}", name)
        .replace("{hex}", color.hex || "—")}
      className="group flex w-full min-w-0 flex-col gap-1.5 text-left"
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: color.hex || "transparent" }}
        className="block aspect-square w-full rounded-xl border border-black/5 transition-transform group-hover:scale-[1.02] dark:border-white/10"
      />
      <span
        title={name}
        className="truncate text-[12px] font-medium text-neutral-700 dark:text-neutral-300"
      >
        {name}
      </span>
    </button>
  );
};
