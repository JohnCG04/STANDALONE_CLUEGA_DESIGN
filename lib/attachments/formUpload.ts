import {
  buildCdpAdHeaders,
  buildCdpHeaders,
  refreshCdpToken,
} from "@/lib/ai-agent/cluega-session-auth";
import { isCrossOriginClientUrl, normalizeCdpClientUrl } from "@/config/cdp-api";
import { UploadRejectedError } from "@/lib/uploads/limits";

/**
 * A multipart POST that always ends (B16).
 *
 * The composer used a bare fetch for its bytes: no progress, no timeout, no signal. A 24 MiB
 * CSV sat on a spinner for 191 s with nothing to say, and send stayed blocked behind it. This
 * reports byte progress and gives up on its own terms, each with a code the chip can show:
 *
 * - `UPLOAD_STALLED`: no byte moved for `stallMs` while sending;
 * - `UPLOAD_TIMEOUT`: every byte was sent and no answer came within `responseMs`;
 * - a `TypeError` (shown as `NETWORK`): the connection dropped.
 *
 * `responseMs` is set above the server's own bound for an upload route (upload_read_timeout +
 * storage upload_timeout + 30 s ≈ 270 s, withUploadDeadline in the Backend), so a server that
 * is slow but working is never called dead.
 */

/** No upload progress for this long means the connection is stuck. */
export const UPLOAD_STALL_MS = 60_000;
/** After the last byte: the server's own bound (≈270 s) plus margin. */
export const UPLOAD_RESPONSE_MS = 300_000;

export type FormPostResult = { status: number; body: unknown };

export type FormPostOptions = {
  /** 0–99 while sending; the caller marks 100 when it has an answer it accepts. */
  onProgress?: (percent: number) => void;
  stallMs?: number;
  responseMs?: number;
};

export async function postForm(
  input: string,
  form: FormData,
  options: FormPostOptions = {},
): Promise<FormPostResult> {
  const url = normalizeCdpClientUrl(input);
  const send = typeof XMLHttpRequest === "undefined" ? sendWithFetch : sendWithXhr;
  let result = await send(url, form, options);
  // The access token is short-lived and a composer holding a file open outlives it.
  if (result.status === 401 && (await refreshCdpToken())) {
    result = await send(url, form, options);
  }
  return result;
}

function headersFor(url: string): Record<string, string> {
  return isCrossOriginClientUrl(url) ? buildCdpAdHeaders() : buildCdpHeaders();
}

function stalled(): UploadRejectedError {
  return new UploadRejectedError({ messageKey: "uploads.uploadStalled", params: {} }, undefined, "UPLOAD_STALLED");
}

function timedOut(): UploadRejectedError {
  return new UploadRejectedError({ messageKey: "uploads.uploadTimeout", params: {} }, undefined, "UPLOAD_TIMEOUT");
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text || "null");
  } catch {
    return undefined;
  }
}

function sendWithXhr(url: string, form: FormData, options: FormPostOptions): Promise<FormPostResult> {
  const stallMs = options.stallMs ?? UPLOAD_STALL_MS;
  const responseMs = options.responseMs ?? UPLOAD_RESPONSE_MS;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: Error | undefined;
    const arm = (ms: number, make: () => Error) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        failure = make();
        xhr.abort();
      }, ms);
    };
    xhr.open("POST", url);
    for (const [key, value] of Object.entries(headersFor(url))) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      arm(stallMs, stalled);
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    // The bytes are all out; what is left is the server storing them.
    xhr.upload.onload = () => arm(responseMs, timedOut);
    xhr.onload = () => {
      if (timer) clearTimeout(timer);
      resolve({ status: xhr.status, body: parseBody(xhr.responseText) });
    };
    xhr.onerror = () => {
      if (timer) clearTimeout(timer);
      reject(new TypeError("upload connection failed"));
    };
    xhr.onabort = () => {
      if (timer) clearTimeout(timer);
      reject(failure ?? new TypeError("upload aborted"));
    };
    arm(stallMs, stalled);
    xhr.send(form);
  });
}

/** Where there is no XHR (tests, workers): no progress, one bound for the whole call. */
async function sendWithFetch(url: string, form: FormData, options: FormPostOptions): Promise<FormPostResult> {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, (options.stallMs ?? UPLOAD_STALL_MS) + (options.responseMs ?? UPLOAD_RESPONSE_MS));
  try {
    const response = await fetch(url, {
      method: "POST",
      body: form,
      headers: headersFor(url),
      signal: controller.signal,
    });
    return { status: response.status, body: parseBody(await response.text()) };
  } catch (error) {
    if (expired) throw timedOut();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
