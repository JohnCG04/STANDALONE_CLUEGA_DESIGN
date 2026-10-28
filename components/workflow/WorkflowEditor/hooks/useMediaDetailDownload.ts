"use client";

import { useEffect } from "react";

import type { AssetKind } from "@dogclaw-ad/workflow";

import { downloadMediaFromUrl } from "../../shared";
import { DETAIL_SELECTOR, DOWNLOAD_SELECTOR } from "../constants";

/**
 * Makes Result-history Download save a file; the package's cross-origin fallback only opens a tab.
 * Caught in the CAPTURE phase (the button is compiled); remove once `resolveDownload` is used.
 */
export function useMediaDetailDownload(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>(DOWNLOAD_SELECTOR);
      if (!anchor) return;

      // The ATTRIBUTE, not `anchor.href`: an absolute proxy url would be wrapped twice and 403.
      const url = anchor.getAttribute("href")?.trim();
      if (!url) return;

      // Claim the click, or the package's handler opens its tab alongside our save.
      event.preventDefault();
      event.stopPropagation();

      // The stage's element is the only place the kind is readable from the DOM.
      const kind: AssetKind = anchor
        .closest(DETAIL_SELECTOR)
        ?.querySelector("video")
        ? "video"
        : "image";

      void downloadMediaFromUrl(url, kind).catch((err) =>
        console.error("[workflow] media download failed", err),
      );
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
