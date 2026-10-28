/**
 * Make a media-AI artifact url fetchable by the media service itself.
 *
 * `GET /api/v1/media/assets` hands back artifact files proxied onto the CALLER's
 * origin (`<origin>/media/artifact-files/<path>`) so the browser loads them
 * same-origin, without CORS. That is right for rendering and wrong for a job:
 * an image-to-video render is fetched SERVER-side by the media service, which
 * cannot reach a developer's `http://127.0.0.1:8080`. It answers
 *
 *   tool veo_fast: image-to-video needs a publicly reachable HTTPS image URL
 *
 * The bytes were never private — the same object is served publicly from R2
 * (verified: the R2 url returns 200 image/png), and a staging/prod CDP host is
 * public too. Only the LOCAL proxy origin is unreachable. So the fix is to swap
 * that origin for a public one, not to disable the feature off-production.
 *
 * On staging/prod `artifactPublicBaseUrl` is empty and every url passes through
 * untouched, because the proxy origin is already public there.
 */

import { cdpApiConfig } from "@/config/cdp-api";

const ARTIFACT_PATH = "/media/artifact-files/";

/** True when the media service will be able to fetch this url server-side. */
export function isPubliclyFetchable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h !== "localhost"
      && h !== "127.0.0.1"
      && h !== "0.0.0.0"
      && !h.endsWith(".local")
      && !/^10\./.test(h)
      && !/^192\.168\./.test(h)
      && !/^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  } catch {
    return false;
  }
}

/**
 * The url a media job should be given for `url`.
 *
 * Already publicly fetchable → returned unchanged. Otherwise, when it is an
 * artifact-file url and a public base is configured, its origin+prefix is swapped
 * for that base. Anything else (a non-artifact local url, no base configured) is
 * returned as-is — the caller still checks `isPubliclyFetchable` and reports a
 * clear reason rather than sending a url the job will reject.
 */
export function toPublicArtifactUrl(
  url: string,
  publicBase: string = cdpApiConfig.artifactPublicBaseUrl,
): string {
  if (!url || isPubliclyFetchable(url)) return url;
  if (!publicBase) return url;
  const at = url.indexOf(ARTIFACT_PATH);
  if (at === -1) return url;
  return `${publicBase.replace(/\/+$/, "")}/${url.slice(at + ARTIFACT_PATH.length)}`;
}
