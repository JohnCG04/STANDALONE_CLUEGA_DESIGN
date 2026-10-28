/**
 * How the Flow Home launcher hands its parameters to the chat drawer inside the
 * editor.
 *
 * `AgentLanding` (outside) renders no reply of its own: it collects a prompt,
 * the host mints a project and navigates, and `AgentChatPanel` (inside) picks
 * the prompt up as its `seed`.
 *
 * The parameters themselves travel in `sessionStorage`, not in the query
 * string: a brief can run to paragraphs, and the URL is the one place it must
 * not be — it is shared, logged, and capped in length. The URL carries only the
 * flag `?isActiveParams=true`, which says "there is a bag waiting in storage".
 * The inside reads the bag whole, and drops it as soon as it has it, so the same
 * request is never sent twice.
 *
 * Dependency-free (no React, no router) like the other lib/flow nav builders,
 * so the client launcher and the page that reads the flag share one spelling.
 */

/** The flag on the editor URL. Its value is never the payload — only `true`. */
export const FLOW_AGENT_PARAMS_PARAM = "isActiveParams";

/** Where the bag itself waits, for the one navigation it has to survive. */
export const FLOW_AGENT_PARAMS_KEY = "flow:agent-params";

/**
 * What the outside surface hands to the inside one.
 *
 * Everything the launcher collected travels together in this one object, so a
 * new field is added here and read back whole — not threaded through a route.
 */
export type FlowAgentParams = {
  /** The brief the user typed on the launcher. */
  prompt: string;
};

/** True when the URL claims a bag is waiting. */
export const flowAgentParamsActive = (value: string | null): boolean =>
  value === "true";

/**
 * Park `params` for the navigation that follows. False ⇒ storage refused them
 * (private mode, quota), which is the caller's signal not to raise the flag:
 * an editor that opens on a promise storage cannot keep is worse than one that
 * opens plain.
 */
export const stashFlowAgentParams = (params: FlowAgentParams): boolean => {
  try {
    sessionStorage.setItem(FLOW_AGENT_PARAMS_KEY, JSON.stringify(params));
    return true;
  } catch {
    return false;
  }
};

/**
 * The bag the outside left, or null when there is none to read — nothing
 * stashed, already consumed, or a payload that no longer parses.
 */
export const readFlowAgentParams = (): FlowAgentParams | null => {
  try {
    const raw = sessionStorage.getItem(FLOW_AGENT_PARAMS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FlowAgentParams> | null;
    if (!parsed || typeof parsed.prompt !== "string") return null;
    return { ...parsed, prompt: parsed.prompt };
  } catch {
    return null;
  }
};

/** Drop the bag. Called once the inside has it, so a refresh starts clean. */
export const clearFlowAgentParams = (): void => {
  try {
    sessionStorage.removeItem(FLOW_AGENT_PARAMS_KEY);
  } catch {
    // Nothing to do: unreadable storage holds nothing to leak either.
  }
};

/**
 * The editor route for `id`.
 *
 * Passing `params` STASHES them and raises the flag — this is the one writer of
 * the bag, so a caller cannot navigate with a flag and no payload behind it.
 */
export const pathForWorkflowEditor = (
  id: string,
  params?: FlowAgentParams,
): string => {
  const path = `/workflow/${encodeURIComponent(id)}`;
  const prompt = params?.prompt.trim();
  if (!params || !prompt) return path;
  if (!stashFlowAgentParams({ ...params, prompt })) return path;
  return `${path}?${FLOW_AGENT_PARAMS_PARAM}=true`;
};
