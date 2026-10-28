import type { MediaLibraryItem } from "./wire";

/**
 * The gateway path that deletes a row, or `null` when none exists. There is no
 * unified delete endpoint — each store owns its own:
 *
 *   object   → /objects?id=… (falls back to ?object_path=… for a row old
 *              enough to still carry one; every row written since bytes moved
 *              to the storage service has no object_path at all)
 *   artifact → /artifacts/{artifact_id}   (also used for a creative that deduped
 *              onto an artifact)
 *   creative → none; the catalog exposes no DELETE.
 */
export function deletePathFor(item: MediaLibraryItem): string | null {
  if (item.origin === "object") {
    if (item.rowId) return `/objects?id=${encodeURIComponent(item.rowId)}`;
    if (item.objectPath) {
      return `/objects?object_path=${encodeURIComponent(item.objectPath)}`;
    }
  }
  if (item.artifactId) return artifactDeletePath(item.artifactId);
  return null;
}

export function artifactDeletePath(artifactId: string): string {
  return `/artifacts/${encodeURIComponent(artifactId)}`;
}
