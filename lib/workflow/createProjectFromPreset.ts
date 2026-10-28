// The Flow admin's Edit action for a catalog row whose own workflow this account
// cannot open (deleted, in the publisher's tenant, or never linked): mint a
// workflow in the caller's workspace from the graph the preset stores, so the
// editor's publish wizard has a canvas to edit it on. Same flow-builder dance as
// createProjectFromImage.
//
// Deliberately not `POST /flow-presets/:id/use`: that refuses drafts and counts
// the clone as a use, and an operator opening a row to edit it is neither.

import {
  createProject,
  getDocument,
  saveDocument,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import {
  getPreset,
  presetGraph,
} from "@/resources/app/pages/app/components/Flow/services/flow-presets.service";

/** Create the copy and return its project id. Saving the wizard then republishes
 *  the preset with this project as its workflow, so the next edit opens it. */
export async function createWorkflowProjectFromPreset(
  presetId: string,
): Promise<string> {
  const detail = await getPreset(presetId);
  const { nodes, edges } = presetGraph(detail);
  const project = await createProject(
    detail.name.en || detail.name.vi || detail.name.zh || "Untitled",
  );
  const document = await getDocument(project.id);
  await saveDocument(
    project.id,
    {
      nodes,
      edges,
      groups: detail.groups ?? detail.document?.groups ?? [],
      viewport: detail.viewport ??
        detail.document?.viewport ?? { x: 0, y: 0, zoom: 1 },
      global_config: detail.global_config ?? document.global_config ?? {},
    },
    document.version,
  );
  return project.id;
}
