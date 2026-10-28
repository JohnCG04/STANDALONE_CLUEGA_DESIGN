import { translateStatic } from "@/hooks/useTranslate";
import { trackEvent } from "@/lib/analytics/productEvents";
import { useToastStore } from "@/lib/stores/useToastStore";

import { mediaBaseUrl, mediaFetch } from "./api.helper";

// Points billing for media generation (PRD 8.3). The media-ai service exposes
// POST /jobs/estimate (always 200 — never a preflight block) and enforces the
// actual balance gate at the submission endpoints (POST /jobs, video-project
// plan/render/render-and-stitch), which reply
//   402 {"detail": {"code": "insufficient_points", "required": N, "balance": M}}
// when the wallet cannot cover the estimate. Both travel byte-for-byte through
// the CDP proxy (no {data} envelope).

export type JobEstimateRequest = {
  surface?:
    | "job"
    | "video_project_plan"
    | "video_project_render"
    | "video_project_render_and_stitch";
  type?: "image" | "video";
  operation?: string;
  n?: number;
  options?: Record<string, unknown>;
  /** Routed model id, when known — prices against its real catalog cost
   *  instead of the flat per-kind default (media-ai-service real_pricing.py). */
  model?: string;
};

export type JobEstimateBreakdownItem = {
  item: string;
  unit: string;
  quantity: number;
  unit_points: number;
  points: number;
};

export type JobEstimate = {
  points: number;
  currency: string;
  // False while the rollout flag is off OR billing is not configured — the UI
  // must show no cost chip and never block on balance in that case.
  billing_enabled: boolean;
  breakdown: JobEstimateBreakdownItem[];
};

// POST /jobs/estimate — price a generation before submitting it. All request
// fields are optional; video pricing reads `options.seconds`.
export async function fetchJobEstimate(
  body: JobEstimateRequest = {},
  signal?: AbortSignal,
): Promise<JobEstimate> {
  const response = await mediaFetch(`${mediaBaseUrl()}/jobs/estimate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<JobEstimate>;
}

/** Thrown when a media submission is rejected with 402 insufficient_points. */
export class MediaInsufficientPointsError extends Error {
  readonly code = "insufficient_points";
  readonly required?: number;
  readonly balance?: number;

  constructor(message: string, required?: number, balance?: number) {
    super(message);
    this.name = "MediaInsufficientPointsError";
    this.required = required;
    this.balance = balance;
  }
}

function insufficientPointsMessage(required?: number, balance?: number): string {
  if (required === undefined || balance === undefined) {
    return translateStatic("appChat.composer.estimate.insufficientShort");
  }
  return translateStatic("appChat.composer.estimate.insufficient")
    .replace("{required}", String(required))
    .replace("{balance}", String(balance));
}

// Call on any media submission Response BEFORE the generic status check: turns
// the backend's 402 into a typed error with a human-readable (i18n) message —
// which the stream/driver error paths render as the turn's error text — and
// surfaces a toast immediately so the block is never the only signal. Also
// reports PRD 8.2 `points_insufficient`.
export async function throwIfInsufficientPoints(
  response: Response,
): Promise<void> {
  if (response.status !== 402) return;

  let required: number | undefined;
  let balance: number | undefined;
  try {
    // clone(): on a non-matching 402 the caller still reads the body for its
    // generic error message — consuming it here would break that read.
    const payload = (await response.clone().json()) as {
      detail?: { code?: string; required?: number; balance?: number };
    };
    if (payload.detail?.code !== "insufficient_points") return;
    required = payload.detail.required;
    balance = payload.detail.balance;
  } catch {
    // Non-JSON 402 → let the caller's generic error path report it.
    return;
  }

  trackEvent("points_insufficient", { need: required, balance });
  const message = insufficientPointsMessage(required, balance);
  useToastStore.getState().push(message);
  throw new MediaInsufficientPointsError(message, required, balance);
}
