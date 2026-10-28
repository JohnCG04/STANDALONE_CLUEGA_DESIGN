import { platformApiConfig } from "@/config/platform-api";
import { cdpFetchRaw } from "@/lib/cdp";
import { CdpApiError } from "@/lib/cdp/errors";

// Buying a token pack: Core creates the order, then opens its Stripe Checkout (credit by webhook).

/** Why a purchase could not start, in terms the UI can act on. */
export type RechargeFailureKind =
  | "forbidden" // 403: this member may not buy; an administrator can
  | "unavailable" // 400/404/422: this pack cannot be bought or charged right now
  | "not_configured" // 503: card payment is not switched on in this deployment
  | "unknown";

export class RechargeCheckoutError extends Error {
  readonly kind: RechargeFailureKind;
  constructor(kind: RechargeFailureKind, message: string) {
    super(message);
    this.name = "RechargeCheckoutError";
    this.kind = kind;
  }
}

const MESSAGES: Record<RechargeFailureKind, string> = {
  forbidden: "You do not have permission to buy tokens.",
  unavailable: "This token pack is not available for purchase right now.",
  not_configured: "Card payment is temporarily unavailable.",
  unknown: "We could not start the payment. Please try again.",
};

function fail(kind: RechargeFailureKind): RechargeCheckoutError {
  return new RechargeCheckoutError(kind, MESSAGES[kind]);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { json } = await cdpFetchRaw(path, {
    method: "POST",
    auth: { kind: "auto" },
    baseUrl: platformApiConfig.baseUrl,
    headers: { "Content-Type": "application/json" },
    body,
  });
  return ((json as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>;
}

async function attempt(tenantId: string, packageId: string, returnTo: string): Promise<string> {
  const orders = `/v1/tenants/${encodeURIComponent(tenantId)}/recharge-orders`;
  const orderId = str((await post(orders, { package_id: packageId })).id);
  if (!orderId) throw fail("unknown");
  const checkoutUrl = str(
    (await post(`${orders}/${encodeURIComponent(orderId)}/checkout-session`, { return_to: returnTo })).checkout_url,
  );
  if (!checkoutUrl) throw fail("unknown");
  return checkoutUrl;
}

function toFailure(err: unknown): RechargeCheckoutError {
  if (err instanceof RechargeCheckoutError) return err;
  switch (err instanceof CdpApiError ? err.status : 0) {
    case 403:
      return fail("forbidden");
    case 400:
    case 404:
    case 422:
      return fail("unavailable");
    case 503:
      return fail("not_configured");
    default:
      return fail("unknown");
  }
}

/** Creates the order, returns its Checkout URL; no amount is sent, a 409 gets one fresh order. */
export async function startRechargeCheckout(
  tenantId: string,
  packageId: string,
  returnTo: string,
): Promise<{ checkoutUrl: string }> {
  try {
    return { checkoutUrl: await attempt(tenantId, packageId, returnTo) };
  } catch (err) {
    if (!(err instanceof CdpApiError && err.status === 409)) throw toFailure(err);
    try {
      return { checkoutUrl: await attempt(tenantId, packageId, returnTo) };
    } catch (retryErr) {
      throw toFailure(retryErr);
    }
  }
}
