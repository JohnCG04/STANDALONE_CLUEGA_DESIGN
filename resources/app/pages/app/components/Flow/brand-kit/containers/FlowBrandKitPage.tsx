"use client";

import { usePathname } from "next/navigation";

import { flowBrandKitRouteFromPath } from "@/lib/flow/flowBrandKitRoute";

import { BrandKitEditor } from "./BrandKitEditor";
import { BrandKitListPage } from "./BrandKitListPage";

/**
 * /flow/brand-kit and its two editor urls, as one dynamic chunk. The shell
 * passes no props, so the screen is read off the url here.
 *
 * `usePathname`, NEVER `useParams`: the editor adopts the url it earns from the
 * import with `history.replaceState` (see moveWithinBrandKit), and `useParams`
 * is the one hook that does not update under a patched-history move.
 *
 * No `key` on either branch either. That rewrite turns `new` into `detail`
 * WITHOUT a remount, which is the point — keying by brand id would unmount the
 * editor on the very rewrite that names it, losing the draft it just saved.
 */
export const FlowBrandKitPage = () => {
  const pathname = usePathname();
  const route = flowBrandKitRouteFromPath(pathname ?? "");

  if (!route || route.kind === "list") return <BrandKitListPage />;
  if (route.kind === "new") return <BrandKitEditor brandId={null} />;
  return <BrandKitEditor brandId={route.brandId} />;
};
