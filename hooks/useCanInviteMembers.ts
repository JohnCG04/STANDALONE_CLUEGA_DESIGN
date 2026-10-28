"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { getCompanyRoles, TeamApiError } from "@/lib/teams/cdp-teams";

/**
 * Whether this caller may invite someone into the tenant — which is also the
 * one "company administrator" answer the Team tab reads, on both sub-tabs.
 *
 * Asked with GET /api/v1/company/roles because that endpoint sits behind the
 * SAME backend guard as the invitation itself (requireCompanyRoleAdmin). Any
 * other 403 on this screen is a different gate and would be the wrong question:
 * GET /api/v1/team/directory, for instance, also refuses a viewer, but it does
 * so for its own reasons and could start allowing them without the invite
 * endpoint following. The Directory once also read `org_role` off the token for
 * one of its buttons, and the Members tab used the team role for another; three
 * different answers to one question on one screen.
 *
 * A shared query, so the two sub-tabs and the invite dialog ask once.
 */
export const canInviteMembersQuery = queryOptions({
  queryKey: ["teams", "can-invite-members"] as const,
  queryFn: async (): Promise<boolean> => {
    try {
      await getCompanyRoles();
      return true;
    } catch (err) {
      // Only a 403 is an answer about permission. A network failure or a 500
      // says nothing about who this person is, and hiding the control then
      // would tell them they lack a right they may well hold -- so the button
      // stays, and the backend remains the thing that decides.
      return !(err instanceof TeamApiError && err.status === 403);
    }
  },
  staleTime: 5 * 60_000,
  retry: false,
});

/**
 * `checked` exists so the caller can keep the control hidden until the answer
 * is in, rather than showing it and snatching it away a moment later.
 */
export function useCanInviteMembers(): { canInvite: boolean; checked: boolean } {
  const { data, isPending } = useQuery(canInviteMembersQuery);
  return { canInvite: data === true, checked: !isPending };
}
