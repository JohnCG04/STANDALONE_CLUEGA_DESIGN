import { cdpApiConfig } from "@/config/cdp-api";
import { cdpFetch } from "@/lib/ai-agent/cluega-session-auth";

/** Auto top-up settings for the CDP wallet (PLT-034), as Core holds them. */
export interface AutoTopupSettings {
  enabled: boolean;
  thresholdCredits: number;
  tokenPackageId: string | null;
  hasDefaultPaymentMethod: boolean;
  lastStatus: AutoTopupStatus | string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  monthlyLimitUsd: number | null;
  monthChargedUsd: number;
  consentAt: string | null;
  consentBy: string | null;
  /** Auto top-up is switched off platform-wide: turning it on is refused, turning it off still works. */
  globallyDisabled: boolean;
}

export type AutoTopupStatus = "pending" | "paid" | "failed" | "requires_authentication" | "limit_reached";

export interface AutoTopupInput {
  enabled: boolean;
  thresholdCredits: number;
  tokenPackageId: string | null;
  monthlyLimitUsd: number | null;
  /** Sent as `consent: true` only when the admin ticked the authorisation. */
  consent: boolean;
}

/** A refusal from Core; `code` is its error code ("" when the body had none). */
export class AutoTopupError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AutoTopupError";
  }
}

const PATH = "/api/v1/billing/auto-topup";

/** Reads Core's view of the settings; no row reads as off. */
export function toAutoTopupSettings(raw: Record<string, unknown>): AutoTopupSettings {
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const threshold = Number(raw.threshold_credits);
  const limit = raw.monthly_limit_usd == null ? NaN : Number(raw.monthly_limit_usd);
  const charged = Number(raw.month_charged_usd);
  return {
    enabled: raw.enabled === true,
    thresholdCredits: Number.isFinite(threshold) ? threshold : 0,
    tokenPackageId: text(raw.token_package_id),
    hasDefaultPaymentMethod: raw.has_default_payment_method === true,
    lastStatus: text(raw.last_status),
    lastError: text(raw.last_error),
    lastAttemptAt: text(raw.last_attempt_at),
    monthlyLimitUsd: Number.isFinite(limit) ? limit : null,
    monthChargedUsd: Number.isFinite(charged) ? charged : 0,
    consentAt: text(raw.consent_at),
    consentBy: text(raw.consent_by),
    globallyDisabled: raw.auto_topup_globally_disabled === true,
  };
}

async function read(res: Response): Promise<AutoTopupSettings> {
  const body = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    error?: unknown;
  };
  if (!res.ok) {
    const err = body.error as { message?: unknown; code?: unknown } | string | undefined;
    const message = typeof err === "string" ? err : typeof err?.message === "string" ? err.message : "";
    const code = typeof err === "object" && typeof err?.code === "string" ? err.code : "";
    throw new AutoTopupError(message || `Request failed: ${res.status}`, code, res.status);
  }
  return toAutoTopupSettings(body.data ?? {});
}

export async function getAutoTopup(signal?: AbortSignal): Promise<AutoTopupSettings> {
  return read(await cdpFetch(`${cdpApiConfig.baseUrl}${PATH}`, { cache: "no-store", signal }));
}

export async function saveAutoTopup(input: AutoTopupInput): Promise<AutoTopupSettings> {
  return read(
    await cdpFetch(`${cdpApiConfig.baseUrl}${PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: input.enabled,
        threshold_credits: input.thresholdCredits,
        token_package_id: input.tokenPackageId ?? "",
        monthly_limit_usd: input.monthlyLimitUsd,
        ...(input.consent ? { consent: true } : {}),
      }),
    }),
  );
}
