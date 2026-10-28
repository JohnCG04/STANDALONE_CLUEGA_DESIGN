import { getCdpBackendUrl } from "@/config/cdp-api";

// Browser-loadable preview URL for a Cluega media value.
//
// An http(s) URL — a pasted link, an AI/library result, or the backend's by-id
// redirect (/media/by-id/<tenant>/<file_id>, which 302s to a signed URL) — is
// already loadable and is returned as-is.
//
// A bare object_path is NOT loadable any more: the public /media/files/* stream
// that served those paths was removed. Such a value now yields an empty string,
// so a caller renders its "no preview" state instead of firing a request that can
// only 404.
export function previewUrlFor(v: string): string {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

/** Sizes the CDP artifact-image route will render. Anything else is a 400. */
const THUMB_WIDTHS = [256, 320, 512, 640, 1080] as const;

export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/**
 * A tile-sized derivative of an artifact URL, or the URL itself.
 *
 * The template library draws ~134px tiles and was loading the 1024–1376px
 * originals into them — ~5s per request, 4 of 8 tiles still blank after a
 * minute (QA round 5, BUG-03). The backend has had a decoder on
 * `/media/artifact-images/*` all along; it just always rendered 1080 for the
 * social publisher. It now takes `?w=`.
 *
 * Only artifact-file URLs are rewritten. A pasted link, an R2 URL or anything
 * else is returned untouched: there is no resizer in front of those, and
 * inventing a query string for them would only break the load.
 */
export function thumbUrlFor(v: string, width: ThumbWidth = 320): string {
  const url = previewUrlFor(v);
  if (!url || !url.includes("/media/artifact-files/")) return url;
  const [path, query] = url.split("?", 2);
  const params = new URLSearchParams(query ?? "");
  params.set("w", String(width));
  return `${path.replace("/media/artifact-files/", "/media/artifact-images/")}?${params}`;
}

/** A Backend media link as a browser fetches it: a bare path lives on the Backend's origin. */
export function backendMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${getCdpBackendUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}
