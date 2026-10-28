"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Sparkles } from "lucide-react";
import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import {
  createRechargeOrder,
  getTokenPackages,
  getBudgetStatus,
  readBillingSummary,
  type BillingSummary,
  type TokenPackage,
  type WalletBalance,
} from "@/lib/billing/cdp-billing";
import { readWalletBalance } from "@/hooks/useWalletBalance";
import { HelpHintLink } from "@/components/settings/HelpHintLink";
import { creditFigures } from "@/lib/billing/credit-figures";
import { planLabel } from "@/lib/billing/plan-label";
import { DunningBanner } from "./DunningBanner";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { PaymentMethodsPanel } from "./PaymentMethodsPanel";
import { AutoTopupPanel } from "./AutoTopupPanel";
import { InvoicesPanel } from "./InvoicesPanel";
import { TokenPackagesPanel } from "./TokenPackagesPanel";
import {
  bannerStateFor,
  blockedScopes,
  formatAmount,
  type BudgetScope,
} from "@/components/settings/tabs/budgetStatus";

function formatTokens(n: number | null): string {
  return n == null ? "—" : n.toLocaleString();
}

const CREDITS_HELP_PATH = "/help/company/credits-and-managed-plans";
const CREDITS_RENEWAL_HELP_PATH =
  "/help/company/credits-and-managed-plans#section-4";

/** The tenant's ad-spend caps, and a banner when one of them is biting.
 *
 *  Renders nothing when no budget is configured — an unconfigured cap denies
 *  nothing, so an empty panel would only invite the question "what is this?". */
