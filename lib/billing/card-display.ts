import type { PlatformPaymentMethod } from "@/lib/billing/payment-methods";

// The service itself lives in packages/shared. This file is named
// card-display.ts and not payment-methods.ts on purpose: the app's "@/*" alias
// resolves against apps/app FIRST, so a same-named file here would shadow the
// shared module for every importer in this app.

/**
 * How the cards are presented, kept out of the component so the two decisions
 * that matter can be tested: which cards a customer may pay with, and whether
 * one of them has expired.
 *
 * Nothing here decides what Core will allow -- removing a card, or making one
 * the default, is Core's call and its refusal is what the screen shows.
 */

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  american_express: "American Express",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners Club",
  unionpay: "UnionPay",
};

/**
 * The provider's brand, in the customer's spelling.
 *
 * Core stores it lowercase as the provider sends it ("visa", "unionpay"), and a
 * row reading "unionpay" looks like a bug on a screen where everything else is
 * written out. An unknown brand is capitalised rather than dropped: a card whose
 * brand we cannot name is still a card the customer recognises.
 */
export function brandLabel(brand: string | null): string | null {
  const key = brand?.trim().toLowerCase() ?? "";
  if (key === "") return null;
  return BRAND_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** "12/2031", or null when the provider gave no expiry. */
export function formatExpiry(
  month: number | null,
  year: number | null,
): string | null {
  if (month === null || year === null) return null;
  if (month < 1 || month > 12) return null;
  return `${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Whether the card can no longer be charged.
 *
 * A card is good until the END of its expiry month -- 12/2031 is valid through
 * 31 December 2031 -- so comparing on the month itself would declare a working
 * card dead for up to 31 days. Callers pass `now` so this stays a function of
 * its arguments and the boundary is testable.
 */
export function isExpired(
  method: Pick<PlatformPaymentMethod, "expiresMonth" | "expiresYear">,
  now: Date,
): boolean {
  const { expiresMonth: month, expiresYear: year } = method;
  if (month === null || year === null) return false;
  if (year < now.getUTCFullYear()) return true;
  if (year > now.getUTCFullYear()) return false;
  return month < now.getUTCMonth() + 1;
}

/**
 * The cards a customer can actually pay with, in the order to show them.
 *
 * Removed cards are dropped. Core keeps their rows so an old receipt can still
 * name the card that paid it, but a list of ways to pay is not the place for the
 * ones that cannot -- and one of them was the customer's default until they
 * removed it, so it would sit at the top.
 *
 * The default comes first because it answers the question the screen is opened
 * with: which card gets charged next.
 */
export function payableMethods(
  methods: PlatformPaymentMethod[],
): PlatformPaymentMethod[] {
  return methods
    .filter((m) => (m.status ?? "active") === "active")
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const brand = (brandLabel(a.brand) ?? "").localeCompare(
        brandLabel(b.brand) ?? "",
      );
      if (brand !== 0) return brand;
      return (a.last4 ?? "").localeCompare(b.last4 ?? "");
    });
}
