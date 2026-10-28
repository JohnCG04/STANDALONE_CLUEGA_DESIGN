"use client";

import { Sparkles } from "lucide-react";

import { useSettings } from "@/components/settings/context";
import { useTranslate } from "@/hooks/useTranslate";
import { isLowCredit, LOW_CREDIT_THRESHOLD_PERCENT } from "@/lib/flow/usage-analytics/lowCredit";

import { useCurrentCredits } from "../hooks/useCurrentCredits";

// US-06's nudge: a soft banner, never a blocking popup. Only a PERCENT state
// can trigger it (isLowCredit) — an unknown balance must not nag.
//
// Reads the wallet itself, from the same cache entry the Current Credits card
// uses: one request, and the two can never quote different balances.
export function LowCreditBanner() {
  const { t } = useTranslate();
  const { openSettings } = useSettings();
  const { remaining } = useCurrentCredits();

  if (!isLowCredit(remaining)) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" strokeWidth={1.75} />
        <div className="text-[13px] text-amber-900 dark:text-amber-100">
          <span className="font-semibold">{t("usageAnalytics.lowCredit.title")}</span>
          <span className="ml-1.5">
            {t("usageAnalytics.lowCredit.body").replace(
              "{percent}",
              String(LOW_CREDIT_THRESHOLD_PERCENT),
            )}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => openSettings("billing")}
        className="rounded-full border border-amber-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
      >
        {t("usageAnalytics.lowCredit.action")}
      </button>
    </div>
  );
}
