import { NextRequest, NextResponse } from "next/server";

import { cdpApiConfig } from "@/config/cdp-api";
import { envOrDefault } from "@/lib/env";
import {
  parseOriginList,
  resolveMediaProxyTarget,
  safeOrigin,
  sniffImageContentType,
  type MediaProxyConfig,
} from "@/lib/media/imageProxyTarget";

// Media artifacts are served from the CDP media mounts — fully-qualified urls that
// point at the DEPLOYED CDP host (e.g. https://cdp-stg-core-api.cluega.com/media/
// artifact-files/…) even when the frontend runs locally — or from the public R2
// CDN. This proxy makes those loads same-origin so the canvas editor can read
// pixels with `crossOrigin = "anonymous"` (Konva OCR / export) without CORS
// tainting, and SSRF-guards the target to those known-safe hosts + paths.
//
// When it fails, the canvas falls back to loading the RAW url (tainted but visible) —
// see utils/loadCanvasImage.ts — and reads the `X-Proxy-*` headers below to log why.
//
// `envOrDefault`, not `??`: this is a BUILD input, and an unset one does not reliably
// arrive as undefined — CI exports every `NEXT_PUBLIC_*` from Infisical, and a key
// that is blank there lands as an EMPTY STRING, which `??` keeps. This variable
// appears in no .env.example and in no deployment's build env, so on a built image
// the base became `""`, `resolveMediaProxyTarget` was handed `"/"`, and a blank base
// makes `new URL(raw, base)` throw for ABSOLUTE urls too — the base is parsed first,
// before the input is looked at. Every request answered `invalid-url` while dev,
// which reads the value from .env, worked. Nothing here may depend on it being set.
// See packages/shared/src/lib/env.ts for the same failure in config/site.ts.
const mediaAIBaseUrl = envOrDefault(
  process.env.NEXT_PUBLIC_MEDIA_AI_API_URI,
  "https://cdp-stg-ai-media.cluega.com",
).replace(/\/+$/, "");

const mediaAIOrigin = safeOrigin(mediaAIBaseUrl);
const cdpOrigin = safeOrigin(cdpApiConfig.baseUrl);

const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 2;

// Widening the allowlist must not require an image rebuild, hence a server-only env var
// (NOT NEXT_PUBLIC_*, which would be inlined into the client bundle).
function proxyConfig(): MediaProxyConfig {
  return {
    allowedOrigins: [
      cdpOrigin,
      mediaAIOrigin,
      safeOrigin(cdpApiConfig.artifactPublicBaseUrl),
      ...parseOriginList(process.env.MEDIA_IMAGE_PROXY_ORIGINS),
    ],
    extraPathPrefixes: [cdpApiConfig.artifactPublicBaseUrl],
  };
}

function logPrefix() {
  return "[media-image-proxy]";
}

function isVerbose(request: NextRequest) {
  return (
    process.env.NODE_ENV !== "production"
    || request.nextUrl.searchParams.get("debug") === "1"
  );
}

function errorResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" },
  });
}

