"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { FLOW_BRANDS_QUERY_KEY } from "@/lib/flow/flowQueryKeys";
import { type Brand } from "@/lib/media/brandKit";
import { rememberBrand } from "@/lib/media/brandSelection";
import { chooseDefaultBrand } from "@/lib/media/defaultBrand";

/**
 * Which brand the "Active" badge sits on, and the action that moves it.
 *
 * The badge follows the service's `is_default`, off the list this page already
 * fetched — never a value in this browser. "Which brand does this workspace
 * generate under" is a workspace decision: a local copy is one the user's other
 * machine never sees and a teammate cannot change.
 *
 * No brand carrying the flag is a real answer, not a gap: this workspace
 * renders unbranded until somebody chooses. The page says so rather than
 * picking one.
 *
 * Optimistic, deliberately. `PUT /ads/brands/{id}/default` is idempotent and
 * exclusive on the service side, so the worst a failed request leaves behind is
 * a badge in the wrong place for as long as the refetch takes — and blocking
 * the badge on a round trip is the worse trade.
 */
export function useActiveBrand(brands: readonly Brand[]) {
  const queryClient = useQueryClient();
  // The list is the source of truth. This is only the id in flight, so the
  // badge can move before the refetch lands, and it is dropped once it has —
  // on success AND on failure, which is what makes the badge settle on the
  // service's answer either way.
  const [pendingId, setPendingId] = useState("");

  const chosen = brands.find((brand) => brand.is_default) ?? null;

  const activate = useCallback(
    async (nextId: string): Promise<boolean> => {
      setPendingId(nextId);
      let ok = true;
      try {
        // Through `chooseDefaultBrand`, so the cache the submit path reads
        // hears about the write; `rememberBrand` is the composer's ambient
        // catalogue, which is a different cache with a different job.
        rememberBrand(await chooseDefaultBrand(nextId));
      } catch {
        ok = false;
      }
      await queryClient.invalidateQueries({ queryKey: FLOW_BRANDS_QUERY_KEY });
      setPendingId("");
      return ok;
    },
    [queryClient],
  );

  return { activeId: pendingId || chosen?.brand_id || "", activate };
}
