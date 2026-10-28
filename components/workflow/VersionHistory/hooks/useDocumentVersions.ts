import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteDocumentVersion,
  getDocumentVersion,
  listDocumentVersions,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";

/** A page's version list; `pageId` undefined is the legacy project-level document. */
function documentVersionsQuery(projectId: string, pageId?: string) {
  return queryOptions({
    queryKey: ["flow-builder", "document-versions", projectId, pageId ?? "document"],
    queryFn: ({ signal }) => listDocumentVersions(projectId, pageId, signal),
    // Every autosave may have added a version, so each open of the panel re-reads.
    refetchOnMount: "always",
  });
}

export function useDocumentVersions(projectId: string, pageId?: string) {
  return useQuery(documentVersionsQuery(projectId, pageId));
}

/** One version's full graph for the preview; a kept snapshot never changes, so it is cached. */
export function useDocumentVersion(projectId: string, pageId: string | undefined, version: number | null) {
  return useQuery({
    queryKey: ["flow-builder", "document-version", projectId, pageId ?? "document", version],
    queryFn: () => getDocumentVersion(projectId, pageId, version ?? 0),
    enabled: version !== null,
    staleTime: Infinity,
  });
}

/** Deletes one kept version, then re-reads the list. */
export function useDeleteDocumentVersion(projectId: string, pageId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => deleteDocumentVersion(projectId, pageId, version),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: documentVersionsQuery(projectId, pageId).queryKey,
      }),
  });
}