/**
 * Same-origin proxy for media artifacts.
 *
 * The CDP media mounts and R2 CDN are public, so no auth is required to fetch them.
 * Nothing authenticating is forwarded on purpose: an `<img>` request cannot carry an
 * Authorization header, the CDP tokens live in localStorage rather than cookies (so
 * forwarding cookies would buy no access), and the allowlist accepts first-party hosts
 * by SUFFIX — handing a session cookie to every matching subdomain. If media-AI ever
 * needs auth here it goes in /app/runtime under a name without the NEXT_PUBLIC_ prefix
 * and is attached only on an exact-origin match.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!raw) {
    return errorResponse(400, { error: "Missing url", reason: "missing-url" }, {});
  }

  const config = proxyConfig();
  const resolved = resolveMediaProxyTarget(raw, config, `${mediaAIBaseUrl}/`);

  if (!resolved.ok) {
    console.error(`${logPrefix()} denied`, { url: raw, reason: resolved.reason });
    const status = resolved.reason === "invalid-url" || resolved.reason === "empty-url" ? 400 : 403;
    return errorResponse(
      status,
      { error: "Host not allowed", reason: resolved.reason },
      { "X-Proxy-Deny-Reason": resolved.reason },
    );
  }

  let target = resolved.target;
  const startedAt = Date.now();

  const baseHeaders = () => ({
    "X-Proxy-Target-Host": target.hostname,
    "X-Proxy-Target-Path": target.pathname,
  });

  try {
    let upstream = await fetchUpstream(target, request);
    let redirects = 0;

    // `redirect: "manual"` on purpose: following redirects automatically would let an
    // allowlisted host bounce this server-side fetch anywhere (e.g. link-local metadata),
    // so every hop is re-validated by the same guard.
    while (isRedirect(upstream.status) && redirects < MAX_REDIRECTS) {
      const location = upstream.headers.get("location");
      if (!location) break;
      const next = resolveMediaProxyTarget(location, config, target.toString());
      if (!next.ok) {
        console.error(`${logPrefix()} redirect denied`, {
          from: target.toString(),
          location,
          reason: next.reason,
        });
        return errorResponse(
          403,
          { error: "Redirect target not allowed", reason: next.reason },
          { ...baseHeaders(), "X-Proxy-Deny-Reason": `redirect:${next.reason}` },
        );
      }
      target = next.target;
      redirects += 1;
      upstream = await fetchUpstream(target, request);
    }

    if (isRedirect(upstream.status)) {
      console.error(`${logPrefix()} too many redirects`, { url: target.toString() });
      return errorResponse(
        502,
        { error: "Too many redirects", reason: "redirect-limit" },
        { ...baseHeaders(), "X-Proxy-Deny-Reason": "redirect-limit" },
      );
    }

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text().catch(() => "");
      console.error(`${logPrefix()} upstream error`, {
        host: target.hostname,
        path: target.pathname,
        status: upstream.status,
        elapsedMs: Date.now() - startedAt,
        body: body.slice(0, 200),
      });
      return errorResponse(
        upstream.status || 502,
        {
          error: `Upstream returned ${upstream.status}`,
          reason: "upstream-error",
          targetHost: target.hostname,
        },
        { ...baseHeaders(), "X-Proxy-Upstream-Status": String(upstream.status) },
      );
    }

    // Peek the first chunk to name the content type, then hand the rest through
    // untouched — buffering the whole artifact just to sniff 12 bytes would be wasteful.
    const reader = upstream.body.getReader();
    const first = await reader.read();
    const head = first.value ?? new Uint8Array();
    const contentType =
      sniffImageContentType(head, upstream.headers.get("content-type"))
      ?? "application/octet-stream";

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        if (head.length) controller.enqueue(head);
        if (first.done) controller.close();
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        void reader.cancel(reason);
      },
    });

    if (isVerbose(request)) {
      console.log(`${logPrefix()} ok`, {
        host: target.hostname,
        path: target.pathname,
        contentType,
        rule: resolved.rule,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...baseHeaders(),
        "X-Proxy-Upstream-Status": String(upstream.status),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // The decisive signal for "the browser can reach this host but the server cannot"
    // (split-horizon DNS / no egress from the container) — previously invisible.
    console.error(`${logPrefix()} fetch failed`, {
      host: target.hostname,
      path: target.pathname,
      elapsedMs: Date.now() - startedAt,
      message,
    });
    return errorResponse(
      502,
      { error: message, reason: "fetch-failed", targetHost: target.hostname },
      { ...baseHeaders(), "X-Proxy-Deny-Reason": "fetch-failed" },
    );
  }
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}

function fetchUpstream(target: URL, request: NextRequest) {
  const headers: Record<string, string> = { Accept: "image/*,*/*" };
  // Tenant only, and only for the media-AI host, so nothing is sent to a different origin.
  if (mediaAIOrigin && target.origin === mediaAIOrigin) {
    headers["X-Tenant-ID"] = request.headers.get("x-tenant-id") || "default";
  }

  return fetch(target.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}
