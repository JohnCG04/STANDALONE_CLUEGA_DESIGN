import {
  getDocument,
  getDocumentVersion,
  getPageDocument,
  saveDocument,
  savePageDocument,
  type FlowDocument,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { withCurrentHistories } from "./helpers";

/**
 * Write version `version` back as the page's document and return it as saved.
 * The caller must unmount the editor first, or its autosave would land over the result.
 */
export async function restoreDocumentVersion(
  projectId: string,
  pageId: string | undefined,
  version: number,
): Promise<FlowDocument> {
  const [snapshot, current] = await Promise.all([
    getDocumentVersion(projectId, pageId, version),
    pageId ? getPageDocument(projectId, pageId) : getDocument(projectId),
  ]);
  const graph = {
    nodes: withCurrentHistories(snapshot.nodes ?? [], current.nodes ?? []),
    edges: snapshot.edges ?? [],
    groups: snapshot.groups ?? [],
    viewport: snapshot.viewport ?? current.viewport,
    global_config: snapshot.global_config,
  };
  // Locked on the CURRENT version: the snapshot's own number is a label, not a lock.
  const saved = pageId
    ? await savePageDocument(projectId, pageId, graph, current.version)
    : await saveDocument(projectId, graph, current.version);
  return { ...current, ...graph, version: saved.version, updated_at: saved.updated_at };
}
