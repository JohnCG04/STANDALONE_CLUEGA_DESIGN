import { cdpApiUrl } from "@/config/cdp-api";
import { gatewayRetryDelayMs, shouldRetryGateway } from "./gateway-retry";
import { sleep } from "@/lib/utils";

import { CdpApiError } from "./errors";
import { announceFeatureDisabled } from "./feature-disabled";
import {
  clearCdpSessionTokens,
  getCdpAccessToken,
  refreshCdpAccessToken,
} from "./session";
import { redirectToLogin } from "./auth-redirect";
import { getCdpSupportSession, hasCdpSupportSession } from "./support-session";
import type {
  CdpErrorEnvelope,
  CdpPaginatedEnvelope,
  CdpSuccessEnvelope,
} from "./types";

export type CdpFetchAuth =
  | { kind: "none" }
  | { kind: "auto" }                  // pull from sessionStorage (browser only)
  | { kind: "bearer"; token: string };

export type CdpFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;          // JSON-serialized when defined and not a string/FormData/Blob/ArrayBuffer
  auth?: CdpFetchAuth;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  // Ceiling on how long this call may hang before the client gives up.
  // Defaults to DEFAULT_TIMEOUT_MS; pass 0 for streams and long polls, which
  // are supposed to stay open.
  timeoutMs?: number;
  cache?: RequestCache;
  keepalive?: boolean;
  // Override the CDP host for this ONE call. Keep the default unset so requests
  // go through the configured CDP route/proxy.
  baseUrl?: string;
};

function buildURL(
  path: string,
  searchParams: CdpFetchOptions["searchParams"],
  baseUrl?: string,
): string {
  // `baseUrl` is the per-call override (dev). Without one, resolve through
  // cdpApiUrl, which may return a RELATIVE path so the request goes out on the
  // same origin and through the Next proxy — that is what keeps SSE streaming
  // and the extension lane working, so it must stay the default.
  const resolved = baseUrl ? `${baseUrl}${path}` : cdpApiUrl(path);
  const url = resolved.startsWith("/")
    ? new URL(
        resolved,
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      )
    : new URL(resolved);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function resolveBearer(auth: CdpFetchAuth | undefined): string | null {
  switch (auth?.kind) {
    case "bearer":
      return auth.token;
    case "none":
      return null;
    // A missing `auth` attaches the session token, same as "auto".
    //
    // It used to return null, which made forgetting `auth` mean "send this
    // request with no credentials" — and CDP answers a token-less request with
    // 401, which the app reads as an expired session and signs the user out.
    // That is exactly how the whole Publish Approvals tab broke: four calls
    // omitted `auth`, and nothing warned because the parameter is optional.
    //
    // Now forgetting it does the safe thing. Callers that genuinely must send
    // no token have to say so with `{ kind: "none" }`, which is visible in
    // review in a way an absent argument never is.
    case "auto":
    case undefined:
      // getCdpAccessToken() lives in a "use client" module and reads
      // localStorage. On the server there is no session to read and
      // touching it throws, which is how defaulting to "auto" broke the
      // login route: it calls cdpFetch without `auth`, so the throw
      // happened before any request went out and surfaced as a bare 500.
      if (typeof window === "undefined") return null;
      return getCdpAccessToken();
  }
}

function isRawBody(value: unknown): value is BodyInit {
  if (typeof value === "string") return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
  return false;
}

type FetchResult = {
  status: number;
  rawBody: string;
  json: unknown;
};

type HttpErrorBody = {
  error?: CdpErrorEnvelope["error"] | string;
  code?: string | number;
  message?: string;
  request_id?: string;
  details?: unknown;
  data?: unknown;
  hint?: string;
  retryable?: boolean;
};

/** `Retry-After` as whole seconds (the delta form; an HTTP date is not used by CDP). */
export function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null || !/^\s*\d+\s*$/.test(header)) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function doFetch(url: string, init: RequestInit): Promise<FetchResult> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new CdpApiError({
      status: 0,
      code: "network",
      message:
        cause instanceof Error && cause.message
          ? cause.message
          : "network error",
    });
  }

  const rawBody = await response.text();
  let json: unknown = undefined;
  if (rawBody) {
    try {
      json = JSON.parse(rawBody);
    } catch {
      json = undefined;
    }
  }

  if (!response.ok) {
    const env = json as HttpErrorBody | undefined;
    const err =
      env?.error && typeof env.error === "object" ? env.error : undefined;
    const topLevelMessage =
      typeof env?.message === "string" ? env.message : undefined;
    const topLevelCode =
      typeof env?.code === "string" || typeof env?.code === "number"
        ? String(env.code)
        : undefined;
    const topLevelError =
      typeof env?.error === "string" ? env.error : undefined;
    throw new CdpApiError({
      status: response.status,
      code: err?.code ?? topLevelCode ?? `http_${response.status}`,
      message:
        err?.message ??
        topLevelMessage ??
        topLevelError ??
        `request_failed_${response.status}`,
      requestId: err?.request_id ?? env?.request_id,
      details: err?.details ?? env?.details,
      data: env?.data,
      rawBody: rawBody.slice(0, 500),
      hint: err?.hint ?? env?.hint,
      retryable: err?.retryable ?? env?.retryable,
      retryAfterSec: retryAfterSeconds(response.headers?.get?.("Retry-After") ?? null),
    });
  }

  return { status: response.status, rawBody, json };
}

