"use client";

import type { LayoutGlyphBar } from "../types";

/**
 * The little skeleton-bar illustration inside a composition card.
 *
 * `aria-hidden`, because the illustration is decoration: the card's title and
 * caption carry the meaning, and a screen reader hearing "four rectangles"
 * would be worse than hearing nothing. Bars are percentages of the box, so one
 * set of numbers scales to whatever the card is.
 */
export const LayoutGlyph = ({ bars }: { bars: readonly LayoutGlyphBar[] }) => (
  <svg
    viewBox="0 0 100 90"
    aria-hidden="true"
    focusable="false"
    className="h-[72px] w-full"
    preserveAspectRatio="none"
  >
    {bars.map((bar, index) => (
      <rect
        key={index}
        x={bar.x}
        y={bar.y}
        width={bar.w}
        height={bar.h}
        rx={2}
        className="fill-neutral-200 dark:fill-neutral-700"
      />
    ))}
  </svg>
);
