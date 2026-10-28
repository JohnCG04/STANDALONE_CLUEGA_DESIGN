/**
 * The technique "tool" routes:
 *
 *   /flow/tool/<slug>       — the App view (run the technique like an app)
 *   /flow/workflow/<slug>   — the Workflow view (the read-only canvas)
 *
 * Lives in lib/ (next to lib/app/projectRoute.ts) so the one thing that can
 * quietly break here — the shell not recognising the path as a Flow view, and
 * swapping the Flow sidebar for the chat one — is testable without mounting the
 * app.
 *
 * Three path segments on purpose: `/app/<x>` is claimed by "that's a session
 * id" and `/flow` by the workspace tabs, so nothing here can be mistaken for
 * either. Only `tool` and `workflow` are accepted as the middle segment —
 * `/flow/admin` is a standalone page that bypasses the shell, and must NOT
 * read as a tool route.
 *
 * The `<slug>` segment is the preset's URL slug for a TOOL (`is_tool`, e.g.
 * `/flow/tool/poster-animation`, loaded through
 * `GET /flow-presets/by-slug/<slug>`) and the preset's UUID for anything else
 * (loaded by id). `presetRouteSlug` picks one, `isUuidSegment` tells the loader
 * which endpoint to read from.
 */

export type FlowToolView = "app" | "workflow";

export interface FlowToolRoute {
  view: FlowToolView;
  slug: string;
}

export const FLOW_TOOL_PATH_PATTERN = /^\/flow\/(tool|workflow)\/([^/?#]+)$/;

/** RFC 4122 shape, case-insensitive — what `GET /flow-presets/:id` addresses. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VIEW_SEGMENT: Record<FlowToolView, string> = {
  app: "tool",
  workflow: "workflow",
};

/** Path of one technique's tool page. `view` defaults to the App view. */
export function flowToolPath(slug: string, view: FlowToolView = "app"): string {
  return `/flow/${VIEW_SEGMENT[view]}/${encodeURIComponent(slug)}`;
}

/**
 * The tool route a path addresses, or null for any other path — including a
 * bare `/flow/tool` (no subject) and anything deeper than three segments.
 */
export function flowToolRouteFromPath(pathname: string): FlowToolRoute | null {
  const match = FLOW_TOOL_PATH_PATTERN.exec(pathname);
  if (!match) return null;

  try {
    return {
      view: match[1] === "workflow" ? "workflow" : "app",
      slug: decodeURIComponent(match[2]),
    };
  } catch {
    // Malformed escape: treat it as no route rather than throwing during render.
    return null;
  }
}

/**
 * The segment a preset's tool URL carries: its slug when the preset is a TOOL
 * that has one (`is_tool` with a non-blank `slug`), otherwise its id. A regular
 * template — or a tool the backend has not slugged yet — stays reachable by id.
 */
export function presetRouteSlug(preset: {
  id: string;
  slug?: string;
  is_tool?: boolean;
}): string {
  const slug = preset.is_tool === true ? preset.slug?.trim() : "";
  return slug ? slug : preset.id;
}

export function isUuidSegment(value: string): boolean {
  return UUID_PATTERN.test(value);
}
