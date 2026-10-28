import { cdpApiConfig } from "@/config/cdp-api";
import { cdpFetch } from "@/lib/ai-agent/cluega-session-auth";
import { isSnapshotFresh } from "@/lib/query/cachedSnapshot";

/** A team the signed-in user belongs to (Manus-style parallel team). */
export interface Team {
  id: string;
  name: string;
  slug: string;
  teamRole: string;
}

/** A member of a team. */
export interface TeamMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  teamRole: string;
  status: string;
}

/** A user of the company (tenant), for the add-member picker. */
export interface CompanyUser {
  id: string;
  email: string;
}

/** Error carrying the HTTP status so callers can show friendly messages. */
export class TeamApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TeamApiError";
    this.status = status;
  }
}

async function teamData(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: unknown };
  if (!res.ok) {
    const err = body.error;
    const msg =
      typeof err === "string"
        ? err
        : err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : `Request failed: ${res.status}`;
    throw new TeamApiError(msg, res.status);
  }
  const data = body.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** getTeamMembers lists the members of a team. */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/teams/${encodeURIComponent(teamId)}/members`, {
    cache: "no-store",
  });
  const data = await teamData(res);
  const list = Array.isArray(data.members) ? data.members : [];
  return list
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      userId: str(m.user_id),
      email: str(m.email),
      firstName: str(m.first_name),
      lastName: str(m.last_name),
      teamRole: str(m.team_role),
      status: str(m.status),
    }))
    .filter((m) => m.userId !== "");
}

/**
 * How long a fetched roster is reused. Reference data for a picker: the tenant's
 * user list changes in the mid-platform, not from anywhere in this app.
 */
const COMPANY_MEMBERS_FRESH_MS = 5 * 60_000;

/** The last successful roster. Module scope: one per page load. */
let companyMembersCache: { value: CompanyUser[]; at: number } | null = null;

/**
 * getCompanyMembers lists the tenant's users (member picker).
 *
 * Cached because the settings modal unmounts a tab when the user switches away, so
 * every return to Access & Permissions (or Team) asked for the roster again. Only a
 * success is remembered, so a failed request cannot leave the picker empty for the
 * rest of the session.
 *
 * NOTE: `directoryClient.listCompanyMembers` reads the SAME endpoint with its own
 * cache and its own parsing — that one takes `items`/`members`/a bare array and
 * returns a display name, this one takes `teammates` and returns the email. Two
 * clients disagreeing about one payload is worth collapsing, but not while changing
 * caching: merging them means picking one parse, and the shape is documented as
 * unstable across upstream versions.
 */
export async function getCompanyMembers(): Promise<CompanyUser[]> {
  if (
    companyMembersCache &&
    isSnapshotFresh(companyMembersCache.at, Date.now(), COMPANY_MEMBERS_FRESH_MS)
  ) {
    return companyMembersCache.value;
  }

  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/company/members`, { cache: "no-store" });
  const data = await teamData(res);
  const list = Array.isArray(data.teammates) ? data.teammates : [];
  const members = list
    .filter((u): u is Record<string, unknown> => !!u && typeof u === "object")
    .map((u) => ({ id: str(u.id), email: str(u.email) }))
    .filter((u) => u.id !== "");
  companyMembersCache = { value: members, at: Date.now() };
  return members;
}

/**
 * A company role — what the token's `org_role` is minted from.
 *
 * NOT the same thing as `Team.teamRole` above. A team role governs one team's
 * workspace; this one decides whether the whole backend treats you as an
 * administrator. They share the words "admin" and "member", which is exactly
 * why changing one and expecting the other to follow does not work.
 */
export interface CompanyRole {
  id: string;
  /** Display name as the tenant sees it (a tenant may rename a system role). */
  name: string;
  /** The stable slug the backend compares against: admin | operator | viewer. */
  slug: string;
  /** Always "cdp" here — the same slugs exist for other products. */
  service: string;
  description: string;
  /** How many people hold it, which can exceed the preview below. */
  memberCount: number;
  /** The first few holders, for a "who is this" line without a second request. */
  memberPreviews: { id: string; name: string; email: string }[];
}

/**
 * getCompanyRoles lists the tenant's CDP company roles and who holds each.
 *
 * Administrators only — the backend answers 403 for anyone else. Who holds
 * which company role is the answer to "who can do anything here", so it is not
 * ordinary directory data.
 *
 * memberPreviews carries EVERY holder here, not the first three: the panel this
 * feeds lets an administrator move people between roles, and it cannot draw a
 * member whose name was cut off.
 */
export async function getCompanyRoles(): Promise<CompanyRole[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/company/roles`, { cache: "no-store" });
  const data = await teamData(res);
  const list = Array.isArray(data.roles) ? data.roles : [];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      service: str(r.service),
      description: str(r.description),
      memberCount: typeof r.member_count === "number" ? r.member_count : 0,
      memberPreviews: (Array.isArray(r.member_previews) ? r.member_previews : [])
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .map((m) => ({ id: str(m.id), name: str(m.name), email: str(m.email) }))
        .filter((m) => m.id !== ""),
    }))
    .filter((r) => r.id !== "");
}

/** Creates a tenant-scoped CDP company role. The CDP backend requires admin. */
export async function createCompanyRole(name: string, description?: string): Promise<void> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/company/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), description: description?.trim() ?? "" }),
  });
  await teamData(res);
}

/**
 * assignCompanyRole puts members into one CDP company role.
 *
 * A REPLACE within CDP: each named user ends up holding this role and loses
 * whatever CDP role they had. Their roles in other products are untouched.
 * Administrators only; the backend answers 403 for anyone else.
 */
export async function assignCompanyRole(roleId: string, userIds: string[]): Promise<void> {
  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/company/roles/${encodeURIComponent(roleId)}/members`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: userIds }),
    },
  );
  await teamData(res);
}

/** addTeamMember adds an existing tenant user to a team with a role. */
export async function addTeamMember(teamId: string, userId: string, teamRole: string): Promise<void> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/teams/${encodeURIComponent(teamId)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, team_role: teamRole }),
  });
  await teamData(res);
}

/** updateTeamMember changes a member's role. */
export async function updateTeamMember(teamId: string, userId: string, teamRole: string): Promise<void> {
  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team_role: teamRole }) },
  );
  await teamData(res);
}

/** removeTeamMember removes a member from a team. */
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  await teamData(res);
}

/** createTeam creates a new team (company admin only; backend enforces). */
export async function createTeam(name: string): Promise<void> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await teamData(res);
}

/** getMyTeams returns the teams the signed-in user belongs to (team switcher). */
/**
 * Query key for the signed-in user's teams. Exported so the fetch and any
 * invalidation (creating, renaming or leaving a team) name the same key.
 */
export const MY_TEAMS_QUERY_KEY = ["teams", "me"] as const;

export async function getMyTeams(): Promise<Team[]> {
  // No `cache: "no-store"`: freshness is governed by the query cache's staleTime
  // now, and the endpoint sends no Cache-Control, so the flag only guaranteed a
  // round-trip per mount without buying any correctness.
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/me/teams`);
  const body = (await res.json().catch(() => ({}))) as {
    data?: { teams?: unknown[] };
    teams?: unknown[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${res.status}`);
  }
  const list = body.data?.teams ?? body.teams ?? [];
  return (Array.isArray(list) ? list : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      id: String(t.id ?? ""),
      name: typeof t.name === "string" ? t.name : "",
      slug: typeof t.slug === "string" ? t.slug : "",
      teamRole: typeof t.team_role === "string" ? t.team_role : "",
    }))
    .filter((t) => t.id !== "");
}
