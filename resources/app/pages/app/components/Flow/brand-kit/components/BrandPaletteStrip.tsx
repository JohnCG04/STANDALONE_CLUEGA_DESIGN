"use client";

import { useTranslate } from "@/hooks/useTranslate";

/**
 * The row of colour blocks along the bottom of a card.
 *
 * Flexed by weight rather than fixed width, so a two-colour kit fills the strip
 * exactly as a six-colour one does. `aria-hidden` on the blocks with one label
 * on the row: nine individually announced hexes would be noise, and the card's
 * name is what identifies it.
 */
export const BrandPaletteStrip = ({ hexes }: { hexes: readonly string[] }) => {
  const { t } = useTranslate();

  if (hexes.length === 0) {
    return (
      <p className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
        {t("appChat.brandKit.noPalette")}
      </p>
    );
  }

  return (
    <div
      className="flex h-6 w-full overflow-hidden rounded-md border border-black/5 dark:border-white/10"
      aria-label={t("appChat.brandKit.paletteLabel").replace(
        "{count}",
        String(hexes.length),
      )}
      role="img"
    >
      {hexes.map((hex, index) => (
        <span
          key={`${hex}-${index}`}
          aria-hidden="true"
          style={{ backgroundColor: hex }}
          className="h-full flex-1"
        />
      ))}
    </div>
  );
};
