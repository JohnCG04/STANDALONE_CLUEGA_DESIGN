/**
 * Favorites on Workflow Builder projects — the rules both the Flow list page
 * and the Flow sidebar apply, in one dependency-free module (no React, no
 * router) so `node --test` can execute them.
 *
 * Backend contract (PATCH /flow-builder/projects/:id, GET ?favorite=):
 * - ONE flag per project, owned by its creator: anyone else who sends
 *   `favorite` gets a 403, so the star is only offered when
 *   `created_by === currentUserId`. Team-mates still SEE the creator's flag.
 * - Toggling does not bump `updated_at`, so a list sorted by updated_at keeps
 *   its order and the card can be patched in place from the response.
 * - `favorite=false` also matches projects created before the field existed.
 */

import { pathForFlowWorkspaceTab } from "./flowWorkspaceTab";

/** Query param that narrows the Projects tab to starred projects. */
export const FLOW_FAVORITES_PARAM = "favorites";

/**
 * Whether `?favorites=` asks for the starred list. Only the two spellings the
 * app itself writes count; anything else (or absent) is the full list, so a
 * stale or hand-edited link cannot strand the user on an empty filter.
 */
export const flowFavoritesOnlyFromParam = (
  value: string | null | undefined,
): boolean => value === "1" || value === "true";

/** The Projects tab, filtered to favorites or not. */
export const pathForFlowProjects = (favoritesOnly: boolean): string =>
  favoritesOnly
    ? `${pathForFlowWorkspaceTab("project")}&${FLOW_FAVORITES_PARAM}=1`
    : pathForFlowWorkspaceTab("project");

/**
 * Creator-only: the server answers 403 to anyone else, so the star is not
 * offered to them. A missing `created_by` (a legacy row, or an identity that
 * has not been read yet) is treated as "not mine".
 */
export function canToggleFlowFavorite(
  project: { created_by?: string },
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(currentUserId) && project.created_by === currentUserId;
}

/**
 * The same list with one project's flag changed — the optimistic update every
 * list surface applies while the PATCH is in flight. Returns the SAME array
 * when nothing changed, so cache writers can skip a no-op notification.
 */
export function withFlowFavorite<T extends { id: string; favorite: boolean }>(
  items: T[],
  id: string,
  favorite: boolean,
): T[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id || item.favorite === favorite) return item;
    changed = true;
    return { ...item, favorite };
  });
  return changed ? next : items;
}
