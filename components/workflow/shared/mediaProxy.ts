import type { Asset, ImageInput } from "@dogclaw-ad/workflow";

import { getCdpBackendUrl } from "@/config/cdp-api";
import { toPublicArtifactUrl } from "@/lib/media-library/artifactUrl";
import { IMAGE_URL_KEYS, MEDIA_PROXY_PATH } from "./constants";
import type { UrlTransform } from "./types";

/** CDP media is CORS-safe; proxying it would trip the SSRF allowlist and mangle `asset_ref`. */
export function isCdpHostUrl(url: string): boolean {
  try {
    return new URL(url).origin === new URL(getCdpBackendUrl()).origin;
  } catch {
    return false;
  }
}

/** Rewrite a remote media url to the same-origin proxy. Idempotent. */
export function toProxiedMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith(MEDIA_PROXY_PATH)) return url;
  if (!/^https?:\/\//i.test(url)) return url; // relative → already same-origin
  if (isCdpHostUrl(url)) return url;
  return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

/** Lossless inverse of {@link toProxiedMediaUrl} — the original rides in `?url=`. */
export function fromProxiedMediaUrl(url: string): string {
  if (!url || !url.startsWith(MEDIA_PROXY_PATH)) return url;
  const q = url.indexOf("?");
  if (q === -1) return url;
  const original = new URLSearchParams(url.slice(q + 1)).get("url");
  return original ?? url;
}

/** Apply `fn` to a url string, a `{ url }` object, or an array of either. */
function mapUrlish(value: unknown, fn: UrlTransform): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapUrlish(v, fn));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };
    if (typeof obj.url === "string") out.url = fn(obj.url);
    if (Array.isArray(obj.urls)) out.urls = obj.urls.map((u) => (typeof u === "string" ? fn(u) : u));
    return out;
  }
  return value;
}

function mapNodeImageUrls(
  data: Record<string, unknown> | undefined,
  fn: UrlTransform,
): Record<string, unknown> | undefined {
  if (!data) return data;
  let out: Record<string, unknown> | null = null;
  for (const key of IMAGE_URL_KEYS) {
    if (!(key in data)) continue;
    const next = mapUrlish(data[key], fn);
    if (next !== data[key]) {
      out ??= { ...data };
      out[key] = next;
    }
  }
  return out ?? data;
}

/** Load boundary: rewrite a node's image urls to same-origin proxy urls. */
export function proxyNodeImageUrls(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  // A voice card has no pixels to read, and the proxy drops Range, so its audio couldn't seek.
  if (data?.kind === "audio") return data;
  return mapNodeImageUrls(data, toProxiedMediaUrl);
}

/** Save boundary: strip the proxy back to the real url before persisting. */
export function unproxyNodeImageUrls(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return mapNodeImageUrls(data, fromProxiedMediaUrl);
}

/** Videos are left alone — proxying would stream them through our origin. */
export function proxyImageAsset(asset: Asset): Asset {
  if (asset.kind !== "image") return asset;
  return { ...asset, url: toProxiedMediaUrl(asset.url) };
}

/** The url a backend job gets: un-proxied, then pinned to the public artifact origin, since a
 *  laptop's `localhost:8080` artifact url is one media-ai can never reach. */
export function toJobInputUrl(url: string): string {
  return toPublicArtifactUrl(fromProxiedMediaUrl(url));
}

/** {@link toJobInputUrl} for a whole `ImageInput`. */
export function unproxyImageInput(input: ImageInput): ImageInput {
  return { ...input, url: toJobInputUrl(input.url) };
}
