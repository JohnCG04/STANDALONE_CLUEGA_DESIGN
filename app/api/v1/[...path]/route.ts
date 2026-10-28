import { NextResponse } from "next/server";

import { markStreamUntransformable } from "@/lib/http/streamingHeaders";

/**
 * Server-side CDP proxy for browser calls to `/api/v1/*`.
 *
 * Rewrites alone cannot reliably stream SSE (`/api/v1/chat`, browser task
 * events). This route forwards auth headers and pipes the upstream body
 * through without buffering.
 */

import { resolveCdpBackendUrl } from "@/lib/cdp/backend-url";
import { proxyLogPath, proxyLogPathname } from "@/lib/cdp/proxy-log-path";
import { forwardsReaderIp, readerClientIp } from "@/lib/http/client-ip";
import {
  isMediaViewPath,
  mediaCookieRequestHeaders,
  relayMediaCookieResponse,
} from "@/lib/http/mediaCookieProxy";
import {
  isTimedUpload,
  UploadTiming,
  uploadServerTiming,
} from "@/lib/http/uploadTiming";

// On Vercel a function stops at its max duration; agent replies and run updates stream through here.
export const maxDuration = 300;

const CDP_BACKEND_URL = resolveCdpBackendUrl();

console.log(`[cdp-proxy] backend → ${CDP_BACKEND_URL}`);

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "accept",
  "content-type",
  "x-team-id",
  "x-remote-support-token",
  "x-remote-support-tenant-id",
  // Needed so binary/download endpoints under /api/v1 keep working through the
  // proxy: range = video seeking / resumable downloads; conditional headers =
  // cache revalidation (304).
  "range",
  "if-none-match",
  "if-modified-since",
  // Anonymous dashboard share page: the access password (percent-encoded so the
  // value stays ASCII/header-safe even for Unicode). Without this the proxy
  // strips it and the backend sees no password → 401 on a correct one.
  "x-share-password",
  // The language the user picked in the app, for the strings the SERVER writes
  // (an ad account's block reason, a workflow's gate message). This list is an
  // allowlist, so leaving it out silently drops the header and the backend falls
  // back to guessing — which is how a Khmer policy sentence ended up under a
  // Vietnamese picker row. `accept-language` stays off the list on purpose: the
  // machine's language is not the user's choice, and this proxy has never
  // carried it.
  "x-locale",
  // Client-selected Vibe Dashboard SSE envelope. Dropping it here silently
  // sends the AI service back to protocol 1 even though the browser asked for 2.
  "x-dashboard-protocol",
  // Bot view: actions are refused without an Idempotency-Key, and the Pulse
  // proxy only applies its read-only guard when it sees the Bot view header.
  "idempotency-key",
  "x-cluega-bot-view",
] as const;

// Upstream response headers worth preserving. Beyond content-type, these carry
// download filenames, byte-range/seek support, and cache validators that a bare
// pass-through would otherwise strip. Do not forward content-length: fetch may
// decompress upstream bodies, and a stale length truncates streamed JSON.
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "x-request-id",
  "content-disposition",
  "accept-ranges",
  "content-range",
  "etag",
  "last-modified",
  // Back-off headers on a 429. CDP's limiters all send X-RateLimit-*, and two
  // of them send Retry-After, but this allowlist dropped every one of them — so
  // a throttled client saw a bare 429 and its only strategy was to keep asking.
  // Measured on the public share route (2026-09-22): 19 failures answered 401,
  // the 20th answered 429, and the browser was handed no header saying how long
  // to wait. The refusal is the security control working; the missing headers
  // are what made it look like a dead end.
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  // Big Report's latency breakdown (M31-01: auth / facts / pivot in ms). CDP
  // sends it as Server-Timing and again as X-Server-Timing; only the X- copy is
  // forwarded, because Cloudflare stamps its own Server-Timing on the way out.
  "x-server-timing",
] as const;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function forwardRequestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

function buildUpstreamUrl(
  request: Request,
  pathSegments: string[],
  baseUrl: string,
): string {
  const incoming = new URL(request.url);
  const upstream = new URL(`${baseUrl}/api/v1/${pathSegments.join("/")}`);
  for (const [key, value] of incoming.searchParams.entries()) {
    upstream.searchParams.append(key, value);
  }
  return upstream.toString();
}

async function readRequestBody(
  request: Request,
): Promise<BodyInit | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const buf = await request.arrayBuffer();
  return buf.byteLength > 0 ? buf : undefined;
}

/** Methods a failed-to-send request may be replayed on: re-sending one cannot
 *  change state twice, so a transport failure costs nothing but the round trip. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** The 502 this route manufactures when CDP could not be reached at all. */
function unreachable(
  method: string,
  targetUrl: string,
  error: unknown,
): Response {
  const target = new URL(targetUrl);
  console.error("[cdp-proxy] Upstream request failed", {
    method,
    backend: target.origin,
    path: proxyLogPathname(target.pathname),
    error,
  });
  return NextResponse.json(
    {
      error: {
        code: "upstream_unreachable",
        message: "CDP backend unreachable",
      },
    },
    { status: 502 },
  );
}

