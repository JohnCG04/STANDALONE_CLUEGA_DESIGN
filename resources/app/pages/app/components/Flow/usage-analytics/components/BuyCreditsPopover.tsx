"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTranslate } from "@/hooks/useTranslate";
import { getTokenPackages, type TokenPackage } from "@/lib/billing/cdp-billing";
import { RECHARGE_FAILURE_KEYS } from "@/lib/billing/rechargePurchase";
import { useBuyTokenPack } from "@/lib/billing/useBuyTokenPack";
import { cn } from "@/lib/utils";

// US-06's "Buy credit packs": buys through the same Stripe Checkout as Usage & Billing.
export function BuyCreditsPopover() {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<TokenPackage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { buy, buyingId, failure } = useBuyTokenPack();

  const load = async () => {
    setLoadError(null);
    try {
      setPackages(await getTokenPackages());
    } catch (e) {
      setPackages([]);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && packages === null) void load();
      }}
    >
      <PopoverTrigger className="flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">
        {t("usageAnalytics.buyCredits")}
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          strokeWidth={2}
        />
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} className="w-[280px] p-2">
        {packages === null ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : packages.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
            {loadError ?? t("dashboard.state.empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                disabled={buyingId !== null}
                onClick={() => void buy(pkg)}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                    {pkg.name}
                  </span>
                  {pkg.totalToken !== null ? (
                    <span className="block text-[12px] text-neutral-500 tabular-nums dark:text-neutral-400">
                      {pkg.totalToken.toLocaleString()} credits
                    </span>
                  ) : null}
                </span>
                {buyingId === pkg.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : pkg.priceUsd !== null ? (
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                    ${pkg.priceUsd}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {failure ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {t(`settings.billing.tokenPacks.${RECHARGE_FAILURE_KEYS[failure]}`)}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
