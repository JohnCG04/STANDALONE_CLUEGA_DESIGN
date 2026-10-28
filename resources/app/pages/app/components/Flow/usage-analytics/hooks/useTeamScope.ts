"use client";

// One TanStack Query hook per dashboard block, NOT one mega-hook: per-block
// error isolation is a stated requirement (a failing chart must not blank the
// stat cards), and the blocks have different parameter footprints — a shared
// key would refetch everything on any filter change. Every key carries the
// active team (usage is per tenant, the requests will carry X-Team-Id), and
// every queryFn threads its AbortSignal into the source.

import { useActiveTeam } from "@/hooks/useActiveTeam";

/**
 * Usage is per tenant, so every block's query key carries the active team (the
 * requests will carry X-Team-Id) and nothing fetches until it is known.
 */
export function useTeamScope() {
  const { activeId, loading } = useActiveTeam();
  return { teamId: activeId, enabled: !loading && activeId !== null };
}
