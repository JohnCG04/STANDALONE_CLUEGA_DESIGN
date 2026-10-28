/**
 * React-query keys shared between the Flow list page and the Flow sidebar.
 *
 * Named here, in a leaf module, so the two surfaces can invalidate each other's
 * caches without importing each other: the page's hook (useFlowProjects) must
 * not depend on a sidebar component module, and the sidebar must not depend on
 * the page.
 */

/** Prefix of every listed page of projects — see useFlowProjects. */
export const FLOW_PROJECTS_QUERY_PREFIX = ["flow", "projects"] as const;

/**
 * The sidebar's Recent Projects list. Deliberately NOT under the page's prefix:
 * the page answers a rename with `removeQueries(FLOW_PROJECTS_QUERY_PREFIX)`,
 * and removing a query while a mounted useQuery observes it does not notify
 * that observer — the row would keep the old name until the sidebar's next
 * unrelated re-render, then flash a skeleton while an empty rebuilt query
 * refetched. A sibling key keeps prefix-wide removals away from the live
 * observer; the paths that change the list (create, duplicate, rename, delete,
 * team switch) invalidate this key explicitly instead, which refetches in
 * place with the current rows still on screen.
 */
export const FLOW_RECENT_PROJECTS_QUERY_KEY = ["flow", "recent-projects"] as const;

/**
 * The sidebar's Favorites list — a sibling of the Recent key for the same
 * reason (a live observer that prefix-wide removals must not reach). Every
 * star toggle, wherever it happens, invalidates this key so the section
 * gains or loses the row without waiting out its stale time.
 */
export const FLOW_FAVORITE_PROJECTS_QUERY_KEY = ["flow", "favorite-projects"] as const;

/**
 * One preset with its graph, as the technique tool page reads it — keyed by the
 * URL segment (a slug, or the id while the backend has no slugs) so a page and
 * its Workflow view share one cache entry while the user flips between them.
 */
export const flowPresetDetailQueryKey = (segment: string) =>
  ["flow", "preset-detail", segment] as const;

/** The tool page's cost chip — `POST /jobs/estimate` for `n` outputs of `kind`. */
export const flowToolEstimateQueryKey = (kind: string, n: number) =>
  ["flow", "tool-estimate", kind, n] as const;

/** One run of a technique, polled by the tool page's result panel until terminal. */
export const flowWorkflowRunQueryKey = (workflowId: string, runId: string) =>
  ["flow", "workflow-run", workflowId, runId] as const;

/**
 * Every brand this tenant has — the Brand Kit list, and the row its editor
 * seeds from.
 *
 * Not team-keyed by hand: QueryProvider resets the whole cache on
 * ACTIVE_TEAM_CHANGED_EVENT, and a team switch is the only thing that can
 * change which tenant `GET /ads/brands` answers for.
 */
export const FLOW_BRANDS_QUERY_KEY = ["flow", "brands"] as const;

/**
 * One brand, as the editor reads it. A SIBLING of the list key rather than a
 * child, for the same reason FLOW_RECENT_PROJECTS_QUERY_KEY is one: removing a
 * prefix does not notify a mounted observer underneath it, so the editor would
 * sit on stale fields until an unrelated re-render. The paths that change a
 * brand invalidate both keys explicitly instead.
 */
export const flowBrandQueryKey = (brandId: string) =>
  ["flow", "brand", brandId] as const;

/**
 * The starter kits — `GET /ads/brand-kits/templates`. Authored content that
 * carries no tenant and is identical for everyone (brandkit.md §3), so this is
 * the one key here a team switch need not have dropped; dropping it anyway
 * costs one cheap refetch.
 */
export const FLOW_BRAND_TEMPLATES_QUERY_KEY = ["flow", "brand-templates"] as const;

/** The Game builder's drafts: the caller's game_build chat sessions. */
export const FLOW_GAMES_QUERY_KEY = ["flow", "games"] as const;

/** The caller's published games (`GET /game-presets`). Every publish change invalidates
 *  this prefix, which also holds the one-draft lookup `[..., sessionId]`. */
export const FLOW_GAME_PRESETS_QUERY_KEY = ["flow", "game-presets"] as const;

/** One game page's html and versions, keyed by document under this prefix. */
export const FLOW_GAME_DOCUMENT_QUERY_KEY = ["flow", "game-document"] as const;

/** The Google Fonts catalogue. Not under "flow/brands": a brand save must not
 *  invalidate a list that is the same for every tenant. */
export const FONT_CATALOGUE_QUERY_KEY = ["fonts", "catalogue"] as const;
