"use client";

import useSWR from "swr";

import { listCompanyMembers, type CompanyMember } from "@/lib/cdp/directoryClient";
import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { FACETS_STALE_MS } from "../constants";
import { useTeamScope } from "./useTeamScope";

/**
 * Who the ids in the ledger belong to — GET /api/v1/company/members.
 *
 * The cost book stores a member's id and nothing else: it has no user
 * directory, so `/ai-spend` and the user facet both answer in UUIDs. The
 * roster is the join that turns those back into a face and a name.
 *
 * Read through the shared `listCompanyMembers`, which caches the answer for
 * five minutes across every surface that needs it, so the ledger costs no
 * extra request on a page that has already drawn a member picker. Held at the
 * facets' staleness for the same reason: a roster moves when someone joins the
 * company, not per interaction.
 *
 * A failure is deliberately NOT surfaced. The rows fall back to the id they
 * already had (see `memberOf`), which is exactly what they showed before the
 * roster existed — an unreachable directory must not blank a spending table.
 */
export function useUsageMembers(): {
  members: Map<string, CompanyMember>;
  isLoading: boolean;
} {
  const { teamId, enabled } = useTeamScope();

  const { data, isLoading } = useSWR(
    enabled ? usageSwrKeys.members(teamId) : null,
    async () => new Map((await listCompanyMembers()).map((member) => [member.id, member])),
    { dedupingInterval: FACETS_STALE_MS },
  );

  return { members: data ?? EMPTY_ROSTER, isLoading };
}

/** One shared empty map, so a render before the roster lands does not hand the
 *  table a new object identity on every pass. */
const EMPTY_ROSTER: Map<string, CompanyMember> = new Map();
