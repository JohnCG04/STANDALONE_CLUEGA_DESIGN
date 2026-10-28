"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listProjects,
  type FlowProject,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { RECENT_PROJECTS_LIMIT } from "../constants";

/**
 * The "Open Project" submenu's infinite scroll, seeded by the bootstrap's first page.
 * A failed `loadMore` keeps `hasMore` on, so the next scroll retries it.
 */
export function useRecentProjects(initial?: FlowProject[]) {
  const [items, setItems] = useState<FlowProject[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);

  useEffect(() => {
    setItems(initial ?? []);
    pageRef.current = 1;
    // A full first page suggests more; the first loadMore learns the truth from pagination.
    setHasMore((initial?.length ?? 0) >= RECENT_PROJECTS_LIMIT);
  }, [initial]);

  const loadMore = useCallback(async () => {
    const next = pageRef.current + 1;
    const { items: page, pagination } = await listProjects({
      page_no: next,
      limit: RECENT_PROJECTS_LIMIT,
      sort: "updated_at",
      order: "desc",
    });
    pageRef.current = next;
    // Dedupe: a project touched between page reads can reappear on the next one.
    setItems((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...page.filter((p) => !seen.has(p.id))];
    });
    setHasMore(next < pagination.total_pages);
  }, []);

  return { items, hasMore, loadMore };
}
