import type { PlatformInvoice } from "@/lib/billing/platform-subscriptions";

/**
 * What a paid invoice can still say about money going back, and whether the
 * customer may ask for it.
 *
 * Kept out of the panel so the arithmetic can be tested without rendering
 * anything: every branch here decides either a sentence about someone's money
 * or whether a button that moves money is offered at all.
 *
 * The RULE is Core's -- how long the window is, how much of the period may be
 * used -- and nothing here reimplements it. These functions answer the narrower
 * question a screen has to answer before it can show a button: is there any
 * money left on this invoice to send back.
 */

/** Cent-level slack, so floating point cannot leave a penny "refundable". */
const EPSILON = 0.005;

export type InvoiceRefundState = "none" | "partial" | "full" | "charged_back";

/**
 * A chargeback outranks a refund in the label.
 *
 * Both mean the money is no longer ours, but they are not the same event: one
 * is us sending it back, the other is the customer's bank taking it. An invoice
 * that shows both is the interesting case, and calling that one "refunded"
 * hides the dispute from whoever reads the row.
 */
export function invoiceRefundState(invoice: PlatformInvoice): InvoiceRefundState {
  if (invoice.chargedBackUsd > EPSILON) return "charged_back";
  if (invoice.refundedUsd <= EPSILON) return "none";
  const paid = invoice.amountPaidUsd;
  if (paid > EPSILON && invoice.refundedUsd + EPSILON >= paid) return "full";
  return "partial";
}

/** What is still on the invoice, after anything already sent or taken back. */
export function refundableUsd(invoice: PlatformInvoice): number {
  const left =
    invoice.amountPaidUsd - invoice.refundedUsd - invoice.chargedBackUsd;
  return left > EPSILON ? left : 0;
}

/**
 * Whether to offer the ask at all.
 *
 * Deliberately generous: it shows the button whenever the invoice has money on
 * it that has not come back yet, and lets Core refuse for the reasons only Core
 * knows (the window has closed, the period is spent). The alternative -- hiding
 * the button on a guess about the window -- silently denies a refund the server
 * would have given.
 *
 * An invoice settled from a credit balance is "paid" with nothing paid, so it
 * has nothing to refund and the button stays away: Core answers that one
 * `no_charge_to_refund`, and a refusal is a poor way to learn there was never
 * anything to ask for.
 */
export function canAskForRefund(invoice: PlatformInvoice): boolean {
  return invoice.status === "paid" && refundableUsd(invoice) > 0;
}

/**
 * The figure to print for an invoice.
 *
 * The provider's signed total when there is one: a credit note is negative, and
 * the unsigned column cannot hold that, so it would otherwise read as $0.00 --
 * money owed to the customer, displayed as nothing.
 */
export function invoiceTotalUsd(invoice: PlatformInvoice): number {
  return invoice.providerTotalUsd ?? invoice.totalUsd;
}

/**
 * The amount to put in "X is on its way back to your card".
 *
 * Core answers with a bare decimal string ("150.00") because it is a money
 * value, not a rendering. Printed straight into the sentence it reads as a
 * quantity of nothing -- so it is formatted in the invoice's own currency, and
 * only falls back to the raw string if it is not a number at all, since a
 * sentence with a blank where the amount should be is worse than an unadorned
 * one.
 */
export function refundOutcomeAmount(
  amountUsd: string,
  currency: string,
  format: (amount: number, currency: string) => string,
): string {
  // Number("") is 0, not NaN, so a missing amount would render "$0.00 is on its
  // way back to your card" -- a figure the customer would then look for. An
  // empty string is not a zero.
  const raw = amountUsd.trim();
  if (raw === "") return amountUsd;
  const n = Number(raw);
  if (!Number.isFinite(n)) return amountUsd;
  return format(n, currency || "USD");
}
