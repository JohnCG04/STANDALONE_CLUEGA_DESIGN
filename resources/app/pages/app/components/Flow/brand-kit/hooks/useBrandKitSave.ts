"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useTranslate } from "@/hooks/useTranslate";
import {
  flowBrandKitDetailPath,
  moveWithinBrandKit,
} from "@/lib/flow/flowBrandKitRoute";
import {
  draftAfterSave,
  saveExistingBrand,
  saveNewBrand,
  type Brand,
  type BrandDraft,
} from "@/lib/media/brandKit";
import { chooseDefaultBrand } from "@/lib/media/defaultBrand";
import { rememberBrand } from "@/lib/media/brandSelection";
import { useToastStore } from "@/lib/stores/useToastStore";

import { describeBrandKitError, sectionsForError } from "../helpers";
import type { BrandSectionId } from "../types";

type Options = {
  onSaved: (saved: Brand, next: BrandDraft) => void;
  onInvalid: (sections: readonly BrandSectionId[]) => void;
};

/**
 * Save Changes. Two things here are load-bearing:
 *
 * 1. The import is latched in a REF, checked and set before the `await`. An
 *    `isSaving` state flag lands a tick later, so a double-click would slip two
 *    imports through and mint two brands — and deleting the spare can 409.
 * 2. The url is adopted with `window.history.replaceState`, never
 *    `router.replace`. `/new` and `/[brandId]` are different Next segments, so
 *    a router navigation unmounts this editor the instant the import returns.
 *    `replace`, not `push`, so Back reaches the LIST rather than a draft whose
 *    Save would import a second brand.
 */
export function useBrandKitSave({ onSaved, onInvalid }: Options) {
  const { t } = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importedRef = useRef(false);

  const save = useCallback(
    async (draft: BrandDraft) => {
      if (isSaving) return;
      const isCreate = !draft.brandId;
      if (isCreate && importedRef.current) return;
      if (isCreate) importedRef.current = true;

      setIsSaving(true);
      setError(null);
      try {
        const saved = isCreate
          ? await saveNewBrand(draft)
          : await saveExistingBrand(draft);

        const next = draftAfterSave(draft, saved);
        onSaved(saved, next);

        // The composer's pill and a restored image block read this catalogue
        // outside React, so it has to hear about the write directly.
        rememberBrand(saved);
        if (isCreate) {
          // A brand you just made becomes the one images follow — the flat
          // form's behaviour, preserved. On an EDIT it deliberately does not:
          // the default is a workspace decision, and opening a colleague's kit
          // to fix a typo is not a decision to generate under it.
          void chooseDefaultBrand(saved.brand_id).catch(() => {
            // Best-effort. The kit is saved either way, and the default is one
            // click away on the list — failing the save over it would be worse.
          });

          const to = flowBrandKitDetailPath(saved.brand_id);
          if (!moveWithinBrandKit(pathname, to, "replace")) router.replace(to);
        }

        useToastStore
          .getState()
          // "info", explicitly: push() defaults to the ERROR tone, which is how
          // the flat form shipped a green "saved" as a red alert.
          .push(
            t(isCreate ? "appChat.brandKit.toast.created" : "appChat.brandKit.toast.saved"),
            "info",
          );

        // §4: `unreadable_logos` is a one-shot signal with no later channel —
        // those marks will simply not appear on renders.
        if (saved.unreadable_logos.length > 0) {
          useToastStore
            .getState()
            .push(
              t("appChat.brandKit.logo.unreadable").replace(
                "{count}",
                String(saved.unreadable_logos.length),
              ),
              "error",
            );
        }
      } catch (cause) {
        // A refused write must not lose the draft. §8's moderation runs at write
        // time, so this is the user finding out while editing — nothing
        // navigates and nothing resets.
        setError(describeBrandKitError(cause, t));
        onInvalid(sectionsForError(cause));
        // The import did not land, so let a corrected draft try again.
        if (isCreate) importedRef.current = false;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, onInvalid, onSaved, pathname, router, t],
  );

  return { save, isSaving, error, clearError: () => setError(null) };
}
