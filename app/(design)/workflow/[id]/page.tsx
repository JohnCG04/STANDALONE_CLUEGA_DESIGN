import { WorkflowEditorClient } from "@/components/workflow/WorkflowEditor";
import {
  FLOW_AGENT_PARAMS_PARAM,
  flowAgentParamsActive,
} from "@/lib/flow/flowAgentPrompt";
import {
  FLOW_PRESET_EDIT_PARAM,
  FLOW_TOOL_EDIT_PARAM,
} from "@/lib/flow/flowPresetEdit";

export default async function WorkflowByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // Whether the Flow Home launcher left parameters behind for us. Only the
  // flag rides the URL; the parameters themselves are in sessionStorage, which
  // the client below reads (see lib/flow/flowAgentPrompt.ts). Read here rather
  // than with `useSearchParams` so the editor subtree — which is the whole
  // screen — needs no Suspense boundary of its own.
  const flag = query[FLOW_AGENT_PARAMS_PARAM];
  // The catalog card the Flow admin's Edit workflow action sent us to, read the
  // same way — or the tool its Edit tool action did.
  const presetEdit = query[FLOW_PRESET_EDIT_PARAM];
  const toolEdit = query[FLOW_TOOL_EDIT_PARAM];
  return (
    <WorkflowEditorClient
      id={id}
      agentParamsActive={flowAgentParamsActive(
        typeof flag === "string" ? flag : null,
      )}
      presetEditId={typeof presetEdit === "string" ? presetEdit : undefined}
      toolEditId={typeof toolEdit === "string" ? toolEdit : undefined}
    />
  );
}
