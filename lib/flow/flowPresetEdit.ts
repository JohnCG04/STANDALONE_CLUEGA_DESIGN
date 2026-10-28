/**
 * How the Flow admin table hands a catalog card to the editor.
 *
 * The Workflows tab's Edit action opens the preset's workflow (its own when this
 * account can open it, else a copy — see `resolvePresetWorkflow`) and names the
 * preset in the URL, so the editor opens its own Save Template wizard on it in
 * edit mode (`WorkflowEditor`'s `publishEdit`) — media picked on the canvas.
 *
 * Carried in the URL rather than a store, exactly like the agent prompt seed
 * next to it: a refresh or a pasted link still opens the same card.
 *
 * Dependency-free (no React, no router) so the client table and the server page
 * that reads it share one spelling. The Tools tab's Edit action has its own
 * param (`?tool=`) below — a different action, opening the Save Tool wizard.
 */

export const FLOW_PRESET_EDIT_PARAM = "preset";

/** The editor route for `workflowId`, in edit mode on `presetId`'s card. */
export const pathForWorkflowPresetEdit = (
  workflowId: string,
  presetId: string,
): string =>
  `/workflow/${encodeURIComponent(workflowId)}` +
  `?${FLOW_PRESET_EDIT_PARAM}=${encodeURIComponent(presetId)}`;

/**
 * The tool twin of {@link FLOW_PRESET_EDIT_PARAM}. Edit workflow and Edit tool
 * are two separate actions with two wizards (Save Template vs Save Tool), so
 * the URL names which one the editor opens.
 */
export const FLOW_TOOL_EDIT_PARAM = "tool";

/** The editor route for `workflowId`, in edit mode on `toolId`'s tool. */
export const pathForWorkflowToolEdit = (
  workflowId: string,
  toolId: string,
): string =>
  `/workflow/${encodeURIComponent(workflowId)}` +
  `?${FLOW_TOOL_EDIT_PARAM}=${encodeURIComponent(toolId)}`;

/** The admin tabs a URL may open on (`/flow/admin?tab=…`). */
export type FlowAdminTab = "presets" | "tools" | "categories" | "industries";

export const FLOW_ADMIN_TAB_PARAM = "tab";

/** Where an edit-mode panel's "Back to admin" lands — the tab it came from. */
export const pathForFlowAdmin = (tab?: FlowAdminTab): string =>
  tab && tab !== "presets"
    ? `/flow/admin?${FLOW_ADMIN_TAB_PARAM}=${tab}`
    : "/flow/admin";

export const isFlowAdminTab = (value: unknown): value is FlowAdminTab =>
  value === "presets" ||
  value === "tools" ||
  value === "categories" ||
  value === "industries";
