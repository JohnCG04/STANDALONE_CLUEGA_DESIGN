/** The subset of the wallet this helper reads. Declared locally, like
 * `plan-label.ts` does, so the helper stays testable without the shared billing
 * client and its fetch layer. */
export type CreditWallet = {
  tokenBalance: number;
  temporaryTokenBalance: number;
  temporaryExpiresAt: string | null;
};

/** The subset of the billing summary's plan this helper reads. */
export type CreditPlan = {
  creditsAvailable: number | null;
};

export type CreditFigures = {
  /** Every credit the tenant can spend now, free ones included. */
  total: number | null;
  /** The part of `total` that is the monthly free grant. */
  free: number | null;
  /** When the current free grant ends and the next one lands. */
  renewsAt: Date | null;
};

/**
 * The credit figures the Profile card and the Billing card both print.
 *
 * One helper because the two cards used to disagree under the same label: the
 * Profile card printed the plan's `credits_total` as "Free credits", but that
 * field is the PACKAGE CAP (mid-platform tenant_billing_client.go) and has
 * nothing to do with the free grant. The free grant is the wallet's temporary
 * balance, which is what Billing already showed.
 *
 * `total` falls back to the plan's `credits_available`, which mid-platform fills
 * from the same module balance, so a failed wallet call still leaves a real
 * number. `free` has no second source and stays null — a "—", never a guess.
 */
export function creditFigures(
  wallet: CreditWallet | null,
  plan: CreditPlan | null,
): CreditFigures {
  const total = wallet?.tokenBalance ?? plan?.creditsAvailable ?? null;
  const free = wallet ? wallet.temporaryTokenBalance : null;
  const expiry = wallet?.temporaryExpiresAt ? new Date(wallet.temporaryExpiresAt) : null;
  const renewsAt = expiry && !Number.isNaN(expiry.getTime()) ? expiry : null;
  return { total, free, renewsAt };
}
