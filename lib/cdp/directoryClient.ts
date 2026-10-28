/**
 * Tenant directory: who is in this company, and what videos exist.
 *
 * Both are read-only lookups that other modules use to turn a UUID into
 * something a person can recognise. They live together because they solve the
 * same problem — the Script Library was asking users to type raw UUIDs for
 * "share with" and "link video", which nobody can do from memory.
 *
 * Neither endpoint belongs to the Script Library. `company/members` forwards to
 * the mid-platform; `media/library` is the Knowledge Base's own media list.
 */

import { cdpFetch, cdpFetchPaginated } from "@/lib/cdp/fetch";
import { isSnapshotFresh } from "@/lib/query/cachedSnapshot";
import type { CdpPageMeta } from "@/lib/cdp/types";

/**
 * How long a fetched member roster is reused.
 *
 * Longer than the per-page windows elsewhere because this is reference data, not
 * a list the user is working in: it feeds pickers and turns ids into names. It is
 * never the thing being edited on screen.
 */
const MEMBERS_FRESH_MS = 5 * 60_000;

/** The last successfully fetched roster. Module scope: one per page load. */
let membersCache: { value: CompanyMember[]; at: number } | null = null;

export interface CompanyMember {
  id: string;
  name: string;
  email: string;
}

/**
 * The mid-platform's member payload is not stable across versions and reaches
 * us as raw JSON, so every field is read defensively: a member whose shape we
 * do not recognise still gets an id and something to display, rather than
 * breaking the whole picker.
 */
interface RawMember {
  id?: string;
  user_id?: string;
  userId?: string;
  name?: string;
  full_name?: string;
  fullName?: string;
  display_name?: string;
  username?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  email?: string;
}

/**
 * The member list out of whatever envelope the tenant service used this time.
 *
 * `teammates` is what `/api/v1/company/members` actually answers today — the
 * backend forwards the mid-platform roster and unwraps only the outer `data`.
 * This parser accepted `items`/`members`/a bare array and NOT `teammates`, so it
 * produced an empty roster on every call, and both share dialogs quietly showed
 * their "paste a user id" fallback instead of a picker. The other spellings stay
 * because the upstream shape is documented as unstable across versions.
 */
export function parseCompanyMembers(raw: unknown): CompanyMember[] {
  const list: RawMember[] = Array.isArray(raw)
    ? (raw as RawMember[])
    : (() => {
        const env = (raw ?? {}) as Record<string, unknown>;
        for (const key of ["teammates", "items", "members", "users", "list"]) {
          if (Array.isArray(env[key])) return env[key] as RawMember[];
        }
        return [];
      })();
  return list
    .filter((entry): entry is RawMember => Boolean(entry) && typeof entry === "object")
    .map(toMember)
    .filter((m): m is CompanyMember => m !== null);
}

/**
 * Whether some typed text is a user id rather than a name being searched for.
 *
 * Used to let someone paste an id into the picker when the person is not in the
 * roster — a fallback that does not require the whole field to change shape.
 */
export function looksLikeUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function toMember(raw: RawMember): CompanyMember | null {
  const id = raw.id ?? raw.user_id ?? raw.userId;
  if (!id) return null;
  const email = raw.email ?? "";
  const name =
    raw.name ??
    raw.full_name ??
    raw.fullName ??
    raw.display_name ??
    raw.username ??
    // The tenant roster spells a person as two columns; without this every
    // suggestion fell back to the email even when the name was right there.
    [raw.first_name ?? raw.firstName, raw.last_name ?? raw.lastName]
      .filter(Boolean)
      .join(" ") ??
    "";
  return {
    id,
    // Falling back to the email keeps the row identifiable when no name is set;
    // falling back to the id keeps it identifiable when neither is.
    name: name || email || id,
    email,
  };
}

/**
 * Everyone in the tenant, for member pickers.
 *
 * The upstream caps at 200 and does not paginate here — enough for a picker,
 * and the caller filters client-side rather than round-tripping per keystroke.
 */
export async function listCompanyMembers(signal?: AbortSignal): Promise<CompanyMember[]> {
  // Four surfaces ask for this list — the script library and its share dialog, the
  // marketing-report owner filter, the account-settings dialog — and each `/app/*`
  // navigation remounts them, so the same roster was fetched again on every visit.
  // Company membership is not something that changes while someone is clicking
  // around, so a recent answer is reused.
  //
  // Only a SUCCESS is remembered: a failure has to be retried, or one bad request
  // would leave every member picker empty for the rest of the session.
  if (membersCache && isSnapshotFresh(membersCache.at, Date.now(), MEMBERS_FRESH_MS)) {
    return membersCache.value;
  }

  const raw = await cdpFetch<unknown>("/api/v1/company/members", {
    auth: { kind: "auto" },
    signal,
  });
  const members = parseCompanyMembers(raw);
  membersCache = { value: members, at: Date.now() };
  return members;
}

