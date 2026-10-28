import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { hostedFileIdFromUrl } from "../../shared/helpers";
import { MEDIA_PROXY_PATH } from "../../shared/constants";
import { RESIZE_MESSAGES } from "./messages";
import { displayMediaUrl } from "@/lib/media/displayMediaUrl";
import type { ByteSource, PixelSource } from "./types";

/** Decode into a canvas-READABLE image: bytes fetched same-origin into a `blob:` url (taint fails
 *  late, at `toBlob()`). Rungs: gateway, proxy, direct, crossOrigin; each failure is reported. */
export async function loadPixelSource(url: string): Promise<PixelSource> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error(RESIZE_MESSAGES.noBrowser);
  }

  const attempts: string[] = [];

  for (const candidate of byteSources(url)) {
    let attempt = await fetchPixelSource(candidate, attempts);
    // One second chance, and only for a 5xx.
    if (attempt === "retry") attempt = await fetchPixelSource(candidate, attempts);
    if (attempt && attempt !== "retry") return attempt;
  }

  try {
    const image = await decodeImage(url, true);
    return { image, release: () => {} };
  } catch (err) {
    attempts.push(`crossOrigin="anonymous" decode → ${failureText(err)}`);
    throw new Error(RESIZE_MESSAGES.unreadableSource(url, attempts));
  }
}

/** `"retry"` on a 5xx (the gateway read-through-proxies R2); a rejected `fetch` is not retried,
 *  since a CORS block and a dropped connection are the same opaque `TypeError`. */
async function fetchPixelSource(
  source: ByteSource,
  attempts: string[],
): Promise<PixelSource | "retry" | null> {
  let objectUrl: string | null = null;
  try {
    const response = await source.fetch();
    if (!response.ok) {
      attempts.push(`${source.label} → HTTP ${response.status}`);
      return response.status >= 500 ? "retry" : null;
    }
    objectUrl = URL.createObjectURL(await response.blob());
    const image = await decodeImage(objectUrl, false);
    const href = objectUrl;
    return { image, release: () => URL.revokeObjectURL(href) };
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    attempts.push(`${source.label} → ${failureText(err)}`);
    return null;
  }
}

function failureText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

/** Strongest guarantee first. */
function byteSources(url: string): ByteSource[] {
  if (!url) return [];
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return [urlSource("inline bytes", url)];
  }

  const sources: ByteSource[] = [];

  const hostedId = hostedFileIdFromUrl(url);
  if (hostedId) sources.push(gatewaySource(hostedId));

  if (url.startsWith(MEDIA_PROXY_PATH)) {
    sources.push(urlSource("same-origin proxy", url)); // already proxied
  } else if (!/^https?:\/\//i.test(url)) {
    sources.push(urlSource("same-origin path", url)); // relative → same-origin
  } else {
    sources.push(
      urlSource(
        "same-origin proxy",
        `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`,
      ),
      urlSource("direct fetch", url),
    );
  }

  return sources;
}

function urlSource(label: string, href: string): ByteSource {
  return { label, fetch: async () => fetch(await displayMediaUrl(href)) };
}

/** `mediaFetch`: this endpoint is authorized, and a run polls for minutes between two loads. */
function gatewaySource(id: string): ByteSource {
  const href = `${mediaBaseUrl()}/artifacts/${encodeURIComponent(id)}/download`;
  return {
    label: `media gateway /artifacts/${id}/download`,
    fetch: () => mediaFetch(href),
  };
}

/** `load`/`error` is the guarantee and `img.decode()` only the fast path (some WebKit builds reject
 *  it for a detached element). Handlers go on BEFORE `src`: a cached image loads at once. */
export async function decodeImage(
  src: string,
  anonymous: boolean,
): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  if (anonymous) img.crossOrigin = "anonymous";
  // A stored media link is loaded from its view address (lib/media/displayMediaUrl.ts).
  const signedSrc = await displayMediaUrl(src);

  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(RESIZE_MESSAGES.imageFailedToLoad));
  });
  // Nobody awaits `loaded` on the fast path, and an unawaited rejection logs itself.
  void loaded.catch(() => {});

  img.src = signedSrc;

  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      // Unsupported, detached, or genuinely broken bytes — the event tells them apart.
      await loaded;
    }
  } else {
    await loaded;
  }

  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error(RESIZE_MESSAGES.noPixels);
  }
  return img;
}
