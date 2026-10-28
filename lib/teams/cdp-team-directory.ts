import { cdpApiConfig } from "@/config/cdp-api";
import { cdpFetch } from "@/lib/ai-agent/cluega-session-auth";

import { TeamApiError } from "./cdp-teams";

/**
 * The paged, searchable tenant roster behind Settings › Team › "Quản lý chi tiết".
 *
 * A different population from `cdp-teams.ts`, and the distinction is the reason
 * this file exists rather than another function in that one:
 *
 *   getTeamMembers()  → who is in ONE team          (/teams/{id}/members)
 *   listTeamDirectory() → who is in the WHOLE TENANT (/team/directory)
 *
 * Mixing them shows the wrong people, which is the kind of bug that reads as
 * "the list is wrong" long before anyone suspects the endpoint.
 *
 * Search, sort and paging happen on the server. Doing any of them here would
 * only ever sort the page already fetched, which is worse than not offering it.
 */

/** One row of the directory. Every field is optional upstream, so every field is defaulted. */
export interface DirectoryMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Display name, already joined — falls back to the email's local part. */
  name: string;
  role: string;
  /** Department name when mid-platform resolved one; empty when unassigned. */
  department: string;
  departmentId: string;
  /**
   * The row's own status, forwarded verbatim.
   *
   * TWO VOCABULARIES SHARE THIS FIELD, which is not obvious and cost a bug:
   *
   *   status=all | active   → membership:  active | pending | disabled
   *   status=invited        → invitation:  pending | expired | cancelled
   *
   * So "invited" is a QUERY value, never a row value — nothing upstream ever
   * answers `status: "invited"`. Comparing against that literal silently made
   * every row take the "otherwise" branch, and a disabled account rendered as
   * active. Read this field against the maps in DIRECTORY_STATUS_TONE, and never
   * default an unrecognised value to a reassuring one.
   */
  status: string;
  createdAt: string;
  /** Present only on invited rows; needed by the invitation actions. */
  invitationId: string;
  /** Who sent the invitation. Invited rows only. */
  inviter: string;
  /**
   * What may be done to this invitation, decided upstream.
   *
   * Rendered as-is rather than derived from `status`: an expired invitation
   * offers ["reinvite","cancel"], a cancelled one offers something else, and
   * re-deriving that mapping in the client is a second place for it to be
   * wrong. Empty on active members, who are not invitations.
   */
  availableActions: string[];
}

/** The invitation verbs the backend route accepts. */
export type InvitationAction = "accept" | "reject" | "reinvite" | "cancel";

const KNOWN_ACTIONS: InvitationAction[] = ["accept", "reject", "reinvite", "cancel"];

