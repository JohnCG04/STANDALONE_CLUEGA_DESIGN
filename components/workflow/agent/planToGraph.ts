// Plans carry no positions, so layout is derived here; bad parts are dropped and reported.

import type { Edge, Node } from "@xyflow/react";
import { optimizeLayout } from "@dogclaw-ad/workflow";
import { buildNodeManifest, NESTED_PARAM_TYPES } from "../shared/workflowCompat";
import {
  APPEND_GAP,
  EDGE_TYPE,
  MAX_SLIDES,
  NODE_H,
  NODE_W,
  NOT_A_PARAM,
} from "./constants";
import { str } from "./helpers";
import type { PlanDocument, PlanPatch, PlanToGraphResult } from "./types";

/** A canvas node's type, for placing a patch's fields where the card reads them. */
function typeOf(existing: readonly Node[], id: string): string {
  return existing.find((n) => n.id === id)?.type ?? "";
}

/** Safety net: a Text Prompt card reads `data.text`, so a planned `prompt` is moved there. */
function normalizeText(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== "textPrompt") return config;
  const text = str(config.text);
  const prompt = str(config.prompt);
  if (text || !prompt) return config;
  // Rebuilt without `prompt`: leaving both reads as a stale duplicate.
  const rest = { ...config };
  delete rest.prompt;
  return { ...rest, text: prompt };
}

// Knob kinds per node type, built once: `buildNodeManifest` probes every registered type.
let paramKinds: Map<string, Map<string, string>> | null = null;
function kindsFor(type: string): Map<string, string> {
  if (!paramKinds) {
    paramKinds = new Map(
      buildNodeManifest().map((n) => [
        n.type,
        new Map(
          Object.entries(n.params ?? {}).map(([name, spec]) => [
            name,
            String((spec as { type?: unknown }).type ?? ""),
          ]),
        ),
      ]),
    );
  }
  return paramKinds.get(type) ?? new Map();
}

/**
 * Make a planned value the type its knob declares: a model writes `"90"` as readily as `90`.
 * An unreadable value is dropped, so the card's default applies instead of a fake zero.
 */
export function coerceTypes(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const kinds = kindsFor(type);
  if (!kinds.size) return config;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const kind = kinds.get(key);
    if (kind === "number" && typeof value !== "number") {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }
    if (kind === "boolean" && typeof value !== "boolean") {
      if (value === "true" || value === "false") out[key] = value === "true";
      else if (typeof value === "number") out[key] = value !== 0;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Nest settings under `data.params` for types that read there; their mount erases flat ones. */
function normalizeParams(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!NESTED_PARAM_TYPES.has(type)) return config;

  const nested = (config.params ?? {}) as Record<string, unknown>;
  const flat: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "params") continue;
    if (NOT_A_PARAM.has(key)) rest[key] = value;
    else flat[key] = value;
  }
  if (!Object.keys(flat).length) return config;

  // Nested wins on a collision: it is where the card looks.
  return { ...rest, params: { ...flat, ...nested } };
}

/**
 * The canvas's edges with the proposal's laid over them.
 * An input handle holds one wire, so an incoming edge replaces the one on its port.
 */
export function mergeEdges(
  existing: readonly Edge[],
  incoming: readonly Edge[],
): Edge[] {
  const claimed = new Set(
    incoming.map((e) => `${e.target}:${e.targetHandle ?? ""}`),
  );
  return [
    ...existing.filter(
      (e) => !claimed.has(`${e.target}:${e.targetHandle ?? ""}`),
    ),
    ...incoming,
  ];
}

/**
 * Convert a planner document into canvas nodes and edges, ADDED to `existing`.
 * `existing` seeds the id space (no collisions) and places the new graph clear of it.
 */
