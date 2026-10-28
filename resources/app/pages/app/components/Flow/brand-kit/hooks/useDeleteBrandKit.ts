"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useTranslate } from "@/hooks/useTranslate";
import { FLOW_BRANDS_QUERY_KEY, flowBrandQueryKey } from "@/lib/flow/flowQueryKeys";
import { BrandKitError, deleteBrand } from "@/lib/media/brandKit";
import { forgetBrand } from "@/lib/media/brandSelection";
import { forgetDefaultBrandIfDeleted } from "@/lib/media/defaultBrand";
import { useToastStore } from "@/lib/stores/useToastStore";

import { describeBrandKitError } from "../helpers";

/**
 * Delete one brand — 204, 409 while products still reference it, or 404 if it
 * is already gone.
 *
 * Only two of those three remove the card, and the 409 keeps the dialog open
 * showing the service's own sentence, which names the count.
 */
export function useDeleteBrandKit() {
  const { t } = useTranslate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const remove = useCallback(
    async (brandId: string): Promise<boolean> => {
      if (pending) return false;
      setPending(true);
      setFailedMessage(null);
      try {
        await deleteBrand(brandId);
      } catch (cause) {
        // Already gone is the outcome the user asked for.
        const gone = cause instanceof BrandKitError && cause.code === "not_found";
        if (!gone) {
          setFailedMessage(describeBrandKitError(cause, t));
          setPending(false);
          return false;
        }
      }

      // Evict it from every cache that remembers a brand, or the composer
      // keeps offering one that is a 404 and the next job asks the service to
      // render under a row that is gone.
      forgetBrand(brandId);
      forgetDefaultBrandIfDeleted(brandId);
      queryClient.removeQueries({ queryKey: flowBrandQueryKey(brandId) });
      void queryClient.invalidateQueries({ queryKey: FLOW_BRANDS_QUERY_KEY });

      // Deleting the CHOSEN brand leaves the workspace with none, and the
      // service does not promote a replacement — generating under a brand
      // nobody chose is worse than generating unbranded. The list says so on
      // this very page once it refetches.
      useToastStore.getState().push(t("appChat.brandKit.toast.deleted"), "info");
      setPending(false);
      return true;
    },
    [pending, queryClient, t],
  );

  return { remove, pending, failedMessage, clearFailure: () => setFailedMessage(null) };
}