export interface DirectoryPage {
  members: DirectoryMember[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

/**
 * How each status value should read, measured against staging rather than
 * guessed at — the guess is what produced the bug this map replaces.
 *
 * `ok` is granted only to `active`. Everything else is a state somebody needs to
 * notice, and the two invitation endings (`expired`, `cancelled`) are marked
 * `off` rather than `warn`: nothing is pending on them, they are simply over.
 *
 * A value missing from this map is rendered as itself, in the neutral tone. That
 * is deliberately a little ugly — an unrecognised status should look
 * unrecognised, so a new one upstream surfaces instead of hiding inside a
 * friendly label.
 */
export const DIRECTORY_STATUS_TONE: Record<string, "ok" | "warn" | "off" | "bad"> = {
  active: "ok",
  pending: "warn",
  disabled: "bad",
  expired: "off",
  cancelled: "off",
};

/** i18n key per status, same keys as the map above. */
export const DIRECTORY_STATUS_LABEL_KEY: Record<string, string> = {
  active: "settings.team.dirStatusActive",
  pending: "settings.team.dirStatusPending",
  disabled: "settings.team.dirStatusDisabled",
  expired: "settings.team.dirStatusExpired",
  cancelled: "settings.team.dirStatusCancelled",
};

/**
 * The sort keys mid-platform honours, each one verified against staging by
 * asking for asc and desc and checking the order actually changed.
 *
 * `email` is on the list because that check found it works — the first version
 * left it off and drew no sort control on a column that sorts perfectly well.
 * `department` is off the list for the same reason in reverse: it is accepted
 * and then ignored, so a control there would do nothing.
 */
export const DIRECTORY_SORT_KEYS = ["name", "email", "role", "status", "created_at"] as const;
export type DirectorySortKey = (typeof DIRECTORY_SORT_KEYS)[number];

export type DirectoryStatus = "all" | "active" | "invited";

export interface DirectoryQuery {
  status?: DirectoryStatus;
  q?: string;
  departmentId?: string;
  sortBy?: DirectorySortKey;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

/** mid-platform caps page_size at 100; asking for more is answered with 100 anyway. */
const MAX_PAGE_SIZE = 100;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Reads one row defensively.
 *
 * Upstream sends snake_case and the field set has already changed once this
 * quarter, so each name is read with its plausible alternates rather than
 * assumed. A row that arrives missing a field renders blank instead of `undefined`.
 */
function toMember(raw: unknown): DirectoryMember {
  const r = record(raw);
  const first = str(r.first_name ?? r.firstName);
  const last = str(r.last_name ?? r.lastName);
  const email = str(r.email);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return {
    userId: str(r.user_id ?? r.userId ?? r.id),
    email,
    firstName: first,
    lastName: last,
    // `name` FIRST. This endpoint sends a single `name` field, not the
    // first_name/last_name pair the team endpoint uses — reading only the pair
    // meant every row fell through to the email's local part, which happened to
    // look right for accounts named after their address and wrong for everyone
    // whose display name differs from their email.
    //
    // The local part stays as a last resort: a row with no name at all is still
    // a person somebody needs to recognise.
    name: str(r.name) || joined || email.split("@")[0] || "",
    role: str(r.team_role ?? r.teamRole ?? r.role),
    department: str(r.department ?? r.department_name),
    departmentId: str(r.department_id ?? r.departmentId),
    // No fallback. "active" as a default is how a disabled account came to be
    // labelled as working — an absent status is unknown, not fine.
    status: str(r.status),
    createdAt: str(r.created_at ?? r.createdAt),
    invitationId: str(r.invitation_id ?? r.invitationId),
    inviter: str(r.inviter),
    // Filtered to the verbs the route accepts. An action the backend has not
    // been taught would render a button that can only ever answer 400.
    availableActions: Array.isArray(r.available_actions)
      ? r.available_actions
          .map((a) => str(a).toLowerCase())
          .filter((a): a is InvitationAction => (KNOWN_ACTIONS as string[]).includes(a))
      : [],
  };
}

/**
 * Lists one page of the tenant roster.
 *
 * `signal` is required by every caller that races — the hook cancels the
 * in-flight request when the search box moves on, so a slow answer to an old
 * query cannot overwrite a fast answer to the current one.
 */
export async function listTeamDirectory(
  query: DirectoryQuery = {},
  signal?: AbortSignal,
): Promise<DirectoryPage> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 20));

  const params = new URLSearchParams();
  params.set("status", query.status ?? "all");
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.departmentId) params.set("department_id", query.departmentId);
  if (query.sortBy) {
    params.set("sort_by", query.sortBy);
    params.set("order", query.order ?? "asc");
  }

  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/team/directory?${params.toString()}`,
    { cache: "no-store", signal },
  );

  const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: unknown };
  if (!res.ok) {
    const err = body.error;
    const message =
      typeof err === "string"
        ? err
        : typeof record(err).message === "string"
          ? (record(err).message as string)
          : `Request failed: ${res.status}`;
    throw new TeamApiError(message, res.status);
  }

  const data = record(body.data);
  const rows = Array.isArray(data.teammates) ? data.teammates : [];
  const pagination = record(data.pagination);

  return {
    members: rows.map(toMember),
    // Upstream's own total, not rows.length: the pager has to describe the whole
    // result set, and this page is by definition only part of it.
    total: num(pagination.total, rows.length),
    page: num(pagination.page, page),
    pageSize: num(pagination.pageSize ?? pagination.page_size, pageSize),
    hasNextPage:
      typeof pagination.hasNextPage === "boolean"
        ? pagination.hasNextPage
        : typeof pagination.has_next_page === "boolean"
          ? pagination.has_next_page
          : rows.length >= pageSize,
  };
}

/**
 * Bounds the export walk. Twenty pages is two thousand people — more than any
 * tenant on the platform. The point is that a pathological answer cannot turn
 * one click into an unbounded loop.
 */
const EXPORT_MAX_PAGES = 20;

/**
 * Every row matching the filters, walked page by page.
 *
 * `listTeamDirectory` caps page_size at 100 because mid-platform does. The
 * export used to ask for one page of 100 and stop, so a tenant with 150 people
 * downloaded 100 of them and was told nothing — the same invisible truncation
 * CDP's CompanyMembers was written to fix, reintroduced one layer up.
 *
 * `complete` is false when the page cap was hit, so the caller can say the file
 * is partial rather than presenting a short list as the whole answer.
 */
export async function listAllTeamDirectory(
  query: Omit<DirectoryQuery, "page" | "pageSize"> = {},
  signal?: AbortSignal,
): Promise<{ members: DirectoryMember[]; complete: boolean }> {
  const members: DirectoryMember[] = [];
  for (let page = 1; ; page += 1) {
    const result = await listTeamDirectory({ ...query, page, pageSize: MAX_PAGE_SIZE }, signal);
    members.push(...result.members);
    // hasNextPage rather than counting rows: it is the server's own answer about
    // whether more exist, and it stays right if the cap ever changes.
    if (!result.hasNextPage || result.members.length === 0) return { members, complete: true };
    if (page >= EXPORT_MAX_PAGES) return { members, complete: false };
  }
}

/** One department, for the directory's filter. */
export interface DirectoryDepartment {
  id: string;
  name: string;
}

async function unwrap(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: unknown };
  if (!res.ok) {
    const err = body.error;
    const message =
      typeof err === "string"
        ? err
        : typeof record(err).message === "string"
          ? (record(err).message as string)
          : `Request failed: ${res.status}`;
    throw new TeamApiError(message, res.status);
  }
  return record(body.data);
}

/**
 * Lists the tenant's departments.
 *
 * Answers 403 for a caller without the department-read permission, and the
 * filter simply does not render in that case — a dropdown that always errors is
 * worse than one that is not offered.
 */
export async function listDepartments(signal?: AbortSignal): Promise<DirectoryDepartment[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/departments`, {
    cache: "no-store",
    signal,
  });
  const data = await unwrap(res);
  const rows = Array.isArray(data.departments) ? data.departments : [];
  return rows
    .map((raw) => {
      const r = record(raw);
      return { id: str(r.id), name: str(r.name) };
    })
    .filter((d) => d.id && d.name);
}

