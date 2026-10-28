// Canvas nodes as `@` targets: the exact way to say "this one" among near-identical cards.

import type { WorkflowGraphApi } from "@dogclaw-ad/workflow";

import { fromProxiedMediaUrl } from "../shared/mediaProxy";
import { MAX_ROWS, SNIPPET_CAP, VIDEO_SUFFIXES } from "./constants";
import type { Mentionable } from "./types";

/**
 * Whether this result is a clip; a media result has no kind, so the URL decides.
 * Un-proxied first: inside the editor the extension sits in the `?url=` query string.
 */
function isVideoUrl(url: string): boolean {
  const real = fromProxiedMediaUrl(url).split("?")[0].toLowerCase();
  return VIDEO_SUFFIXES.some((suffix) => real.endsWith(suffix));
}

/** A node type as a person would say it: `removeBackground` → "Remove Background". */
export function labelForType(type: string): string {
  const words = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What tells one card of a type from the next: its prompt words, then its key setting. */
function distinguisher(data: Record<string, unknown> | undefined): string {
  if (!data) return "";

  const text = data.prompt ?? data.text;
  if (typeof text === "string" && text.trim()) {
    const words = text.trim().replace(/\s+/g, " ");
    return words.length > SNIPPET_CAP
      ? `${words.slice(0, SNIPPET_CAP)}…`
      : words;
  }

  // Settings live flat on generators and nested on transforms, so look in both.
  const params = (data.params ?? {}) as Record<string, unknown>;
  for (const key of [
    "aspectRatio",
    "rotation",
    "elevation",
    "zoom",
    "duration",
    "gridSize",
    "position",
    "exposure",
    "contrast",
  ]) {
    const value = params[key] ?? data[key];
    if (value !== undefined && value !== null && value !== "") {
      return `${key} ${value}`;
    }
  }
  return "";
}

/**
 * Name every node, disambiguating repeats by whatever differs between them.
 * A label the planner or the user gave always wins.
 */
export function nameNodes(
  nodes: readonly { id: string; type?: string; data?: Record<string, unknown> }[],
): Mentionable[] {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.type ?? "", (counts.get(node.type ?? "") ?? 0) + 1);

  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const type = node.type ?? "";
    const index = (seen.get(type) ?? 0) + 1;
    seen.set(type, index);

    const result = node.data?.result as
      | { url?: unknown; urls?: unknown[] }
      | undefined;
    const finished =
      typeof result?.url === "string" && result.url
        ? result.url
        : typeof result?.urls?.[0] === "string"
          ? (result.urls[0] as string)
          : undefined;
    // No thumbnail for clips or voice cards (extensionless audio): an `<img>` renders them broken.
    const sound = node.data?.kind === "audio";
    const thumbnailUrl =
      finished && !sound && !isVideoUrl(finished) ? finished : undefined;

    // A label the user typed always wins: they renamed it to stop counting Resizes.
    const own = node.data?.label;
    let label: string;
    if (typeof own === "string" && own.trim()) {
      label = own.trim();
    } else if ((counts.get(type) ?? 0) > 1) {
      const tell = distinguisher(node.data);
      label = tell
        ? `${labelForType(type)} · ${tell}`
        : `${labelForType(type)} ${index}`;
    } else {
      label = labelForType(type);
    }

    return {
      id: node.id,
      label,
      kind: type,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };
  });
}

/**
 * The mention methods, bound to the editor on screen.
 * A `null` handle (remount, launcher) answers with an empty list, never a stale one.
 */
export function mentionActions(graphApi: {
  readonly current: WorkflowGraphApi | null;
}) {
  return {
    list(query: string): Mentionable[] {
      const api = graphApi.current;
      if (!api) return [];
      try {
        const all = nameNodes(api.getNodes()).filter(
          // Group frames are layout. Pointing at one says nothing about the work.
          (m) => m.kind !== "group",
        );
        const needle = query.trim().toLowerCase();
        const matched = needle
          ? all.filter(
              (m) =>
                m.label.toLowerCase().includes(needle) ||
                (m.kind ?? "").toLowerCase().includes(needle),
            )
          : all;
        // Newest first, cut from the far end, so `@` then Enter picks the card just made.
        return matched.slice(-MAX_ROWS).reverse();
      } catch {
        return [];
      }
    },

    /** Bring the picked node into view; `revealNode` both selects and centres it. */
    reveal(id: string): void {
      try {
        graphApi.current?.revealNode(id);
      } catch {
        // Deleted between listing and picking; the chip still stands.
      }
    },

    /** Mark exactly these nodes; the whole set each time, so no stale mark is left behind. */
    highlight(ids: readonly string[]): void {
      try {
        graphApi.current?.highlightNodes(ids);
      } catch {
        // Decoration. Never worth interrupting a message being written.
      }
    },
  };
}
