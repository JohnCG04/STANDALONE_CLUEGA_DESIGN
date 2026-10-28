/**
 * The Brand Kit's routes.
 *
 *   /flow/brand-kit                      — the list: this tenant's brands
 *                                              and the sample templates
 *   /flow/brand-kit/new[?template=<id>]  — the editor, before the first save
 *   /flow/brand-kit/<brand_id>           — the editor for a saved brand
 *
 * Lives in lib/ (beside flowToolRoute.ts, for the same reason) so the one thing
 * that can quietly break here — the shell not recognising the path as a Flow
 * view, and swapping the Flow sidebar for the chat one — is testable without
 * mounting the app.
 *
 * `new` is a STATIC sibling of `[brandId]`, not a `?new=1` on the list: Next
 * resolves a static segment first, so the two view resolvers stay
 * pathname-only. A search param in the view branch is something the
 * three-way-mirror test cannot express, and no other Flow view needs one.
 */

export const FLOW_BRAND_KIT_ROUTE = "/flow/brand-kit";

/**
 * The pre-save editor. Because the segment is reserved, no brand can be
 * addressed as "new" — the service mints `brand_<hex>` ids, so nothing can
 * collide with it today. If ids ever become user-chosen, move this to a
 * segment an id cannot be (e.g. `_new`).
 */
export const FLOW_BRAND_KIT_NEW_ROUTE = `${FLOW_BRAND_KIT_ROUTE}/new`;

/**
 * `/flow/brand-kit`, plus AT MOST one more segment.
 *
 * A pattern rather than `startsWith`, and that is the whole point: a prefix
 * match also swallows `/flow/brand-kitchen` and `/flow/brand-kit-admin`,
 * and a path a resolver claims by accident renders under the chat sidebar. The
 * separator is required and the tail is anchored, so only a real child segment
 * matches — `[^/?#]+` additionally rules out `/flow/brand-kit/a/b`.
 *
 * The optional trailing slash is Next's own canonical-redirect window: a hard
 * navigation to `/flow/brand-kit/` must read as the list rather than flash
 * the chat rail for a frame before the redirect lands.
 */
const BRAND_KIT_PATH_PATTERN = /^\/flow\/brand-kit(?:\/([^/?#]+))?\/?$/;

/** Does this path address the Brand Kit — its list, or either editor? */
export function isFlowBrandKitPath(pathname: string): boolean {
  return BRAND_KIT_PATH_PATTERN.test(pathname);
}

/** Which of the three Brand Kit screens a path asks for. */
export type FlowBrandKitRoute =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "detail"; brandId: string };

/**
 * The Brand Kit screen a path addresses, or null for any other path.
 *
 * A malformed escape yields the LIST rather than throwing: this runs inside a
 * render, and a bad url is not worth taking the page down for.
 */
export function flowBrandKitRouteFromPath(
  pathname: string,
): FlowBrandKitRoute | null {
  const match = BRAND_KIT_PATH_PATTERN.exec(pathname);
  if (!match) return null;

  const segment = match[1];
  if (!segment) return { kind: "list" };
  if (segment === "new") return { kind: "new" };

  try {
    return { kind: "detail", brandId: decodeURIComponent(segment) };
  } catch {
    return { kind: "list" };
  }
}

/** Path of one saved brand's editor. */
export function flowBrandKitDetailPath(brandId: string): string {
  return `${FLOW_BRAND_KIT_ROUTE}/${encodeURIComponent(brandId)}`;
}

/**
 * Path of the pre-save editor, optionally seeded from a template.
 *
 * `template` is a SEED, not state: the editor reads it once on mount into its
 * draft and never writes it back, which is why it is a search param rather than
 * a segment.
 */
export function flowBrandKitNewPath(templateId?: string): string {
  return templateId
    ? `${FLOW_BRAND_KIT_NEW_ROUTE}?template=${encodeURIComponent(templateId)}`
    : FLOW_BRAND_KIT_NEW_ROUTE;
}

/**
 * Moves between two Brand Kit urls WITHOUT a router navigation. Returns false
 * when either side is not a Brand Kit path, in which case the caller must fall
 * back to `router.push` / `router.replace`.
 *
 * `window.history`, not `router.replace` — the same call and the same reason as
 * `moveWithinChatShell` in resources/app/pages/app/routes.ts. `/new` and
 * `/[brandId]` are DIFFERENT Next segments, so the segment value is part of the
 * router tree's cache key: replacing one with the other throws the page subtree
 * away and rebuilds it after an RSC round trip. That happens at the exact moment
 * `POST /ads/brands/import` returns, so the editor that just saved is unmounted
 * mid-toast — losing the draft, the scroll position, the open section and any
 * in-flight logo upload, then remounting to re-fetch the brand it just created.
 *
 * Nothing about the two urls needs a different tree: both render the same
 * `<AppPage>`, which derives everything from `usePathname`. Next patches the
 * history API to dispatch ACTION_RESTORE with the CURRENT tree, so the canonical
 * url updates while the mounted tree stays put.
 *
 * The one constraint that follows: the Brand Kit must read `usePathname()`, never
 * `useParams()` — that is the hook a patched-history move leaves stale.
 */
export function moveWithinBrandKit(
  from: string,
  to: string,
  mode: "push" | "replace",
): boolean {
  if (typeof window === "undefined") return false;
  if (!isFlowBrandKitPath(from) || !isFlowBrandKitPath(to)) return false;
  // Already there: handled here rather than left to the caller, so a redundant
  // call cannot add a duplicate history entry Back has to be pressed twice for.
  if (from === to) return true;
  if (mode === "push") window.history.pushState(null, "", to);
  else window.history.replaceState(null, "", to);
  return true;
}
