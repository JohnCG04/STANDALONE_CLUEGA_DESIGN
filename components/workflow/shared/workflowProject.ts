import type {
  AutoSaveResult,
  WorkflowDocument,
  WorkflowTemplatePayload,
  WorkflowTemplateSeed,
  WorkflowToolPayload,
  WorkflowToolSeed,
} from "@dogclaw-ad/workflow";
import {
  FlowApiError,
  getDocument,
  getPageDocument,
  saveDocument,
  savePageDocument,
  updateProject,
  type FlowNode,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import {
  createPreset,
  isPresetVisibleOnHome,
  republishPreset,
  type CreatePresetInput,
  type CreateToolPresetInput,
  type FlowPreset,
} from "@/resources/app/pages/app/components/Flow/services/flow-presets.service";
import { translateStatic } from "@/hooks/useTranslate";
import { omitKeys, unproxyGraphNodes } from "./helpers";
import { documentToGraph } from "./flowGraph";
import { toJobInputUrl } from "./mediaProxy";
import { ARTIFACT_MESSAGES } from "./messages";

/** The server's page after a 409, as the editor merges it (`AutoSaveConflictError.latest`). */
type LatestDocument = ReturnType<typeof documentToGraph> & { version: number };

/** Autosave to the page's document, or the project-level one with no `pageId`. A 409 rethrows a
 *  tagged error carrying the server's page as loaded (`latest`), so the editor can merge. */
export async function autoSaveDocument(
  projectId: string,
  doc: WorkflowDocument,
  pageId?: string,
): Promise<AutoSaveResult> {
  const nodes = unproxyGraphNodes<FlowNode>(doc.nodes);
  const graph = {
    nodes,
    edges: doc.edges,
    groups: doc.groups,
    viewport: doc.viewport,
    global_config: doc.global_config,
  };

  try {
    const result = pageId
      ? await savePageDocument(projectId, pageId, graph, doc.expected_version)
      : await saveDocument(projectId, graph, doc.expected_version);
    return { version: result.version, updatedAt: result.updated_at };
  } catch (err) {
    if (err instanceof FlowApiError && err.code === "flow_version_conflict") {
      let latest: LatestDocument | undefined;
      try {
        const current = pageId
          ? await getPageDocument(projectId, pageId)
          : await getDocument(projectId);
        // The same conversion a page load uses, so the merge compares like with like.
        latest = { ...documentToGraph(current), version: current.version };
      } catch {
        // Best-effort: without it the editor still retries, just re-fetching.
      }
      const conflict = new Error("flow_version_conflict") as Error & {
        code: string;
        latestVersion?: number;
        latest?: LatestDocument;
      };
      conflict.code = "flow_version_conflict";
      conflict.latestVersion = latest?.version;
      conflict.latest = latest;
      throw conflict;
    }
    throw err;
  }
}

/** The Save Template wizard's payload in `POST /flow-presets` terms (never `is_tool`). Cover urls
 *  are pinned to the PUBLIC artifact origin: every tenant renders them, and relative ones 400. */
export function buildWorkflowTemplatePresetInput(
  template: WorkflowTemplatePayload,
  workflowId?: string,
  /** False OMITS `industries`: one unknown slug rejects the whole write. */
  hasIndustries = false,
): CreatePresetInput {
  const firstMedia = (template.media_items ?? [])[0];
  const primaryType = template.primary_type ?? firstMedia?.type;
  const primarySrc = template.primary_src ?? firstMedia?.url ?? null;
  if (!primaryType || !primarySrc) {
    // The server would 400 with no cover; fail with a message the dialog can show.
    throw new Error(ARTIFACT_MESSAGES.templateCoverRequired);
  }

  const poster =
    template.thumbnail_url ??
    (primaryType === "video" ? (firstMedia?.poster ?? null) : primarySrc);
  const mediaItems = (template.media_items ?? []).map((item) => {
    const assetId = item.asset_id?.trim();
    return {
      url: toJobInputUrl(item.url),
      type: item.type,
      ...(assetId ? { asset_id: assetId } : {}),
    };
  });

  return {
    name: template.name,
    description: template.description,
    category: template.category,
    ...(hasIndustries ? { industries: template.industries ?? [] } : {}),
    // Only when the editor sent them: an older build must not wipe tags on a republish.
    ...(Array.isArray(template.tags) ? { tags: template.tags } : {}),
    status: template.status,
    primary_type: primaryType,
    primary_src: toJobInputUrl(primarySrc),
    ...(poster ? { thumbnail_url: toJobInputUrl(poster) } : {}),
    media_items: mediaItems,
    ...(template.media_effect
      ? { media_effect: template.media_effect }
      : {}),
    sort_order: template.sort_order,
    // The wizard's "feature on home page" toggle is the backend's Home switch.
    show_on_home: template.is_featured === true,
    display_type: template.card_type,
    io: template.io,
    ...(workflowId ? { workflow_project_id: workflowId } : {}),
    nodes: unproxyGraphNodes<FlowNode>(template.nodes),
    edges: template.edges,
    groups: template.groups,
    viewport: template.viewport,
    global_config: template.global_config,
  };
}

/** The Save Tool wizard's payload: tool_inputs/outputs verbatim, only the thumbnail pinned.
 *  No cover guard (prompt-only tools are valid); `status` is sent, since `draft` 404s the page. */
export function buildWorkflowToolPresetInput(
  tool: WorkflowToolPayload,
  workflowId?: string,
): CreateToolPresetInput {
  const thumbnail = tool.thumbnail_url?.trim();
  return {
    name: tool.name,
    description: tool.description,
    slug: tool.slug.trim(),
    // Omitted rather than sent empty: the backend binds this as a URL, and `""` is a 400.
    ...(thumbnail ? { thumbnail_url: toJobInputUrl(thumbnail) } : {}),
    visibility: tool.visibility,
    is_tool: true,
    status: "published",
    tool_inputs: tool.tool_inputs,
    tool_outputs: tool.tool_outputs,
    io: tool.io,
    ...(workflowId ? { workflow_project_id: workflowId } : {}),
    nodes: unproxyGraphNodes<FlowNode>(tool.nodes),
    edges: tool.edges,
    groups: tool.groups,
    viewport: tool.viewport,
    global_config: tool.global_config,
  };
}

export async function saveWorkflowTemplate(
  template: WorkflowTemplatePayload,
  workflowId?: string,
  /** See `buildWorkflowTemplatePresetInput` — false omits `industries` entirely. */
  hasIndustries = false,
): Promise<void> {
  await createPreset(
    buildWorkflowTemplatePresetInput(template, workflowId, hasIndustries),
  ).catch(rethrowTemplateNameTaken);
}

/** The wizard shows a thrown message as-is, so a taken name arrives in the user's language. */
function rethrowTemplateNameTaken(err: unknown): never {
  if (err instanceof FlowApiError && err.code === "flow_preset_name_taken") {
    throw new Error(translateStatic("appChat.flow.templateNameTaken"));
  }
  throw err;
}

/** The Save Tool wizard's sink — same endpoint and operator gate as a template. */
export async function saveWorkflowTool(
  tool: WorkflowToolPayload,
  workflowId?: string,
): Promise<void> {
  await createPreset(buildWorkflowToolPresetInput(tool, workflowId));
}

/** A stored template as the Save Template wizard's seed. A legacy single-cover
 *  row carries no `media_items`, so its cover stands in for the gallery. */
export function templateSeedOf(preset: FlowPreset): WorkflowTemplateSeed {
  const mediaItems = preset.media_items?.length
    ? preset.media_items
    : preset.primary_src
      ? [{ url: preset.primary_src, type: preset.primary_type }]
      : [];
  return {
    name: preset.name,
    description: preset.description,
    category: preset.category ?? "",
    industries: preset.industries ?? [],
    tags: preset.tags ?? [],
    card_type: preset.card_type,
    // The wizard's "feature on home page" toggle is the backend's Home switch.
    is_featured: isPresetVisibleOnHome(preset),
    media_items: mediaItems,
    media_effect: preset.media_effect ?? null,
  };
}

/** A stored tool as the Save Tool wizard's seed. */
export function toolSeedOf(preset: FlowPreset): WorkflowToolSeed {
  return {
    name: preset.name,
    description: preset.description,
    slug: preset.slug ?? "",
    thumbnail_url: preset.thumbnail_url ?? preset.primary_src ?? null,
    visibility: preset.visibility,
    tool_inputs: preset.tool_inputs,
    tool_outputs: preset.tool_outputs,
  };
}

/** Edit mode's Save Template sink: republished over `preset`, keeping its status and sort order;
 *  the workflow link moves to this canvas, so an edit copy becomes the preset's workflow. */
export async function republishWorkflowTemplate(
  preset: FlowPreset,
  template: WorkflowTemplatePayload,
  workflowId: string,
  /** See `buildWorkflowTemplatePresetInput` — false omits `industries` entirely. */
  hasIndustries = false,
): Promise<FlowPreset> {
  const input = buildWorkflowTemplatePresetInput(template, workflowId, hasIndustries);
  return republishPreset(preset.id, {
    ...omitKeys(input, ["status", "sort_order"]),
    ...(preset.version > 0 ? { expected_version: preset.version } : {}),
  }).catch(rethrowTemplateNameTaken);
}

/** Edit mode's Save Tool sink — {@link republishWorkflowTemplate}'s twin. */
export async function republishWorkflowTool(
  preset: FlowPreset,
  tool: WorkflowToolPayload,
  workflowId: string,
): Promise<FlowPreset> {
  const input = buildWorkflowToolPresetInput(tool, workflowId);
  return republishPreset(preset.id, {
    ...omitKeys(input, ["status"]),
    ...(preset.version > 0 ? { expected_version: preset.version } : {}),
  });
}

/** The editor rolls its optimistic header back if this rejects, so let it throw. */
export async function renameWorkflowProject(
  projectId: string,
  title: string,
): Promise<void> {
  await updateProject(projectId, { name: title });
}
