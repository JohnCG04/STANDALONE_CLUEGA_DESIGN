import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";

import {
  artifactDeletePath,
  buildLibraryQuery,
  deletePathFor,
  MediaLibraryError,
  NotDeletableError,
  readLibraryEnvelope,
  type LibraryEnvelope,
  type ListLibraryParams,
  type ListLibraryResult,
  type MediaLibraryItem,
} from "./wire";

/**
 * Transport for the CDP **unified media library** (`GET /api/v1/media/library`).
 * The wire contract — types, query building, row normalization — lives in
 * `./wire`; this module only performs the requests.
 *
 * Consumers: the workflow editor's Assets panel (`components/workflow`) and the
 * composer's asset picker (`PromptComposer/.../AssetLibraryModal`), which
 * therefore render exactly the same rows.
 *
 * Every request goes through `mediaFetch` (repo convention for media traffic):
 * it attaches the CDP Bearer + X-Team-Id and transparently refreshes the access
 * token on a 401. Tenant/user are derived server-side from the JWT.
 */

// Re-exported so callers have a single import site for the whole client.
export {
  bucketForSource,
  DEFAULT_LIBRARY_LIMIT,
  MediaLibraryError,
  NotDeletableError,
} from "./wire";
export type {
  LibraryBucket,
  LibraryMediaFilter,
  LibraryMediaType,
  LibraryOrigin,
  LibraryPagination,
  ListLibraryParams,
  ListLibraryResult,
  MediaLibraryItem,
} from "./wire";

/** List one page of the unified media library. */
export async function listMediaLibrary(
  params: ListLibraryParams = {},
): Promise<ListLibraryResult> {
  const res = await mediaFetch(
    `${mediaBaseUrl()}/library?${buildLibraryQuery(params)}`,
    { signal: params.signal },
  );

  const body = (await res.json().catch(() => null)) as LibraryEnvelope | null;
  if (!res.ok) throw errorFromBody(res.status, body);

  return readLibraryEnvelope(body, params);
}

/**
 * Delete one library row through whichever store owns it (see `deletePathFor`).
 * Rejects with {@link NotDeletableError} for a catalog row that never deduped
 * onto an artifact — those have no delete endpoint at all.
 */
export async function deleteLibraryItem(
  item: MediaLibraryItem,
  signal?: AbortSignal,
): Promise<void> {
  const path = deletePathFor(item);
  if (!path) throw new NotDeletableError(item);
  await deleteViaPath(path, signal);
}

/**
 * Delete a media-ai artifact by its bare id. Use {@link deleteLibraryItem} when
 * you hold the library row; this is for callers that only have the ULID (e.g. an
 * asset created in this session, before any listing carried it).
 */
export async function deleteArtifactById(
  artifactId: string,
  signal?: AbortSignal,
): Promise<void> {
  await deleteViaPath(artifactDeletePath(artifactId), signal);
}

/** Issue an idempotent DELETE under the media gateway. */
async function deleteViaPath(path: string, signal?: AbortSignal): Promise<void> {
  const res = await mediaFetch(`${mediaBaseUrl()}${path}`, {
    method: "DELETE",
    signal,
  });
  // 404 → already deleted; treat delete as idempotent.
  if (res.ok || res.status === 404) return;

  const body = (await res.json().catch(() => null)) as LibraryEnvelope | null;
  throw errorFromBody(res.status, body);
}

function errorFromBody(status: number, body: LibraryEnvelope | null): MediaLibraryError {
  return new MediaLibraryError(
    status,
    body?.error?.code ?? "",
    body?.error?.message ?? "",
  );
}
