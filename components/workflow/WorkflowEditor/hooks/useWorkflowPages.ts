import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowPageItem, WorkflowPagesConfig } from "@dogclaw-ad/workflow";

import {
  createPage,
  deletePage,
  getPageDocument,
  renamePage,
  reorderPages,
  savePageDocument,
  type FlowPage,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { UNTITLED_PAGE } from "../constants";
import { nextPageName } from "../helpers";
import type { UseWorkflowPages, UseWorkflowPagesOptions } from "../types";

/**
 * Backs the headless Pages panel with `/projects/:id/pages…`: call the backend, then move state.
 * A switch only moves `activePageId` (the caller remounts); failures are logged, renames surfaced.
 */
export function useWorkflowPages(
  projectId?: string,
  options: UseWorkflowPagesOptions = {},
): UseWorkflowPages {
  const initialPages = options.pages;
  const { onRenameError } = options;
  const [items, setItems] = useState<FlowPage[]>(initialPages ?? []);
  /** The row the user picked; `undefined` = none yet, so the first one is open. */
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );
  const [creating, setCreating] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  // Keeps pre-request reads (next name, delete neighbor) current without re-creating handlers.
  const itemsRef = useRef<FlowPage[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Adopted during render, not in an effect: one render with no open page reads as a switch.

  const [adopted, setAdopted] = useState(initialPages);
  if (adopted !== initialPages) {
    setAdopted(initialPages);
    setItems(initialPages ?? []);
    setSelectedId(undefined);
  }

  // The list comes back in display order, so the first row opens by default.
  const activeId = selectedId !== undefined ? selectedId : items[0]?.id ?? null;

  const onSelectPage = useCallback((page: WorkflowPageItem) => {
    // The editor has already flushed the leaving page's autosave.
    setSelectedId(page.id);
  }, []);

  const onCreatePage = useCallback(() => {
    if (!projectId || creating) return;
    setCreating(true);
    createPage(projectId, nextPageName(itemsRef.current))
      .then((page) => {
        setItems((prev) => [...prev, page]);
        setSelectedId(page.id);
      })
      .catch((err) => console.error("[workflow] create page failed", err))
      .finally(() => setCreating(false));
  }, [projectId, creating]);

  const onRenamePage = useCallback(
    (page: WorkflowPageItem, name: string) => {
      if (!projectId) return;
      setBusy(page.id, true);
      renamePage(projectId, page.id, name)
        .then((updated) =>
          // The row keeps the old name until this lands — the editor's contract.
          setItems((prev) =>
            prev.map((row) =>
              row.id === page.id
                ? { ...row, ...updated, name: updated?.name ?? name }
                : row,
            ),
          ),
        )
        .catch((err) => {
          console.error("[workflow] rename page failed", err);
          onRenameError?.(err);
        })
        .finally(() => setBusy(page.id, false));
    },
    [projectId, setBusy, onRenameError],
  );

  const onDeletePage = useCallback(
    (page: WorkflowPageItem) => {
      if (!projectId) return;
      setBusy(page.id, true);
      deletePage(projectId, page.id)
        .then(() => {
          const index = itemsRef.current.findIndex((row) => row.id === page.id);
          const remaining = itemsRef.current.filter((row) => row.id !== page.id);
          setItems(remaining);
          // Deleting the open page falls to its neighbor; an unset selection already means row 1.
          setSelectedId((current) =>
            current === page.id
              ? remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id ??
                null
              : current,
          );
        })
        .catch((err) => console.error("[workflow] delete page failed", err))
        .finally(() => setBusy(page.id, false));
    },
    [projectId, setBusy],
  );

  // Client-side until `POST …/pages/:page_id/duplicate` ships; copies the last autosave only.

  const onDuplicatePage = useCallback(
    (page: WorkflowPageItem) => {
      if (!projectId) return;
      setBusy(page.id, true);
      void (async () => {
        try {
          const source = await getPageDocument(projectId, page.id);
          const copy = await createPage(projectId, `${page.name} (Copy)`);
          await savePageDocument(
            projectId,
            copy.id,
            {
              nodes: source.nodes ?? [],
              edges: source.edges ?? [],
              groups: source.groups ?? [],
              viewport: source.viewport,
              global_config: source.global_config,
            },
            // A page created a moment ago is at version 0.
            copy.version ?? 0,
          );
          const index = itemsRef.current.findIndex((row) => row.id === page.id);
          setItems((prev) => {
            const next = [...prev];
            next.splice(index < 0 ? next.length : index + 1, 0, copy);
            return next;
          });
          setSelectedId(copy.id);
        } catch (err) {
          console.error("[workflow] duplicate page failed", err);
        } finally {
          setBusy(page.id, false);
        }
      })();
    },
    [projectId, setBusy],
  );

  // Optimistic (the editor keeps no order, rows would snap back); the backend wants the full list.

  const onReorderPages = useCallback(
    (next: WorkflowPageItem[]) => {
      if (!projectId) return;
      const before = itemsRef.current;
      const byId = new Map(before.map((row) => [row.id, row]));
      const reordered = next
        .map((row) => byId.get(row.id))
        .filter((row): row is FlowPage => row != null);
      const seen = new Set(reordered.map((row) => row.id));
      const ordered = [...reordered, ...before.filter((row) => !seen.has(row.id))];
      if (ordered.length !== before.length) return;
      if (ordered.every((row, i) => row.id === before[i]?.id)) return;

      // An unset selection means "the first row"; pin it so a reorder never switches pages.
      setSelectedId((current) => (current === undefined ? before[0]?.id ?? null : current));
      setItems(ordered);
      reorderPages(
        projectId,
        ordered.map((row) => row.id),
      )
        .then((saved) => {
          if (saved.length) setItems(saved);
        })
        .catch((err) => {
          console.error("[workflow] reorder pages failed", err);
          setItems(before);
        });
    },
    [projectId],
  );

  const emptyLabel = options.emptyLabel;

  const config = useMemo<WorkflowPagesConfig>(
    () => ({
      items: items.map((page) => ({
        id: page.id,
        name: page.name || UNTITLED_PAGE,
        busy: busyIds.has(page.id),
      })),
      activeId: activeId ?? undefined,
      onSelectPage,
      onCreatePage,
      onRenamePage,
      onDuplicatePage,
      onDeletePage,
      onReorderPages,
      emptyLabel,
    }),
    [
      items,
      busyIds,
      activeId,
      onSelectPage,
      onCreatePage,
      onRenamePage,
      onDuplicatePage,
      onDeletePage,
      onReorderPages,
      emptyLabel,
    ],
  );

  return {
    config,
    enabled: initialPages != null,
    activePageId: activeId,
  };
}
