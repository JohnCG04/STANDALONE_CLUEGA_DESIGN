"use client";

import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  getDocument,
  getPageDocument,
  getProject,
  listPages,
  listPageJobs,
  listProjects,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { primeConversationList } from "../../agent/conversations";
import { RECENT_PROJECTS_LIMIT } from "../constants";
import type { WorkflowBootstrapData, WorkflowBootstrapState } from "../types";
import { loadInitialAssets } from "./useWorkflowAssets";
import { prewarmWorkflowModels } from "./useWorkflowModels";

/** Swallow a non-essential load: log it and hand back `undefined`. */
function optional<T>(promise: Promise<T>, what: string): Promise<T | undefined> {
  return promise.catch((err) => {
    console.error(`[workflow] bootstrap: ${what} failed`, err);
    return undefined;
  });
}

// Not abortable: the promise is shared (StrictMode's double mount is a second caller).
async function fetchBootstrap(
  projectId: string,
  queryClient: QueryClient,
): Promise<WorkflowBootstrapData> {
  // Wave 1: only the project is required; the rest has a fallback or its own hook refetches it.
  const [project, pages, assets, recentProjects] = await Promise.all([
    getProject(projectId),
    optional(listPages(projectId), "pages").then((list) => list ?? null),
    optional(loadInitialAssets(projectId), "assets"),
    optional(
      listProjects({
        limit: RECENT_PROJECTS_LIMIT,
        sort: "updated_at",
        order: "desc",
      }).then((result) => result.items),
      "recent projects",
    ),
    // Shares the model-catalog cache with the flow list, so this is usually a no-op.
    optional(prewarmWorkflowModels(queryClient), "model catalogs"),
    optional(primeConversationList(projectId), "conversations"),
  ]);

  // Wave 2 depends on which page opens; its job ledger is per page, so it rides along.
  const activePageId = pages?.[0]?.id ?? null;
  const [document, jobs] = await Promise.all([
    activePageId
      ? getPageDocument(projectId, activePageId)
      : getDocument(projectId),
    activePageId
      ? optional(listPageJobs(projectId, activePageId), "jobs")
      : Promise.resolve(undefined),
  ]);

  return { project, pages, activePageId, document, jobs, assets, recentProjects };
}

// Same-tick mounts share one load per project; cleared once settled so a reopen re-reads.
const inflight = new Map<string, Promise<WorkflowBootstrapData>>();

export function loadWorkflowBootstrap(
  projectId: string,
  queryClient: QueryClient,
): Promise<WorkflowBootstrapData> {
  const pending = inflight.get(projectId);
  if (pending) return pending;

  const run = fetchBootstrap(projectId, queryClient);
  inflight.set(projectId, run);
  const clear = () => {
    // The reference check keeps a newer run from being clobbered.
    if (inflight.get(projectId) === run) inflight.delete(projectId);
  };
  void run.then(clear, clear);
  return run;
}

/**
 * Holds the spinner until the project, pages, open graph, assets and catalogs have landed,
 * so the editor mounts once: React Flow reads `defaultNodes`/`defaultEdges` only at mount.
 */
export function useWorkflowBootstrap(projectId?: string): WorkflowBootstrapState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<WorkflowBootstrapState>({ status: "loading" });

  useEffect(() => {
    if (!projectId) {
      setState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    loadWorkflowBootstrap(projectId, queryClient)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err) => {
        console.error("[workflow] bootstrap failed", err);
        if (!cancelled) setState({ status: "missing" });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, queryClient]);

  return state;
}
