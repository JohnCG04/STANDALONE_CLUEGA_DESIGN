import type { RechargeFailureKind } from "@/lib/billing/platform-recharge";

// What a token-pack purchase leaves behind across the trip to Stripe and back.

const PENDING_KEY = "cluega.recharge.pending";
/** A purchase older than this is not waited for: a forgotten tab must not claim a credit. */
const PENDING_MAX_AGE_MS = 2 * 3600_000;
/** How long a return marker stays claimable before it is treated as stale. */
const RETURN_MAX_AGE_MS = 10 * 60_000;

export type PendingRecharge = {
  team: string | null;
  /** The balance when the person left for Stripe; null when it could not be read then. */
  balanceBefore: number | null;
  startedAt: number;
};

export type BillingReturn = "success" | "cancelled";

/** What the packs panel says about a purchase that has just come back from Stripe. */
export type TokenPacksStatus =
  | { kind: "none" }
  | { kind: "checking" }
  | { kind: "credited"; balance: number }
  | { kind: "timeout" }
  | { kind: "cancelled" };

/** The copy key (under settings.billing.tokenPacks) that says why a purchase could not start. */
export const RECHARGE_FAILURE_KEYS: Record<RechargeFailureKind, string> = {
  forbidden: "errorForbidden",
  unavailable: "errorUnavailable",
  not_configured: "errorNotConfigured",
  unknown: "errorUnknown",
};

/** Where Stripe sends the customer back: this page's settings tab, which opens from any page. */
export function rechargeReturnUrl(origin: string, pathname: string): string {
  return `${origin}${pathname}?settings=billing`;
}

/** Guarded: blocked site data throws on access, and a payment must not hang on it. */
export function rememberPendingRecharge(storage: Pick<Storage, "setItem"> | null, value: PendingRecharge): void {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // Without it the return page cannot tell what was bought; it then claims nothing.
  }
}

export function readPendingRecharge(
  storage: Pick<Storage, "getItem"> | null,
  now: number,
  wantedTeam: string | null,
): PendingRecharge | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { team?: unknown; balanceBefore?: unknown; startedAt?: unknown };
    const { team, balanceBefore, startedAt } = value;
    if (team !== null && typeof team !== "string") return null;
    if (balanceBefore !== null && typeof balanceBefore !== "number") return null;
    if (typeof startedAt !== "number") return null;
    if (now - startedAt > PENDING_MAX_AGE_MS || team !== wantedTeam) return null;
    return { team, balanceBefore, startedAt };
  } catch {
    return null;
  }
}

export function forgetPendingRecharge(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(PENDING_KEY);
  } catch {
    // Left behind, it expires by age.
  }
}

let heldReturn: { marker: BillingReturn; at: number } | null = null;

/** The URL marker is stripped before any panel mounts, so the settings opener parks it here. */
export function rememberBillingReturn(marker: BillingReturn, now: number = Date.now()): void {
  heldReturn = { marker, at: now };
}

/** The parked marker, if it is still fresh. Looking does not consume it: a remount must find it. */
export function peekBillingReturn(now: number = Date.now()): BillingReturn | null {
  return heldReturn && now - heldReturn.at <= RETURN_MAX_AGE_MS ? heldReturn.marker : null;
}

/** Called once the panel has acted on the marker, so a later tab switch does not replay it. */
export function clearBillingReturn(): void {
  heldReturn = null;
}

/** Storage can throw on access itself (blocked site data), so it is reached through this. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
