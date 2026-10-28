"use client";

import { Coins, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { getTokenPackages, type TokenPackage } from "@/lib/billing/cdp-billing";
import type { RechargeFailureKind } from "@/lib/billing/platform-recharge";
import { RECHARGE_FAILURE_KEYS, type TokenPacksStatus } from "@/lib/billing/rechargePurchase";
import { useBuyTokenPack } from "@/lib/billing/useBuyTokenPack";
import { useRechargeReturn } from "@/lib/billing/useRechargeReturn";

import { formatUsd } from "./autoTopupGuard";

type Translate = (key: string) => string;

export type { TokenPacksStatus };

function StatusBanner({ status, t }: { status: TokenPacksStatus; t: Translate }) {
  const key = (name: string) => t(`settings.billing.tokenPacks.${name}`);
  if (status.kind === "none") return null;
  const tone =
    status.kind === "credited"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status.kind === "timeout"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        : "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";
  return (
    <div role="status" data-testid={`token-packs-${status.kind}`} className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${tone}`}>
      <div className="flex items-center gap-2">
        {status.kind === "checking" ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <span>
          {status.kind === "checking"
            ? key("checking")
            : status.kind === "credited"
              ? key("credited").replace("{balance}", status.balance.toLocaleString())
              : status.kind === "timeout"
                ? key("stillChecking")
                : key("cancelled")}
        </span>
      </div>
      {status.kind === "checking" ? <p className="mt-1 text-[11.5px] opacity-80">{key("checkingHint")}</p> : null}
    </div>
  );
}

/** Draws the packs and the state of a purchase; the container below does the asking. */
export function TokenPackagesView({
  t,
  packages,
  loadFailed,
  buyingId,
  failure,
  status,
  onBuy,
  onRetry,
}: {
  t: Translate;
  /** Null while the list loads. */
  packages: TokenPackage[] | null;
  loadFailed: boolean;
  buyingId: string | null;
  failure: RechargeFailureKind | null;
  status: TokenPacksStatus;
  onBuy: (pack: TokenPackage) => void;
  onRetry: () => void;
}) {
  const key = (name: string) => t(`settings.billing.tokenPacks.${name}`);
  // One purchase at a time, and none while the last one is still being confirmed.
  const locked = buyingId !== null || status.kind === "checking";
  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
      id="token-packs"
      data-testid="token-packs-panel"
    >
      <div className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        <Coins className="size-4" strokeWidth={1.75} />
        {key("title")}
      </div>
      <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">{key("description")}</p>

      <StatusBanner status={status} t={t} />

      <div className="mt-3">
        {packages === null ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-500 dark:text-neutral-400">
            <span>{loadFailed ? key("loadError") : t("settings.billing.noPackages")}</span>
            {loadFailed ? (
              <Button type="button" variant="outline" onClick={onRetry} className="text-[12px]">
                {key("retry")}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900">
            {packages.map((pack) => (
              <li key={pack.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`token-pack-row-${pack.id}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{pack.name}</span>
                  {pack.totalToken !== null ? (
                    <span className="block text-[12px] tabular-nums text-neutral-500 dark:text-neutral-400">
                      {key("tokens").replace("{tokens}", pack.totalToken.toLocaleString())}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {pack.priceUsd !== null ? (
                    <span className="text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{formatUsd(pack.priceUsd)}</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    disabled={locked}
                    onClick={() => onBuy(pack)}
                    data-testid={`token-pack-buy-${pack.id}`}
                    className="text-[13px] font-semibold"
                  >
                    {buyingId === pack.id ? <Loader2 className="size-4 animate-spin" /> : key("buy")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {buyingId !== null ? <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">{key("redirecting")}</p> : null}
      {failure ? (
        <p role="alert" className="mt-2 text-[12px] text-red-600 dark:text-red-400">
          {key(RECHARGE_FAILURE_KEYS[failure])}
        </p>
      ) : null}
    </div>
  );
}

/** The enabled token packs, bought by card on Stripe; claimed only once the balance rises. */
export function TokenPackagesPanel({ t }: { t: Translate }) {
  const packs = useQuery({ queryKey: ["billing", "token-packages"], queryFn: getTokenPackages, retry: false });
  const { buy, buyingId, failure } = useBuyTokenPack();
  const status = useRechargeReturn();
  return (
    <TokenPackagesView
      t={t}
      packages={packs.isPending ? null : (packs.data ?? [])}
      loadFailed={packs.isError}
      buyingId={buyingId}
      failure={failure}
      status={status}
      onBuy={(pack) => void buy(pack)}
      onRetry={() => void packs.refetch()}
    />
  );
}
