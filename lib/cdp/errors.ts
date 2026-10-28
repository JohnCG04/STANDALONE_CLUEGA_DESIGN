import type { CdpErrorCode } from "./types";

export class CdpApiError extends Error {
  readonly status: number;
  readonly code: CdpErrorCode;
  readonly requestId?: string;
  readonly details?: unknown;
  /** The error body's top-level `data`, which some endpoints fill (a 409's conflicting row). */
  readonly data?: unknown;
  readonly rawBody?: string;
  /**
   * What to do next, when the endpoint says so (PRD v1.6 §9). Optional because
   * only the Material Center endpoints fill it in so far — a screen that shows
   * it must cope with it being absent.
   */
  readonly hint?: string;
  /**
   * Whether trying again could work. Undefined means the endpoint did not say,
   * which is not the same as false: callers decide their own default rather
   * than reading silence as "give up".
   */
  readonly retryable?: boolean;
  /**
   * The `Retry-After` header in seconds, when the server sent one (a 429
   * `rate_limited` from the report routes). Undefined when it did not, or it
   * was not a number of seconds.
   */
  readonly retryAfterSec?: number;

  constructor(args: {
    status: number;
    code: CdpErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
    data?: unknown;
    rawBody?: string;
    hint?: string;
    retryable?: boolean;
    retryAfterSec?: number;
  }) {
    super(args.message);
    this.name = "CdpApiError";
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
    this.details = args.details;
    this.data = args.data;
    this.rawBody = args.rawBody;
    this.hint = args.hint;
    this.retryable = args.retryable;
    this.retryAfterSec = args.retryAfterSec;
  }

  // status === 0 means we never got an HTTP response (DNS, offline, abort,
  // CORS preflight rejected, etc.). Use this when a caller wants to retry
  // or render an offline state rather than a server-error toast.
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

// isCdpForbidden reports whether an unknown caught value is a 403 from the CDP
// backend. Use it in catch blocks to show an access-denied state instead of a
// generic error. Note: a 403 is NOT a session problem — cdpFetch only refreshes
// /redirects-to-login on 401, so forbidden never logs the user out.
export function isCdpForbidden(err: unknown): boolean {
  return err instanceof CdpApiError && err.status === 403;
}