export function planToGraph(
  doc: PlanDocument,
  existing: readonly Node[] = [],
): PlanToGraphResult {
  const dropped: string[] = [];
  const patches: PlanPatch[] = [];
  const taken = new Set(existing.map((n) => n.id));

  // plan id → canvas id. Identity for everything that did not collide.
  const idMap = new Map<string, string>();
  const nodes: Node[] = [];

  // Patches name canvas nodes, so they skip the id-collision rewrite below.
  for (const raw of doc.updates ?? []) {
    const id = str(raw?.id);
    if (!id) continue;
    if (!taken.has(id)) {
      dropped.push(`update for unknown node '${id}'`);
      continue;
    }
    const config = { ...(raw.config ?? {}) };
    // Same normalisers as a new node: a patch on the wrong key is silently ignored by the card.
    const patchType = typeOf(existing, id);
    patches.push({
      id,
      data: normalizeParams(
        patchType,
        coerceTypes(patchType, normalizeText(patchType, config)),
      ),
    });
  }

  for (const raw of doc.nodes ?? []) {
    const planId = str(raw?.id);
    const type = str(raw?.type);
    if (!planId || !type) {
      dropped.push(`a node with no ${planId ? "type" : "id"} was skipped`);
      continue;
    }
    if (idMap.has(planId)) {
      dropped.push(`duplicate node id '${planId}' was skipped`);
      continue;
    }

    let id = planId;
    while (taken.has(id)) id = `${planId}-${taken.size}`;
    taken.add(id);
    idMap.set(planId, id);

    nodes.push({
      id,
      type,
      // Overwritten by `optimizeLayout`; React Flow needs a position before the first measure.
      position: { x: 0, y: 0 },
      data: normalizeParams(
        type,
        coerceTypes(type, normalizeText(type, { ...(raw.config ?? {}) })),
      ),
    });
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();

  // Endpoints: planned nodes via `idMap` (which follows renames) first, then canvas nodes.
  const resolve = (id: string | undefined): string | undefined =>
    id ? (idMap.get(id) ?? (taken.has(id) ? id : undefined)) : undefined;

  for (const raw of doc.edges ?? []) {
    const source = resolve(str(raw?.source));
    const target = resolve(str(raw?.target));
    const targetHandle = str(raw?.target_handle);

    if (!source || !target) {
      dropped.push(
        `an edge referencing an unknown node (${raw?.source} → ${raw?.target}) was skipped`,
      );
      continue;
    }
    if (!targetHandle) {
      // The port is never implied by the node pair (Face Swap takes two images).
      dropped.push(`an edge into '${target}' had no target handle and was skipped`);
      continue;
    }

    const sourceHandle = str(raw?.source_handle) ?? null;
    const key = `${source}:${sourceHandle ?? ""}->${target}:${targetHandle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    edges.push({
      id: `e-${key}`,
      type: EDGE_TYPE,
      source,
      target,
      targetHandle,
      ...(sourceHandle ? { sourceHandle } : {}),
    });
  }

  // Lay out only the new graph: the user's existing cards are theirs to place.
  const laid = optimizeLayout(nodes, edges);
  const placed = place(laid, edges, existing);

  return { nodes: placed, edges, patches, dropped };
}

/** A card's footprint, from what React Flow measured or a sensible guess. */
function sizeOf(node: Node): { w: number; h: number } {
  return {
    w:
      (node.measured?.width as number | undefined) ??
      (node.width as number | undefined) ??
      NODE_W,
    h:
      (node.measured?.height as number | undefined) ??
      (node.height as number | undefined) ??
      NODE_H,
  };
}

/** Where the new block goes: beside the card that feeds it, else below everything. */
function place(
  laid: readonly Node[],
  edges: readonly Edge[],
  existing: readonly Node[],
): Node[] {
  if (!existing.length || !laid.length) return [...laid];

  const isNew = new Set(laid.map((n) => n.id));
  const byId = new Map(existing.map((n) => [n.id, n]));

  // The right-most feeding card, so the block lands clear of all its inputs.
  let anchor: Node | undefined;
  for (const e of edges) {
    if (isNew.has(e.source) || !isNew.has(e.target)) continue;
    const from = byId.get(e.source);
    if (!from) continue;
    if (!anchor || from.position.x > anchor.position.x) anchor = from;
  }

  if (!anchor) {
    const dy = bottomOf(existing) + APPEND_GAP;
    return laid.map((n) => ({ ...n, position: { ...n.position, y: n.position.y + dy } }));
  }

  const left = Math.min(...laid.map((n) => n.position.x));
  const top = Math.min(...laid.map((n) => n.position.y));
  const dx = anchor.position.x + sizeOf(anchor).w + APPEND_GAP - left;
  let dy = anchor.position.y - top;

  // Slide down, not right, until clear: the wire stays short and the column readable.
  const others = existing.filter((n) => n.id !== anchor.id);
  for (let attempt = 0; attempt < MAX_SLIDES; attempt += 1) {
    const boxes = laid.map((n) => {
      const { w, h } = sizeOf(n);
      return { x: n.position.x + dx, y: n.position.y + dy, w, h };
    });
    const clash = others.some((o) => {
      const { w, h } = sizeOf(o);
      return boxes.some(
        (b) =>
          b.x < o.position.x + w &&
          b.x + b.w > o.position.x &&
          b.y < o.position.y + h &&
          b.y + b.h > o.position.y,
      );
    });
    if (!clash) break;
    dy += NODE_H + APPEND_GAP;
  }

  return laid.map((n) => ({
    ...n,
    position: { x: n.position.x + dx, y: n.position.y + dy },
  }));
}

/** The lowest edge of the existing graph, so a new one lands clear of it. */
function bottomOf(nodes: readonly Node[]): number {
  let bottom = 0;
  for (const n of nodes) {
    const height =
      (n.measured?.height as number | undefined) ??
      (n.height as number | undefined) ??
      0;
    bottom = Math.max(bottom, n.position.y + height);
  }
  return bottom;
}
