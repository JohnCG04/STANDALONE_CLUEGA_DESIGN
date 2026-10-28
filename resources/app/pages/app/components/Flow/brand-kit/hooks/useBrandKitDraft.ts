"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { FLOW_BRANDS_QUERY_KEY, flowBrandQueryKey } from "@/lib/flow/flowQueryKeys";
import {
  draftForBlank,
  draftForBrand,
  draftForTemplate,
  getBrand,
  getBrandKitTemplate,
  isBrandNotFound,
  type Brand,
  type BrandDraft,
} from "@/lib/media/brandKit";

import { BRANDS_STALE_MS, BRAND_SECTIONS, TEMPLATES_STALE_MS } from "../constants";
import { blankDraftWithDefaultStyles, dirtySections } from "../helpers";
import type { BrandEditorState, BrandSectionId } from "../types";

/**
 * The editor's state: one draft, one baseline, and the sections that differ.
 *
 * Baseline-diffing rather than a boolean dirty flag, because a boolean cannot
 * answer *what to send* — and §5's PATCH semantics make "send everything"
 * actively harmful: re-sending `text_styles` on a tone edit replaces a list the
 * user never touched.
 */
export function useBrandKitDraft(brandId: string | null, templateId?: string) {
  const queryClient = useQueryClient();

  const brandQuery = useQuery({
    queryKey: flowBrandQueryKey(brandId ?? ""),
    queryFn: ({ signal }) => getBrand(brandId as string, signal),
    enabled: Boolean(brandId),
    staleTime: BRANDS_STALE_MS,
    // A 404 is an answer, not a hiccup — retrying only delays the empty state.
    retry: (failureCount, error) => !isBrandNotFound(error) && failureCount < 1,
  });

  const templateQuery = useQuery({
    queryKey: ["flow", "brand-template", templateId ?? ""],
    queryFn: ({ signal }) => getBrandKitTemplate(templateId as string, signal),
    enabled: Boolean(templateId) && !brandId,
    staleTime: TEMPLATES_STALE_MS,
  });

  const [draft, setDraft] = useState<BrandDraft>(draftForBlank);
  const [baseline, setBaseline] = useState<BrandDraft>(draftForBlank);
  const [invalidSections, setInvalidSections] = useState<ReadonlySet<BrandSectionId>>(
    new Set(),
  );
  // Seeded once. Without this a background refetch would stomp a dirty draft
  // with the server's copy mid-edit.
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (brandId) {
      if (!brandQuery.data) return;
      const next = draftForBrand(brandQuery.data);
      setDraft(next);
      setBaseline(next);
      seededRef.current = true;
      return;
    }
    if (templateId) {
      if (!templateQuery.data) return;
      const next = draftForTemplate(templateQuery.data);
      setDraft(next);
      setBaseline(next);
      seededRef.current = true;
      return;
    }
    const blank = blankDraftWithDefaultStyles();
    setDraft(blank);
    // The baseline is the SAME object, so the four seeded rows do not read as
    // unsaved edits: a brand-new kit opens clean, and Save stays disabled until
    // the user actually types something.
    setBaseline(blank);
    seededRef.current = true;
  }, [brandId, templateId, brandQuery.data, templateQuery.data]);

  const dirty = useMemo(
    () => dirtySections(draft, baseline, BRAND_SECTIONS),
    [draft, baseline],
  );

  const isDirty = dirty.size > 0 || draft.name !== baseline.name;

  const patch = useCallback(
    <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const setName = useCallback((name: string) => {
    setDraft((current) => ({ ...current, name }));
  }, []);

  /** After a successful write: the server's answer becomes the new baseline. */
  const commit = useCallback(
    (saved: Brand, next: BrandDraft) => {
      setDraft(next);
      setBaseline(next);
      setInvalidSections(new Set());
      queryClient.setQueryData(flowBrandQueryKey(saved.brand_id), saved);
      void queryClient.invalidateQueries({ queryKey: FLOW_BRANDS_QUERY_KEY });
    },
    [queryClient],
  );

  const markInvalid = useCallback((sections: readonly BrandSectionId[]) => {
    setInvalidSections(new Set(sections));
  }, []);

  const state: BrandEditorState = brandId
    ? brandQuery.isLoading
      ? { status: "loading" }
      : isBrandNotFound(brandQuery.error)
        ? { status: "missing" }
        : brandQuery.isError
          ? { status: "error", retry: () => void brandQuery.refetch() }
          : { status: "ready" }
    : templateId && templateQuery.isLoading
      ? { status: "loading" }
      : { status: "ready" };

  return {
    state,
    draft,
    baseline,
    isDirty,
    dirty,
    invalidSections,
    patch,
    setName,
    commit,
    markInvalid,
  };
}
