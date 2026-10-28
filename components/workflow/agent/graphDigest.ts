// The open canvas for the model. Results are counted, never listed: a recited URL is a leak.

import type { WorkflowGraphApi } from "@dogclaw-ad/workflow";
import { toJobInputUrl } from "../shared/mediaProxy";
import { digestGraph } from "../shared/workflowCompat";
import { MAX_NODE_IMAGES } from "./constants";
import type { NodeImage } from "./types";

/**
 * Read the live canvas via the editor's `digestGraph`, or undefined with no editor.
 * "Could not look" and "looked, it is empty" must stay different answers.
 */
export function digestFromApi(api: WorkflowGraphApi | null): unknown {
  if (!api) return undefined;

  try {
    const nodes = api.getNodes();
    const edges = api.getEdges();
    return digestGraph({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        config: n.data,
        parent_group: n.parentId,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        source_handle: e.sourceHandle ?? undefined,
        target_handle: e.targetHandle ?? undefined,
      })),
    });
  } catch {
    // A digest is an extra: a turn answerable without it must not fail because of it.
    return undefined;
  }
}

/**
 * The canvas's finished pictures, keeping the last in run order (the outputs).
 * Sent beside the digest, never in it: the service resolves them to bytes, not prompt text.
 */
export function imagesFromApi(
  api: WorkflowGraphApi | null,
  limit = MAX_NODE_IMAGES,
): NodeImage[] {
  if (!api) return [];

  try {
    const out: NodeImage[] = [];
    for (const node of api.getNodes()) {
      // A voice card holds sound: sent as a picture it would only confuse the model.
      if (node.data?.kind === "audio") continue;
      const result = node.data?.result as
        | { url?: unknown; urls?: unknown[] }
        | undefined;
      if (!result) continue;
      // Only a node's first result: one picture per node says more about the graph.
      const url =
        typeof result.url === "string" && result.url
          ? result.url
          : typeof result.urls?.[0] === "string"
            ? (result.urls[0] as string)
            : "";
      // Un-proxy: media-ai reads a host-relative proxy path as a filename and drops the picture.
      if (url) out.push({ node_id: node.id, url: toJobInputUrl(url) });
    }
    return out.slice(-limit);
  } catch {
    // Pictures are an extra; an unreadable graph must not fail the turn.
    return [];
  }
}