function readEnvelope<T>(result: FetchResult): T {
  // 204 No Content (and any other 2xx with empty body, e.g. some
  // DELETE/POST endpoints) carry no envelope by spec. Hand back undefined
  // cast as T so callers that asked for `void`/`unknown` get a clean
  // resolution and we never blow up on perfectly valid empty bodies.
  if (result.status === 204 || result.rawBody.length === 0) {
    return undefined as T;
  }
  const env = result.json as CdpSuccessEnvelope<T> | undefined;
  if (!env || !("data" in env)) {
    throw new CdpApiError({
      status: result.status,
      code: "invalid_response",
      message: "response envelope missing data",
      rawBody: result.rawBody.slice(0, 500),
    });
  }
  return env.data;
}

function readPaginatedEnvelope<T, M>(
  result: FetchResult,
): { data: T; pagination: M } {
  const env = result.json as CdpPaginatedEnvelope<T, M> | undefined;
  if (!env || !("data" in env) || !("pagination" in env)) {
    throw new CdpApiError({
      status: result.status,
      code: "invalid_response",
      message: "response envelope missing data/pagination",
      rawBody: result.rawBody.slice(0, 500),
    });
  }
  return { data: env.data, pagination: env.pagination };
}

function buildInit(opts: CdpFetchOptions): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };

  const support = getCdpSupportSession();
  const bearer = support ? null : resolveBearer(opts.auth);
  if (support) {
    headers["X-Remote-Support-Token"] = support.token;
    headers["X-Remote-Support-Tenant-ID"] = support.tenantId;
  } else if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (isRawBody(opts.body)) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
  }

  return {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: withDefaultTimeout(
      opts.signal,
      opts.timeoutMs,
      opts.method ?? "GET",
    ),
    cache: opts.cache ?? "no-store",
    keepalive: opts.keepalive,
  };
}

/** How long a CDP call may hang before the client gives up on it.
 *
 *  Not a guess at how slow the backend is allowed to be — it has its own
 *  deadlines for that. This bounds how long a component may sit in a loading
 *  state with nothing arriving. Without it, a request whose socket never
 *  closes hangs until the browser decides to care, and the user gets a
 *  spinner with no way out. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Combines the caller's abort signal with a timeout, so a hung request fails
 *  on its own while an explicit abort still wins immediately.
 *
 *  Reads only by default. A write is often a multi-megabyte upload on a phone
 *  uplink, where "still going after twenty seconds" is the normal case rather
 *  than a hang — and aborting one is not free, since the body may already have
 *  reached the server. Writes that want a ceiling pass `timeoutMs` explicitly. */
function withDefaultTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
  method: string,
): AbortSignal | undefined {
  const isRead = method === "GET" || method === "HEAD";
  if (timeoutMs === undefined && !isRead) return signal;
  const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (ms <= 0) return signal;
  // AbortSignal.any is not in every runtime this package is built for. Where
  // it is missing, keep the caller's signal rather than trading it for a
  // timeout — losing an explicit abort is the worse failure.
  if (typeof AbortSignal.any !== "function") return signal;
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// On 401: attempt token refresh once, then retry. If refresh fails or the
// retry also returns 401, clear session and redirect to login.
//
// Generic over what the call READS, so a body that is not JSON (an image) gets
// the same token handling as one that is. Without this a binary read has to be
// written as a bare `fetch`, which then carries no refresh and no error
// classification — every failure collapses to "no picture".
async function withTokenRefresh<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof CdpApiError && err.status === 403 && err.code === "feature_disabled") {
      announceFeatureDisabled();
    }
    if (!(err instanceof CdpApiError) || err.status !== 401) throw err;
    if (typeof window === "undefined") throw err;
    if (hasCdpSupportSession()) throw err;

    const refreshed = await refreshCdpAccessToken();
    if (refreshed) {
      try {
        // buildInit re-reads getCdpAccessToken() so it picks up the new token
        return await run();
      } catch (retryErr) {
        if (!(retryErr instanceof CdpApiError) || retryErr.status !== 401) throw retryErr;
        // Second 401 even after a successful refresh → fall through to redirect
      }
    }

    // Token loss, not a sign-out: what the person connected stays (LF3b-11).
    clearCdpSessionTokens("expired");
    redirectToLogin();
    throw err;
  }
}

async function fetchWithRefresh(
  url: string,
  opts: CdpFetchOptions,
): Promise<FetchResult> {
  return withTokenRefresh(() =>
    retryGatewayRead(opts, () => doFetch(url, buildInit(opts))),
  );
}

async function retryGatewayRead<T>(
  opts: CdpFetchOptions,
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (
        !(err instanceof CdpApiError)
        || !shouldRetryGateway(err.status, opts.method, attempt)
        || opts.signal?.aborted
      ) {
        throw err;
      }
      await sleep(gatewayRetryDelayMs(attempt));
    }
  }
}

// cdpFetch issues a request to the CDP backend and returns the unwrapped
// `data` payload. Throws CdpApiError on HTTP errors, network failures, or
// envelope-shape mismatches.
export async function cdpFetch<T>(
  path: string,
  opts: CdpFetchOptions = {},
): Promise<T> {
  const result = await fetchWithRefresh(
    buildURL(path, opts.searchParams, opts.baseUrl),
    opts,
  );
  return readEnvelope<T>(result);
}

// Same as cdpFetch but expects the paginated envelope.
export async function cdpFetchPaginated<T, M = unknown>(
  path: string,
  opts: CdpFetchOptions = {},
): Promise<{ data: T; pagination: M }> {
  const result = await fetchWithRefresh(buildURL(path, opts.searchParams), opts);
  return readPaginatedEnvelope<T, M>(result);
}

// cdpFetchRaw is for endpoints that do not use the envelope — today that's
// POST /api/v1/media/artifacts, whose single-file upload answers with a flat
// {id, artifact_id, url, …} body rather than {data:…} (consumed by
// rehostGeneratedMediaAsArtifact in
// apps/app/lib/ai-agent/creative-upload-client.ts). Returns the parsed JSON
// (or undefined) without envelope checking. Still throws CdpApiError on
// non-2xx + network failures.
/**
 * Read a CDP endpoint that answers with bytes rather than an envelope — today
 * a browser run's stored step screen.
 *
 * Returns null for the ordinary "there is nothing here" answers (404, and an
 * empty 200), so a caller rendering a picture can treat absence as a fact
 * rather than as an error. Every other failure still throws a CdpApiError, so a
 * revoked token or a broken backend is distinguishable from a step that simply
 * saved no screen.
 */
export async function cdpFetchBinary(
  path: string,
  opts: CdpFetchOptions = {},
): Promise<Blob | null> {
  const url = buildURL(path, opts.searchParams, opts.baseUrl);
  return withTokenRefresh(async () => {
    const blob = await retryGatewayRead(opts, () => doFetchBinary(url, buildInit(opts)));
    return blob && blob.size > 0 ? blob : null;
  });
}

async function doFetchBinary(
  url: string,
  init: RequestInit,
): Promise<Blob | null> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new CdpApiError({
      status: 0,
      code: "network",
      message:
        cause instanceof Error && cause.message
          ? cause.message
          : "network error",
    });
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new CdpApiError({
      status: response.status,
      code: `http_${response.status}`,
      message: `request_failed_${response.status}`,
    });
  }
  return response.blob();
}

export async function cdpFetchRaw(
  path: string,
  opts: CdpFetchOptions = {},
): Promise<{ status: number; rawBody: string; json: unknown }> {
  return fetchWithRefresh(buildURL(path, opts.searchParams, opts.baseUrl), opts);
}