/** Turns a member list into an id → display-name lookup. */
export function memberNameMap(members: CompanyMember[]): Map<string, string> {
  return new Map(members.map((m) => [m.id, m.name]));
}

/** How many suggestions a picker shows at once. More than this is a list to scroll, not a shortlist. */
export const MEMBER_SUGGESTION_LIMIT = 8;

/**
 * The members a picker should suggest for what has been typed.
 *
 * Matching covers name AND email because half a company knows a colleague by one
 * and half by the other. Filtering happens here rather than server-side: the
 * roster is capped at 200 and cached, so a round trip per keystroke would only
 * lag behind the typing.
 *
 * `exclude` drops people who already have access — offering to share again with
 * someone who is on the list below reads as if the first grant did not work.
 */
export function filterMembers(
  members: CompanyMember[],
  query: string,
  exclude: Iterable<string> = [],
): CompanyMember[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const skip = new Set(exclude);
  return members
    .filter((m) => !skip.has(m.id))
    .filter(
      (m) =>
        m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle),
    )
    .slice(0, MEMBER_SUGGESTION_LIMIT);
}

/**
 * What to show for a user id: their name, their email, or — when the directory
 * has never heard of them — the id itself.
 *
 * The id is the last resort rather than a phrase like "someone else": it is at
 * least the same handle the rest of the UI shows for that person, and it can be
 * pasted into a support request.
 */
export function memberLabel(
  id: string,
  members: CompanyMember[] | Map<string, string>,
): string {
  const name = members instanceof Map ? members.get(id) : memberNameMap(members).get(id);
  if (name) return name;
  if (!(members instanceof Map)) {
    const found = members.find((m) => m.id === id);
    if (found?.email) return found.email;
  }
  return id;
}

export interface VideoAsset {
  /** The media row's real primary key — what a link stores. */
  id: string;
  /** The library's origin-prefixed handle, e.g. "object:media/demo/x.mp4". */
  handle: string;
  fileName: string;
  mediaType: string;
  /** Playable URL. Used as the poster source: a <video> element renders its
   *  first frame, which beats having no thumbnail at all. */
  url: string;
  sizeBytes: number;
  createdAt: string;
}

interface RawMediaItem {
  id?: string;
  row_id?: string;
  origin?: string;
  file_name?: string;
  media_type?: string;
  url?: string;
  size?: number;
  created_at?: string;
}

/**
 * Videos in the tenant's media library, for the "link a video" picker.
 *
 * Filtered to video: a script produces a video, and offering images would just
 * make the list harder to search.
 */
export async function listVideoAssets(
  keyword?: string,
  signal?: AbortSignal,
): Promise<VideoAsset[]> {
  // The payload is `data: { items: [...] }`, NOT a bare array. Treating it as an
  // array made `.map` throw, and the picker's catch-all swallowed it into an
  // empty list — the failure looked exactly like "no videos exist".
  const { data } = await cdpFetchPaginated<{ items?: RawMediaItem[] }, CdpPageMeta>(
    "/api/v1/media/library",
    {
      auth: { kind: "auto" },
      signal,
      searchParams: {
        media_type: "video",
        // The library documents `q`; `keyword` is silently ignored.
        q: keyword || undefined,
        page_no: 1,
        limit: 50,
      },
    },
  );

  return (data?.items ?? [])
    .map((raw) => {
      // row_id, not id: `id` is origin-prefixed ("object:<path>") and cannot be
      // stored as a foreign key. A row without one is skipped rather than
      // linked by a handle nothing can resolve later.
      const id = raw.row_id;
      if (!id) return null;
      return {
        id,
        handle: raw.id ?? "",
        fileName: raw.file_name || id,
        mediaType: raw.media_type ?? "video",
        url: raw.url ?? "",
        sizeBytes: raw.size ?? 0,
        createdAt: raw.created_at ?? "",
      };
    })
    .filter((v): v is VideoAsset => v !== null);
}

/**
 * Resolves media ids to their file names, for showing a linked video as
 * something a person recognises instead of a UUID.
 *
 * Reads the same library list rather than adding a lookup endpoint: the set is
 * small and the picker has usually loaded it already.
 */
export async function resolveVideoNames(
  ids: string[],
  signal?: AbortSignal,
): Promise<Map<string, VideoAsset>> {
  const out = new Map<string, VideoAsset>();
  if (ids.length === 0) return out;
  const wanted = new Set(ids);
  for (const v of await listVideoAssets(undefined, signal)) {
    if (wanted.has(v.id)) out.set(v.id, v);
  }
  return out;
}
