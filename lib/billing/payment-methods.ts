import { platformApiConfig } from '@/config/platform-api';
import { cdpFetchRaw } from '@/lib/cdp';
import { CdpApiError } from '@/lib/cdp/errors';

/**
 * The cards the account can actually be charged on, against Core.
 *
 * # WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It never sees a card number. Adding one leaves for Stripe's own hosted page and
 * the row appears here only when Stripe reports the attachment through a webhook,
 * so nothing in this app -- or in a request it makes -- can name a PAN, a CVC or a
 * Stripe customer id. Every action below asks Core, which asks Stripe, and reports
 * only what Stripe accepted.
 *
 * Kept out of platform-subscriptions.ts because that module is about buying a
 * plan; these four calls are about the instrument that pays for it, and the two
 * get read and changed on different screens.
 */

export interface PlatformPaymentMethod {
  id: string;
  /** "card" for everything Stripe gives us today; kept open for what follows. */
  type: string;
  /** Lowercase from Core ("visa", "mastercard"); null when the provider gave none. */
  brand: string | null;
  last4: string | null;
  expiresMonth: number | null;
  expiresYear: number | null;
  country: string | null;
  currency: string | null;
  isDefault: boolean;
  /**
   * "active" or "disabled". A removed card keeps its row so a past receipt can
   * still name the card that paid, so a screen listing what you can pay WITH has
   * to filter these out rather than assume the list is already clean.
   */
  status: string;
}

/** Why an action on a card could not be taken, in Core's own words. */
export class PaymentMethodError extends Error {
  readonly code: string;
  /**
   * Core's HTTP status, 0 when the call never reached it.
   *
   * Carried because one refusal is not like the others: Core answers 503 when
   * STRIPE_SECRET_KEY is unset, and that is a deployment that cannot take a
   * card at all rather than an attempt that went wrong. It arrives with no
   * `code` field, so the status is the only thing that distinguishes it.
   */
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'PaymentMethodError';
    this.code = code;
    this.status = status;
  }
}

/** Core cannot take a card at all here — not "this attempt failed". */
export function isCardPaymentUnavailable(err: unknown): boolean {
  return err instanceof PaymentMethodError && err.status === 503;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function int(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function unwrapData(json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as { data?: unknown };
  return (body.data ?? {}) as Record<string, unknown>;
}

function toMethod(raw: Record<string, unknown>): PlatformPaymentMethod {
  return {
    id: String(raw.id ?? ''),
    type: str(raw.type) ?? 'card',
    brand: str(raw.brand),
    last4: str(raw.last4),
    expiresMonth: int(raw.expires_month),
    expiresYear: int(raw.expires_year),
    country: str(raw.country),
    currency: str(raw.currency),
    isDefault: raw.is_default === true,
    // Absent means active: Core only sets this column when a card is taken out
    // of service, and defaulting the other way would hide every usable card.
    status: str(raw.status) ?? 'active',
  };
}

function toPaymentMethodError(err: unknown): PaymentMethodError {
  if (err instanceof PaymentMethodError) return err;
  if (err instanceof CdpApiError) {
    let code = '';
    let message = '';
    try {
      const body = JSON.parse(err.rawBody ?? '{}') as {
        code?: unknown;
        error?: unknown;
      };
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Not JSON: the status is all there is to go on.
    }
    return new PaymentMethodError(code || 'unknown', message, err.status);
  }
  return new PaymentMethodError('unknown', '');
}

/** readTenantPaymentMethods returns every mirrored card, removed ones included. */
export async function readTenantPaymentMethods(
  tenantId: string,
): Promise<PlatformPaymentMethod[]> {
  const { json } = await cdpFetchRaw(
    `/v1/tenants/${encodeURIComponent(tenantId)}/billing/payment-methods`,
    {
      auth: { kind: 'auto' },
      baseUrl: platformApiConfig.baseUrl,
      cache: 'no-store',
    },
  );
  const items = unwrapData(json).payment_methods;
  if (!Array.isArray(items)) return [];
  return items.map((m) => toMethod(m as Record<string, unknown>));
}

/**
 * startPaymentMethodSetup returns the Stripe page to send the browser to.
 *
 * `return_to` is the page the customer is standing on, so Stripe brings them back
 * HERE rather than to whichever single URL the deployment configured -- adding a
 * card in one app used to land the customer in the other one's login screen. Core
 * honours the path but allowlists the ORIGIN, so this cannot be turned into an
 * open redirect by a crafted link.
 */
export async function startPaymentMethodSetup(
  tenantId: string,
  returnTo: string,
): Promise<string> {
  try {
    const { json } = await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/billing/payment-methods/setup-session`,
      {
        method: 'POST',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
        headers: { 'Content-Type': 'application/json' },
        body: { return_to: returnTo },
      },
    );
    const url = str(unwrapData(json).url);
    if (!url) throw new PaymentMethodError('no_url', '');
    return url;
  } catch (err) {
    throw toPaymentMethodError(err);
  }
}

/**
 * setDefaultPaymentMethod makes one card the one that pays next.
 *
 * Core moves the default at Stripe on the customer AND on every live
 * subscription: the subscription's own default is what decides the next renewal,
 * so moving only the customer's would change nothing the customer can see.
 */
export async function setDefaultPaymentMethod(
  tenantId: string,
  paymentMethodId: string,
): Promise<void> {
  try {
    await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/billing/payment-methods/${encodeURIComponent(
        paymentMethodId,
      )}/default`,
      {
        method: 'POST',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
        headers: { 'Content-Type': 'application/json' },
        body: {},
      },
    );
  } catch (err) {
    throw toPaymentMethodError(err);
  }
}

/**
 * removePaymentMethod detaches a card at Stripe and disables the row.
 *
 * Core refuses the last card of an account with a live subscription
 * (`last_payment_method_on_active_subscription`) -- removing it leaves an account
 * that owes money next month and has nothing to pay with, which is measurably
 * worse than a refusal.
 */
export async function removePaymentMethod(
  tenantId: string,
  paymentMethodId: string,
): Promise<void> {
  try {
    await cdpFetchRaw(
      `/v1/tenants/${encodeURIComponent(tenantId)}/billing/payment-methods/${encodeURIComponent(
        paymentMethodId,
      )}`,
      {
        method: 'DELETE',
        auth: { kind: 'auto' },
        baseUrl: platformApiConfig.baseUrl,
      },
    );
  } catch (err) {
    throw toPaymentMethodError(err);
  }
}
