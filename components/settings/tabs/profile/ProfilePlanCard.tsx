"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Sparkles } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import { getCdpToken } from "@/lib/ai-agent/cluega-session-auth";
import {
  readBillingSummary,
  type BillingSummary,
  type WalletBalance,
} from "@/lib/billing/cdp-billing";
import { readWalletBalance } from "@/hooks/useWalletBalance";
import { creditFigures } from "@/lib/billing/credit-figures";
import { planLabel } from "@/lib/billing/plan-label";
import { useSettings } from "../../context";

type PlanReads = {
  /** False until both reads have answered, successfully or not. */
  settled: boolean;
  wallet: WalletBalance | null;
  summary: BillingSummary | null;
};

/**
 * Plan name, credit balances, and when the free credits renew.
 *
 * Owns its own read: the two figures come from one pair of briefly-cached calls
 * and nothing else on the Profile tab needs them, so keeping the fetch here
 * means the tab has no billing state to thread through.
 */
export function ProfilePlanCard() {
  const { t } = useTranslate();
  const { setActiveTab } = useSettings();
  const [reads, setReads] = useState<PlanReads>({
    settled: false,
    wallet: null,
    summary: null,
  });

  useEffect(() => {
    let cancelled = false;
    // The shared, briefly-cached reads rather than the raw client calls. This tab
    // and the modal around it both want these two figures and mount in the same
    // tick, and switching a settings tab unmounts it — so the raw calls meant two
    // requests each on open, and two more on every return. Both answer null
    // instead of throwing, which is what "could not load" means below.
    //
    // Without a token there is nothing to ask, but the card must still settle —
    // through the same promise, so no state is set synchronously in the effect.
    const read = getCdpToken()
      ? Promise.all([readWalletBalance(), readBillingSummary()])
      : Promise.resolve([null, null] as const);
    void read.then(([wallet, summary]) => {
      if (!cancelled) setReads({ settled: true, wallet, summary });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { settled, wallet, summary } = reads;
  const credits = creditFigures(wallet, summary?.plan ?? null);
  // Free credits are granted per calendar month by the platform (see
  // mid-platform ensureMonthlyFreeGrant), not daily, and the allowance itself is
  // never exposed by the API — only the balance and its expiry are. So this row
  // shows the real renewal date and hides itself when there is nothing to renew,
  // rather than inventing a refresh amount or cadence. It carries no figure of
  // its own: the only one available is the free balance, already printed above,
  // and a bare "0" beside a renewal date read as "you will get nothing".
  const renewalLabel = credits.renewsAt
    ? credits.renewsAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  // "…" while asking, "—" once the answer is that there is no answer. The two
  // used to be the same ellipsis, so a failed read looked like one still in
  // flight, forever.
  const formatNumber = (value: number | null) =>
    !settled ? "…" : value == null ? "—" : value.toLocaleString();

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-dashed border-neutral-200 pb-4 dark:border-neutral-800">
        {/* Never a guessed "Free Plan": while asking it is a placeholder bar, and
            a summary that did not answer says so. A null summary is "unknown",
            not "no plan" — see isFreePlan in plan-label. */}
        {!settled ? (
          <div
            aria-hidden="true"
            className="h-5 w-28 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800"
          />
        ) : summary ? (
          <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {planLabel(summary.plan, t("settings.common.freePlan"))}
          </div>
        ) : (
          <div className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
            {t("settings.profile.planUnavailable")}
          </div>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={() => setActiveTab("billing")}
          className="text-[13px] font-semibold"
        >
          {t("settings.common.upgrade")}
        </Button>
      </div>
      <div className="flex items-start justify-between pt-4">
        <div className="flex items-start gap-2">
          <Sparkles
            className="mt-0.5 h-4 w-4 text-neutral-700 dark:text-neutral-300"
            strokeWidth={1.75}
          />
          <div>
            <div className="text-[13px] text-neutral-900 dark:text-neutral-100">
              {t("settings.profile.credits")}
            </div>
            <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400 font-semibold">
              {t("settings.profile.freeCredits")}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
            {formatNumber(credits.total)}
          </div>
          <div className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500 font-semibold">
            {formatNumber(credits.free)}
          </div>
        </div>
      </div>
      {credits.renewsAt && (
        <div className="flex items-start justify-between pt-3">
          <div className="flex items-start gap-2">
            <CalendarClock
              className="mt-0.5 h-4 w-4 text-neutral-700 dark:text-neutral-300"
              strokeWidth={1.75}
            />
            <div>
              <div className="text-[13px] text-neutral-900 dark:text-neutral-100">
                {t("settings.profile.creditsRenewal")}
              </div>
              <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400 font-semibold">
                {t("settings.profile.creditsRenewalHint").replace("{date}", renewalLabel)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
