import { useCallback, useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkflowVariable, WorkflowVariablesConfig } from "@dogclaw-ad/workflow";

import { useTranslate } from "@/hooks/useTranslate";
import { useToastStore } from "@/lib/stores/useToastStore";
import {
  createVariable,
  deleteVariable,
  FlowApiError,
  listVariables,
  renameVariable,
  type CreateFlowVariableInput,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { ERROR_KEYS } from "../constants";
import { toWorkflowVariable } from "../helpers";

function variablesQuery(projectId: string) {
  return queryOptions({
    queryKey: ["flow-builder", "variables", projectId],
    queryFn: ({ signal }) => listVariables(projectId, signal),
    // A gating read: a failed load hides the feature instead of retrying behind it.
    retry: false,
  });
}

/**
 * The project's variables as the editor's `variables` prop, plus the picker it opens.
 * `config` is undefined without a project or when the list can't load.
 */
export function useWorkflowVariables(projectId?: string) {
  const { t } = useTranslate();
  const pushToast = useToastStore((state) => state.push);
  const queryClient = useQueryClient();
  const query = useQuery({ ...variablesQuery(projectId ?? ""), enabled: Boolean(projectId) });
  const [pickerOpen, setPickerOpen] = useState(false);

  const errorText = useCallback(
    (err: unknown, fallback: string) => {
      const key = err instanceof FlowApiError ? ERROR_KEYS[err.code] : undefined;
      return t(`appChat.flow.variables.errors.${key ?? fallback}`);
    },
    [t],
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: variablesQuery(projectId ?? "").queryKey }),
    [queryClient, projectId],
  );

  /** Saves from the picker; rejects with display copy the picker shows above its footer. */
  const create = useCallback(
    async (input: CreateFlowVariableInput) => {
      if (!projectId) return;
      try {
        await createVariable(projectId, input);
      } catch (err) {
        throw new Error(errorText(err, "saveFailed"));
      }
      await refresh();
    },
    [projectId, errorText, refresh],
  );

  const data = query.data;
  const items = useMemo(() => data?.map(toWorkflowVariable), [data]);
  const failed = query.isError;
  const loading = query.isPending;

  const config = useMemo<WorkflowVariablesConfig | undefined>(() => {
    if (!projectId || failed) return undefined;
    // Rename and delete report through a toast: the row just keeps its old state.
    const act = async (write: () => Promise<unknown>, fallback: string) => {
      try {
        await write();
      } catch (err) {
        pushToast(errorText(err, fallback), "error");
      }
      await refresh();
    };
    return {
      items,
      loading,
      onCreate: () => setPickerOpen(true),
      onRename: (variable: WorkflowVariable, name: string) =>
        act(() => renameVariable(projectId, variable.id, name), "renameFailed"),
      onDelete: (variable: WorkflowVariable) =>
        act(() => deleteVariable(projectId, variable.id), "deleteFailed"),
    };
  }, [projectId, failed, items, loading, errorText, refresh, pushToast]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  return { config, pickerOpen, closePicker, create };
}
