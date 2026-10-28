"use client";

import type { DunningStatus } from "@/lib/billing/cdp-billing";
import { useTranslate } from "@/hooks/useTranslate";

export function DunningBanner({ dunning }: { dunning: DunningStatus | null }) {
  const { t } = useTranslate();
  if (!dunning || dunning.stage === "current") return null;

  if (dunning.suspended) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {t("settings.billing.dunningSuspended")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      {t("settings.billing.dunningGrace")}
    </div>
  );
}
