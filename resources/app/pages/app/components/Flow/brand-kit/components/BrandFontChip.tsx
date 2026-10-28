"use client";

/**
 * One "Aa" sample with the family's name under it.
 *
 * The sample is rendered IN that family with a generic fallback, so a font the
 * browser happens to have shows itself and one it does not still reads as a
 * labelled chip rather than a blank box.
 */
export const BrandFontChip = ({
  fontFamily,
  caption,
}: {
  fontFamily: string;
  caption: string;
}) => (
  <div className="flex min-w-0 flex-col items-center rounded-lg bg-white/90 px-2.5 py-1 shadow-sm backdrop-blur-sm dark:bg-neutral-900/85">
    <span
      aria-hidden="true"
      style={{ fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : undefined }}
      className="text-[15px] font-semibold leading-tight text-neutral-900 dark:text-neutral-50"
    >
      Aa
    </span>
    <span
      title={caption}
      className="max-w-[72px] truncate text-[10px] font-medium text-neutral-500 dark:text-neutral-400"
    >
      {caption}
    </span>
  </div>
);
