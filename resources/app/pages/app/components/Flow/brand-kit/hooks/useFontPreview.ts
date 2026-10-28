"use client";

import { useEffect } from "react";

import { NON_GOOGLE_FAMILIES } from "@/lib/media/brandFonts";

import { FONT_PREVIEW_LIMIT } from "../constants";

const ATTRIBUTE = "data-brand-font-preview";

/**
 * Load the webfonts for the rows on screen, so each name is drawn in its own
 * family.
 *
 * ONE `<link>` PER FAMILY. Google's css2 endpoint answers an unknown family
 * with a 400 for the WHOLE request, so one batched url means one bad name
 * blanks every preview. Separate links fail separately and cache separately.
 *
 * Links are left behind on unmount: the trigger still paints the chosen face,
 * and pulling its stylesheet is how you get a flash of fallback.
 */
export function useFontPreview(families: readonly string[]) {
  const wanted = families
    .slice(0, FONT_PREVIEW_LIMIT)
    .filter((family) => !NON_GOOGLE_FAMILIES.has(family))
    .join("|");

  useEffect(() => {
    if (!wanted) return;
    for (const family of wanted.split("|")) {
      const id = `${ATTRIBUTE}-${family}`;
      if (document.head.querySelector(`link[${ATTRIBUTE}="${CSS.escape(family)}"]`)) {
        continue;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute(ATTRIBUTE, family);
      link.id = id;
      // `text=` would be smaller, but the same face has to render the chosen
      // value in the trigger afterwards, where the text is not the family name.
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        family,
      ).replace(/%20/g, "+")}&display=swap`;
      document.head.append(link);
    }
  }, [wanted]);
}