/** Creates a tenant department. The backend enforces the manage permission. */
export async function createDepartment(name: string): Promise<DirectoryDepartment> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await unwrap(res);
  const department = record(data);
  return { id: str(department.id), name: str(department.name) };
}

/** Runs one invitation action. The caller passes an action the row offered. */
export async function runInvitationAction(
  invitationId: string,
  action: InvitationAction,
): Promise<void> {
  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/team/invitations/${encodeURIComponent(invitationId)}/${action}`,
    { method: "POST" },
  );
  await unwrap(res);
}

/**
 * Removes somebody from the TENANT.
 *
 * Not the same as taking them out of a team — this ends their access to the
 * workspace, which is why the panel confirms before calling it.
 */
export async function removeTenantMember(userId: string): Promise<void> {
  const res = await cdpFetch(
    `${cdpApiConfig.baseUrl}/api/v1/team/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  await unwrap(res);
}

/** One address's outcome in a batch. */
export interface InviteResult {
  email: string;
  /**
   * What happened to this address, forwarded from mid-platform.
   *
   *   invited  — a user row and an invitation were created, mail is on its way
   *   skipped  — the address already belongs to somebody here
   *   error    — this one address failed; the rest of the batch still landed
   */
  status: "invited" | "skipped" | "error" | string;
  /** Why, when the status is skipped or error. Empty otherwise. */
  message: string;
  /**
   * The invitee's user id in this tenant, sent only with `invited`.
   *
   * Mid-platform creates the user row before the mail goes out, and this is the
   * id they sign in as, so a caller can act on them before they accept — a bot
   * invitation stored under it is the one their own token finds after sign-in.
   * `skipped` carries none: that address already has a row here, and its id has
   * to be looked up.
   */
  userId?: string;
}

/** One row of the batch answer. Exported for its test. */
export function toInviteResult(raw: unknown): InviteResult {
  const r = record(raw);
  const userId = str(r.user_id ?? r.userId);
  return {
    email: str(r.email),
    status: str(r.status),
    message: str(r.message),
    ...(userId ? { userId } : {}),
  };
}

/**
 * Invites people who have no account yet into the current tenant.
 *
 * The counterpart to runInvitationAction: that acts on an invitation the roster
 * already shows, this creates one. Administrators only — the backend answers 403
 * for anyone else.
 *
 * A batch is PARTIALLY SUCCESSFUL BY DESIGN, and callers must render it that
 * way. Every address is invited in its own transaction upstream, so an HTTP 200
 * means "the request ran", not "everyone was invited": one bad address comes
 * back as a row with status "error" beside rows that say "invited". Treating the
 * 200 as success would tell an administrator that mail went to people it never
 * reached.
 */
export async function inviteTeamMembers(
  emails: string[],
  roleId?: string,
): Promise<InviteResult[]> {
  const res = await cdpFetch(`${cdpApiConfig.baseUrl}/api/v1/team/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emails,
      ...(roleId ? { role_id: roleId } : {}),
    }),
  });
  const data = await unwrap(res);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows.map(toInviteResult).filter((r) => r.email !== "");
}
