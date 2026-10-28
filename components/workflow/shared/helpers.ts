import type { Asset, AssetKind } from "@dogclaw-ad/workflow";
import { isPubliclyFetchable } from "@/lib/media-library/artifactUrl";
import { EXTENSION_BY_MIME, HOSTED_FILE_ID, MEDIA_PROXY_PATH } from "./constants";
import {
  fromProxiedMediaUrl,
  isCdpHostUrl,
  proxyImageAsset,
  unproxyNodeImageUrls,
} from "./mediaProxy";
import { MEDIA_JOB_MESSAGES } from "./messages";
import type { GraphNodeMedia } from "./types";

/** A generated url in the editor's Asset shape (unique id per url). */
export function toImageAsset(url: string): Asset {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `gen-image-${Date.now()}-${url}`,
    url,
    kind: "image",
  };
}

/** Proxied so the node renders AND its canvas pixel reads stay same-origin. */
export function toImageAssets(urls: string[]): Asset[] {
  return urls.map(toImageAsset).map(proxyImageAsset);
}

/** Fail before the job: an unreachable input returns an opaque provider error. */
export function assertPubliclyFetchable(urls: string[], feature: string): void {
  const unreachable = urls.find((url) => !isPubliclyFetchable(url));
  if (unreachable) {
    throw new Error(MEDIA_JOB_MESSAGES.unreachableInput(feature, unreachable));
  }
}

/** A hosted file id rather than a client-side one. */
export function isHostedFileId(id: string): boolean {
  return HOSTED_FILE_ID.test(id);
}

/** The hosted artifact id a media url names: both mounts end `…/{tenant}/{yyyy}/{mm}/{ULID}`. */
export function hostedFileIdFromUrl(url: string): string | null {
  if (!url) return null;
  const path = (fromProxiedMediaUrl(url).split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last && isHostedFileId(last) ? last : null;
}

/** A positive variant count, or nothing — the backend then generates one image. */
export function runCount(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `<kind>-<id>.<ext>`, so repeat downloads don't collide. */
export function mediaFileName(
  url: string,
  kind: AssetKind,
  blob: Blob,
  id: string,
): string {
  const path = fromProxiedMediaUrl(url).split(/[?#]/)[0] ?? "";
  // Last segment only — the whole url would read the host's tld ("…r2.dev" → ".dev").
  const file = path.slice(path.lastIndexOf("/") + 1);
  const mime = blob.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const ext =
    file.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase() ??
    EXTENSION_BY_MIME[mime] ??
    (kind === "video" ? "mp4" : "png");
  return `${id ? `${kind}-${id}` : kind}.${ext}`;
}

/** Through the same-origin proxy: R2's CDN sends no CORS, so a direct `fetch` rejects. */
export function toSameOriginDownloadUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith(MEDIA_PROXY_PATH)) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  if (isCdpHostUrl(url)) return url;
  return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

/** The DB stores real urls: the inverse of flowGraph.ts's load-time proxy, for every save path. */
export function unproxyGraphNodes<T extends GraphNodeMedia>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const config = unproxyNodeImageUrls(node.config);
    const asset_ref =
      typeof node.asset_ref === "string"
        ? fromProxiedMediaUrl(node.asset_ref)
        : node.asset_ref;
    const output =
      typeof node.output === "string"
        ? fromProxiedMediaUrl(node.output)
        : node.output;
    if (
      config === node.config &&
      asset_ref === node.asset_ref &&
      output === node.output
    ) {
      return node;
    }
    return { ...node, config, asset_ref, output };
  });
}

/** `obj` without `keys` — what an edit must not send. */
export function omitKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const out = { ...obj };
  for (const key of keys) delete out[key];
  return out;
}
