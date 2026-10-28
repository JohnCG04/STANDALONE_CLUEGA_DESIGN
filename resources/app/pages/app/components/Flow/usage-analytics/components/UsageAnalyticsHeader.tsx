"use client";

import { useSettings } from "@/components/settings/context";
import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";

import { BuyCreditsPopover } from "./BuyCreditsPopover";

export function UsageAnalyticsHeader() {
  const { t } = useTranslate();
  const { openSettings } = useSettings();

  return (
    // The same header recipe as the other Flow tabs (Projects, Techniques).
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight text-neutral-900 dark:text-neutral-50">
          {t("usageAnalytics.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("usageAnalytics.subtitle")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <BuyCreditsPopover />
        {/* Plan comparison has no page of its own yet — the billing tab is
            where Upgrade lives today, same destination as the credits pill. */}
        <Button
          type="button"
          variant="primary"
          size="pill"
          className="text-[13px] font-semibold"
          onClick={() => openSettings("billing")}
        >
          {t("usageAnalytics.upgrade")}
        </Button>
      </div>
    </header>
  );
}
