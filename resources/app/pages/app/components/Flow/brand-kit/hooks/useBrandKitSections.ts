"use client";

import { useMemo } from "react";

import type { BrandDraft } from "@/lib/media/brandKit";

import { BRAND_SECTIONS } from "../constants";
import { sectionCompleteness } from "../helpers";
import type { BrandSectionId, BrandSectionStatus } from "../types";

/** The nav rail's model: one row per section, with its dot state. */
export function useBrandKitSections(
  draft: BrandDraft,
  dirty: ReadonlySet<BrandSectionId>,
  invalidSections: ReadonlySet<BrandSectionId>,
): BrandSectionStatus[] {
  return useMemo(
    () =>
      BRAND_SECTIONS.map((id) => ({
        id,
        completeness: sectionCompleteness(id, draft, invalidSections),
        dirty: dirty.has(id),
      })),
    [draft, dirty, invalidSections],
  );
}
