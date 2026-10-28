// Mirrors cdp_backend/internal/adapter/http/response/response.go. When a
// new domain error is mapped in FromError, add its code here.
export type KnownCdpErrorCode =
  | "not_found"
  | "already_exists"
  | "invalid_argument"
  | "invalid_credentials"
  | "forbidden"
  | "invalid_refresh_token"
  | "refresh_failed"
  | "tenant_inactive"
  | "unauthorized"
  | "oauth_state_invalid"
  | "facebook_api_error"
  | "facebook_token_invalid"
  | "facebook_token_expired"
  | "facebook_permission_denied"
  | "tiktok_api_error"
  | "tiktok_token_invalid"
  | "tiktok_token_expired"
  | "connection_inactive"
  | "cdp_service_not_registered"
  | "service_unavailable"
  | "ai_upstream_error"
  | "ai_session_not_found"
  | "ai_gateway_unavailable"
  | "ai_gateway_bad_response"
  | "cluegarouter_unavailable"
  | "cluegarouter_bad_response"
  | "internal"
  | "publish_request_forbidden"
  | "publish_request_conflict"
  | "publish_request_invalid"
  | "publish_request_not_found"
  | "publish_request_upstream_error"
  | "publish_request_error";

// Synthetic codes raised by the frontend client itself, never by the backend.
export type SyntheticCdpErrorCode = "network" | "invalid_response";

export type CdpErrorCode =
  | KnownCdpErrorCode
  | SyntheticCdpErrorCode
  | (string & {});

export type CdpSuccessEnvelope<T> = {
  data: T;
};

export type CdpPaginatedEnvelope<T, M = unknown> = {
  data: T;
  pagination: M;
};

export type CdpErrorEnvelope = {
  error: {
    code: CdpErrorCode;
    message: string;
    request_id?: string;
    details?: unknown;
    /**
     * The next step the user can take, in their own terms. Sent by endpoints
     * that follow the Material Center's error contract (PRD v1.6 §9); absent
     * everywhere else, which is why nothing may depend on it being there.
     */
    hint?: string;
    /** Whether repeating the request could succeed — decides if a retry is offered. */
    retryable?: boolean;
  };
};

// PageMeta matches response.PageMeta (offset pagination).
export type CdpPageMeta = {
  page_no: number;
  limit: number;
  total_items: number;
  total_pages: number;
  sort?: string;
  order?: string;
};

// CursorMeta matches response.CursorMeta (cursor pagination).
export type CdpCursorMeta = {
  next_cursor?: string;
  limit: number;
  has_more: boolean;
  sort?: string;
  order?: string;
};
