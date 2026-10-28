import type { Edge, Node } from "@xyflow/react";

import type {
  FlowDocument,
  FlowEdge,
  FlowGroup,
  FlowNode,
  FlowViewport,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { proxyNodeImageUrls } from "./mediaProxy";

/** The saved pan/zoom to reopen on, or `null` to fit-to-view: also for the identity `{0, 0, 1}`
 *  that new projects (`lib/workflow/createProjectFrom*`) and never-panned pages carry. */
export function documentViewport(
  doc: Pick<Partial<FlowDocument>, "viewport">,
): FlowViewport | null {
  const viewport: unknown = doc.viewport;
  if (!viewport || typeof viewport !== "object") return null;
  const { x, y, zoom } = viewport as Partial<
    Record<"x" | "y" | "zoom", unknown>
  >;
  if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    return null;
  }
  if (zoom <= 0) return null;
  if (x === 0 && y === 0 && zoom === 1) return null;
  return { x, y, zoom };
}

/** A persisted document, or a preset's bare `{ nodes, edges }`, → React Flow nodes/edges with
 *  `node.config` merged into `data`. `autoSaveDocument` is the inverse. */
export function documentToGraph(
  doc: Pick<Partial<FlowDocument>, "nodes" | "edges" | "groups">,
): {
  nodes: Node[];
  edges: Edge[];
} {
  return {
    // Groups FIRST: React Flow resolves a child's relative position only if its parent precedes it.
    nodes: [
      ...(doc.groups ?? []).map(groupToReactFlow),
      ...(doc.nodes ?? []).map(nodeToReactFlow),
    ],
    edges: (doc.edges ?? []).map(edgeToReactFlow),
  };
}

/** Mirrors the package's `deserializeGraph`. `size` is the EXPANDED frame: a collapsed group keeps
 *  it in `data.expandedSize` and carries no size, so the folded card sizes itself. */
function groupToReactFlow(group: FlowGroup): Node {
  const data = {
    ...(group.title !== undefined ? { label: group.title } : {}),
    ...(group.color !== undefined ? { color: group.color } : {}),
  };
  const base = { id: group.id, type: "group", position: group.position };
  const size = { width: group.size?.width, height: group.size?.height };
  if (group.collapsed) {
    return { ...base, data: { ...data, collapsed: true, expandedSize: size } };
  }
  return { ...base, data, width: size.width, height: size.height };
}

function nodeToReactFlow(node: FlowNode): Node {
  const data: Record<string, unknown> = { ...(node.config ?? {}) };
  if (node.prompt !== undefined) data.prompt = node.prompt;
  if (node.output !== undefined) data.output = node.output;
  if (node.asset_ref !== undefined) data.asset_ref = node.asset_ref;

  const rfNode: Node = {
    id: node.id,
    type: node.type,
    position: node.position,
    // Proxied so the editor can render AND read pixels without tripping CORS.
    data: proxyNodeImageUrls(data) ?? data,
  };
  if (node.parent_group) rfNode.parentId = node.parent_group;
  return rfNode;
}

function edgeToReactFlow(edge: FlowEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_handle,
    targetHandle: edge.target_handle,
    data: edge.metadata,
  };
}