function AdBudgetPanel({
  scopes,
  t,
}: {
  scopes: BudgetScope[];
  t: (key: string) => string;
}) {
  if (scopes.length === 0) return null;

  const banner = bannerStateFor(scopes);
  const stopped = blockedScopes(scopes);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        {t("settings.billing.adBudgetTitle")}
      </div>

      {banner === "blocked" && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
          <div className="font-semibold">
            {t("settings.billing.adBudgetBlockedTitle")}
          </div>
          {/* The second sentence is the one that matters: without it the customer
              re-enables the campaigns, gets paused again, and opens a ticket. */}
          <div className="mt-1">
            {t("settings.billing.adBudgetBlockedBody")}
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {stopped.map((s, i) => (
              <div
                key={`${s.scope}-${s.advertiser_id ?? "tenant"}-${i}`}
                className="font-medium"
              >
                {s.scope === "tenant"
                  ? t("settings.billing.adBudgetScopeTenant")
                  : s.advertiser_id}
                {" · "}
                {formatAmount(s.currency, s.spent_amount)} /{" "}
                {formatAmount(s.currency, s.budget_amount)}
              </div>
            ))}
          </div>
        </div>
      )}

      {banner === "warning" && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <div className="font-semibold">
            {t("settings.billing.adBudgetWarningTitle")}
          </div>
          <div className="mt-1">
            {t("settings.billing.adBudgetWarningBody")}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {scopes.map((s, i) => (
          <div
            key={`${s.scope}-${s.advertiser_id ?? "tenant"}-${i}`}
            className="flex items-baseline justify-between gap-3 border-b border-dashed border-neutral-200 pb-3 last:border-0 last:pb-0 dark:border-neutral-800"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                {s.scope === "tenant"
                  ? t("settings.billing.adBudgetScopeTenant")
                  : s.advertiser_id}
              </div>
              <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                {s.period_start} – {s.period_end}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {/* Currency always shown: these amounts are denominated in the
                  advertiser's own currency and are frequently not USD. */}
              <div className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                {formatAmount(s.currency, s.spent_amount)} /{" "}
                {formatAmount(s.currency, s.budget_amount)}
              </div>
              <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
                {formatAmount(s.currency, s.remaining_amount)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Both caveats are true and both are things a customer would otherwise
          assume away. Not dismissable. */}
      <div className="mt-3 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {t("settings.billing.adBudgetLag")}
      </div>
    </div>
  );
}

export function UsageBillingTab() {
  const { t } = useTranslate();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [budgetScopes, setBudgetScopes] = useState<BudgetScope[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // The shared, briefly-cached reads for the two figures the modal and the
      // Profile tab also want: switching a settings tab unmounts it, so the raw
      // calls asked again on every return. They answer null instead of throwing on
      // failure, which also stops one flaky endpoint — this wallet call has been
      // seen returning 502 intermittently — from blanking a tab whose packages and
      // invoices loaded perfectly well.
      const [bal, pkgs, sum] = await Promise.all([
        readWalletBalance(),
        getTokenPackages(),
        readBillingSummary(),
      ]);
      setBalance(bal);
      setPackages(pkgs);
      setSummary(sum);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }

    // Loaded separately and swallowed on failure, deliberately. The wallet,
    // packages and invoices above are independent and still useful; blanking
    // the whole tab because the budget endpoint hiccuped would take away more
    // than it protects. A missing budget panel is visibly missing.
    try {
      setBudgetScopes(await getBudgetStatus());
    } catch (e) {
      console.warn("budget status unavailable", e);
      setBudgetScopes([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = useCallback(
    async (pkg: TokenPackage) => {
      setBuyingId(pkg.id);
      setNotice(null);
      setActionError(null);
      try {
        const order = await createRechargeOrder(pkg.id);
        setNotice(
          t("settings.billing.rechargePending").replace(
            "{order}",
            order.orderNo ?? "",
          ),
        );
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      } finally {
        setBuyingId(null);
      }
    },
    [t],
  );

  // Null, not a stand-in number: when the wallet call fails these render as "—"
  // rather than quoting a balance the tenant does not actually have. Shared with
  // the Profile card, so the two cards cannot print different figures under the
  // same label again.
  const credits = creditFigures(balance, summary?.plan ?? null);
  // Free credits renew per calendar month, not daily, and the platform never
  // exposes the allowance itself — only the balance and the expiry of the
  // current grant. Show the real renewal date; hide the row when there is none.
  const renewalLabel = credits.renewsAt
    ? credits.renewsAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";
  const primaryPackage = packages[0];

  return (
    <div className="flex flex-col gap-5">
      <DunningBanner dunning={summary?.dunning ?? null} />
      <AdBudgetPanel scopes={budgetScopes} t={t} />
      <SubscriptionPanel t={t} />
      {/* Between the plan and its invoices: what pays for the one and settles
          the other. */}
      <PaymentMethodsPanel t={t} />
      {/* Right after the cards: auto top-up charges the default one (PLT-034). */}
      <AutoTopupPanel t={t} />
      {/* One-off packs: bought by card on Stripe, credited by its webhook. */}
      <TokenPackagesPanel t={t} />
      <InvoicesPanel t={t} />
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-dashed border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {planLabel(summary?.plan ?? null, t("settings.billing.planTitle"))}
          </div>
          <Button
            type="button"
            variant="primary"
            disabled
            onClick={() => {
              if (primaryPackage) void buy(primaryPackage);
            }}
            className="text-[13px] font-semibold"
          >
            {buyingId ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("settings.billing.upgradePlan")
            )}
          </Button>
        </div>

        <div className="flex items-start justify-between pt-4">
          <div className="flex items-start gap-2">
            <Sparkles
              className="mt-0.5 size-4 text-neutral-700 dark:text-neutral-300"
              strokeWidth={1.75}
            />
            <div>
              <div className="flex items-center gap-1 text-[13px] text-neutral-900 dark:text-neutral-100">
                {t("settings.billing.credits")}
                <HelpHintLink
                  path={CREDITS_HELP_PATH}
                  label={t("settings.billing.creditsHelp")}
                />
              </div>
              <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                {t("settings.billing.freeCredits")}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[14px] font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
              {loading ? "…" : formatTokens(credits.total)}
            </div>
            <div className="mt-0.5 text-[12px] text-neutral-400 tabular-nums">
              {loading ? "…" : formatTokens(credits.free)}
            </div>
          </div>
        </div>

        {/* No figure on this row: the only one there is would be the free
            balance printed just above, and a bare "0" beside a renewal date read
            as "you will get nothing". */}
        {credits.renewsAt && (
          <div className="flex items-start justify-between pt-3">
            <div className="flex items-start gap-2">
              <CalendarClock
                className="mt-0.5 size-4 text-neutral-700 dark:text-neutral-300"
                strokeWidth={1.75}
              />
              <div>
                <div className="flex items-center gap-1 text-[13px] text-neutral-900 dark:text-neutral-100">
                  {t("settings.billing.creditsRenewal")}
                  <HelpHintLink
                    path={CREDITS_RENEWAL_HELP_PATH}
                    label={t("settings.billing.creditsRenewalHelp")}
                  />
                </div>
                <div className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                  {t("settings.billing.creditsRenewalHint").replace("{date}", renewalLabel)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {loadError}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {actionError}
        </div>
      ) : null}

    </div>
  );
}
