/**
 * The workspaces the /flow route hosts (Home, Projects, Usage Analytics), and
 * how they are spelled in the URL.
 *
 * Pulled out of the Flow page so the Flow sidebar can answer "which tab is open?"
 * with the SAME rule the page uses to render it. Two copies of this mapping is how
 * a sidebar highlight ends up lying: the page reads `?tab=technique`, the sidebar
 * reads something slightly different, and the wrong row lights up.
 *
 * Dependency-free on purpose (no React, no router): it is imported by pure nav
 * builders that run under `node --test`.
 */

/** Historical route export; the same bare URL now renders Flow Home. */
export const FLOW_LIST_ROUTE = "/flow";

/** Semantic name for the bare Flow Home route. */
export const FLOW_HOME_ROUTE = FLOW_LIST_ROUTE;

/**
 * "usage" is Usage Analytics — the credit-usage dashboard. It only tracks Flow,
 * so it is a tab of this route (and a Flow sidebar row) rather than an AppView
 * with a route and a chat-sidebar entry of its own.
 */
export type FlowWorkspaceTab = "home" | "project" | "usage";

export const FLOW_WORKSPACE_TABS: FlowWorkspaceTab[] = [
  "home",
  "project",
  "usage",
];

/**
 * The tab a `?tab=` value names. "home" is the bare route, so it is never
 * spelled in the URL — anything unknown (or absent) falls back to it, which is
 * also what keeps a stale deep link from rendering an empty workspace.
 */
export const flowWorkspaceTabFromParam = (
  value: string | null | undefined,
): FlowWorkspaceTab =>
  FLOW_WORKSPACE_TABS.find((tab) => tab !== "home" && tab === value) ?? "home";

/** The URL for a tab — the bare route for Home, `?tab=…` for the rest. */
export const pathForFlowWorkspaceTab = (tab: FlowWorkspaceTab): string =>
  tab === "home" ? FLOW_HOME_ROUTE : `${FLOW_HOME_ROUTE}?tab=${tab}`;