function isNilBrowserHeartbeat(
  method: string,
  pathSegments: string[],
): boolean {
  return (
    method === "POST" &&
    pathSegments.length === 4 &&
    pathSegments[0] === "browser" &&
    pathSegments[1] === "instances" &&
    pathSegments[2]?.toLowerCase() === NIL_UUID &&
    pathSegments[3] === "heartbeat"
  );
}

async function proxyToCdp(
  request: Request,
  pathSegments: string[],
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (isNilBrowserHeartbeat(method, pathSegments)) {
    return new Response(null, { status: 204 });
  }

  console.log(
    `[cdp-proxy] ${method} /api/v1/${proxyLogPath(pathSegments)} → ${CDP_BACKEND_URL}`,
  );
  const targetUrl = buildUpstreamUrl(request, pathSegments, CDP_BACKEND_URL);
  const headers = {
    ...forwardRequestHeaders(request),
    // The media session cookie, for its two routes only (lib/http/mediaCookieProxy.ts).
    ...mediaCookieRequestHeaders(pathSegments, request.headers, request.url),
  };
  // CDP rate-limits the anonymous share routes per address, and Pulse changes
  // are audited with the caller's address; without this every reader arrives as
  // this server (see lib/http/client-ip.ts).
  if (forwardsReaderIp(pathSegments)) {
    const clientIp = readerClientIp(request.headers);
    if (clientIp) headers["x-forwarded-for"] = clientIp;
  }
  // Buffer the body and forward THAT. Do not forward `request.body` here:
  // readRequestBody() already consumed the stream via arrayBuffer(), so the
  // stream is locked and would forward an empty body — which silently broke
  // every POST/PUT (authorize, confirmations, settings), leaving browser tasks
  // stuck at "Browser tab open — worker executing…" because the backend never
  // received the authorize payload.
  const timing = isTimedUpload(pathSegments) ? new UploadTiming() : undefined;
  const body = await readRequestBody(request);
  timing?.lap("next-read");

  const send = () =>
    fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      // A media view answers with a 302 to a short-lived storage address: the browser follows it, not
      // this server, or the bytes would pass through here.
      redirect: isMediaViewPath(pathSegments) ? "manual" : "follow",
      // Propagate the client's abort UPSTREAM. Without it, aborting a chat
      // stream only stops this route reading it: the Go/Python turn runs to its
      // own deadline and keeps holding the per-session Redis lock, so the very
      // next attempt on that session gets 409 session_busy for a minute or
      // more. Forwarding it lets the backend's disconnect hook cancel the turn
      // and release the lock (it has its own grace period and persists partial
      // work, so nothing in flight is lost).
      signal: request.signal,
    });

  let upstream: Response;
  try {
    upstream = await send();
  } catch (error) {
    // A throw here means the request never reached CDP — undici could not open
    // the socket, or reset a keep-alive one the edge had already closed. For a
    // method with no side effect that is worth one immediate second attempt:
    // the reported "Template library 502 on first open, fine after clicking
    // Retry" was this exact failure, and re-sending is what the user's click
    // did. Never retried for POST/PUT/PATCH/DELETE — a body that DID arrive
    // before the connection broke would be applied twice.
    const replayable = !isAbortError(error) && IDEMPOTENT_METHODS.has(method);
    if (replayable) {
      try {
        upstream = await send();
      } catch (retryError) {
        return unreachable(method, targetUrl, retryError);
      }
    } else {
      const failed = unreachable(method, targetUrl, error);
      if (timing) {
        timing.lap("next-upstream");
        failed.headers.set("server-timing", timing.header());
        logUploadTiming(body, failed.status, timing.header());
      }
      return failed;
    }
  }
  timing?.lap("next-upstream");

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  relayMediaCookieResponse(pathSegments, upstream, responseHeaders);

  // Stop intermediaries from buffering SSE, which would defeat the whole reason
  // this route pipes the body instead of relying on a rewrite. `no-transform`
  // is the half that was missing: the landing zone rewrites /api/v1/* into this
  // route and Next GZIPS what it proxies, and a gzip stream holds its bytes
  // until it closes — so a chat turn's events all landed at once, at the end
  // (measured in a real browser, 2026-08-27).
  markStreamUntransformable(responseHeaders);

  if (timing) {
    const serverTiming = uploadServerTiming(
      timing,
      upstream.headers.get("server-timing"),
    );
    responseHeaders.set("server-timing", serverTiming);
    logUploadTiming(body, upstream.status, serverTiming);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

/** One line per upload, for the ones nobody was watching in a browser. */
function logUploadTiming(
  body: BodyInit | undefined,
  status: number,
  serverTiming: string,
): void {
  const bytes = body instanceof ArrayBuffer ? body.byteLength : 0;
  console.log(
    `[cdp-proxy] upload timing: bytes=${bytes} status=${status} ${serverTiming}`,
  );
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { path } = await context.params;
  return proxyToCdp(request, path ?? []);
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return handle(request, context);
}
