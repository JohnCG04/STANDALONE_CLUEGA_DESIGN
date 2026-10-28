"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AutoTopupError, getAutoTopup, saveAutoTopup, type AutoTopupSettings } from "@/lib/billing/auto-topup";
import { brandLabel, payableMethods } from "@/lib/billing/card-display";
import { getTokenPackages } from "@/lib/billing/cdp-billing";
import { readTenantPaymentMethods } from "@/lib/billing/payment-methods";
import { BuyCreditsPopover } from "@/resources/app/pages/app/components/Flow/usage-analytics/components/BuyCreditsPopover";
import {
  consentText,
  handleSaveError,
  draftFromSettings,
  formatUsd,
  limitProblem,
  needsConsent,
  parseLimit,
  saveErrorKey,
  limitReachedApplies,
  thresholdProblem,
  type AutoTopupDraft,
} from "./autoTopupGuard";

type Translate = (key: string) => string;

export const AUTO_TOPUP_QUERY_KEY = ["billing", "auto-topup"] as const;

/**
 * Auto top-up for the CDP wallet (PLT-034 / LIB2-004): below the threshold, Core
 * buys the chosen pack with the default card, off-session. With it on, storage
 * past the plan keeps saving instead of stopping at the 110% grace limit.
 *
 * Turning it on needs a default card; the switch says so instead of letting Core
 * refuse the save.
 */
export function AutoTopupPanel({ t, initialDraft = null }: { t: Translate; initialDraft?: AutoTopupDraft | null }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: AUTO_TOPUP_QUERY_KEY, queryFn: ({ signal }) => getAutoTopup(signal), retry: false });
  const packages = useQuery({ queryKey: ["billing", "token-packages"], queryFn: getTokenPackages, retry: false });

  // What the admin changed (render tests seed it); until then the saved settings show.
  const [edited, setEdited] = useState<AutoTopupDraft | null>(initialDraft);
  const { tenant } = useCurrentUser();
  const tenantId = tenant?.id ?? null;
  // Only names the card in the consent text; without it the text says "default card".
  const cards = useQuery({
    queryKey: ["billing", "payment-methods", tenantId],
    queryFn: () => readTenantPaymentMethods(tenantId ?? ""),
    enabled: tenantId !== null,
    retry: false,
  });

  const save = useMutation({
    mutationFn: saveAutoTopup,
    onSuccess: (next) => {
      queryClient.setQueryData(AUTO_TOPUP_QUERY_KEY, next);
      setEdited(null);
    },
    onError: (error) => handleSaveError(error, queryClient, AUTO_TOPUP_QUERY_KEY, () => setEdited(null)),
  });

  if (settings.isError) {
    return (
      <Shell t={t}>
        <p className="text-[13px] text-neutral-500">{t("settings.billing.autoTopup.unavailable")}</p>
      </Shell>
    );
  }
  if (!settings.data) {
    return (
      <Shell t={t}>
        <Loader2 className="size-4 animate-spin text-neutral-400" />
      </Shell>
    );
  }

  const saved = settings.data;
  const draft: AutoTopupDraft = edited ?? draftFromSettings(saved);
  // A changed value voids a ticked consent: the sentence names the old values.
  const change = (patch: Partial<AutoTopupDraft>) => setEdited({ ...draft, consent: false, ...patch });
  const hasCard = saved.hasDefaultPaymentMethod;
  const missingPackage = draft.enabled && !draft.tokenPackageId;
  const pack = (packages.data ?? []).find((p) => p.id === draft.tokenPackageId);
  const packPrice = pack?.priceUsd ?? null;
  const problem = limitProblem(draft, packPrice);
  const thresholdTooHigh = thresholdProblem(draft, pack?.totalToken);
  const globallyDisabled = saved.globallyDisabled;
  const consentNeeded = needsConsent(saved, draft);
  const defaultCard = payableMethods(cards.data ?? []).find((m) => m.isDefault && m.last4);
  const cardLabel = defaultCard
    ? `${brandLabel(defaultCard.brand) ?? ""} •••• ${defaultCard.last4}`.trim()
    : t("settings.billing.autoTopup.consentCardFallback");
  const blocked =
    (draft.enabled && !hasCard) ||
    (draft.enabled && globallyDisabled) ||
    missingPackage ||
    thresholdTooHigh ||
    problem !== null ||
    (consentNeeded && !draft.consent);

  return (
    <Shell t={t}>
      <p className="text-[12px] text-neutral-500 dark:text-neutral-400">{t("settings.billing.autoTopup.hint")}</p>
      {globallyDisabled ? (
        <p
          className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          data-testid="auto-topup-globally-disabled"
        >
          {t("settings.billing.autoTopup.globallyDisabled")}
        </p>
      ) : null}
      <label className="mt-4 flex items-center gap-2 text-[13px] text-neutral-900 dark:text-neutral-100">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={(!hasCard || globallyDisabled) && !draft.enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
          data-testid="auto-topup-enabled"
        />
        {t("settings.billing.autoTopup.enabled")}
      </label>
      {!hasCard ? (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">{t("settings.billing.autoTopup.noCard")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
        <span>{t("settings.billing.autoTopup.threshold")}</span>
        <input
          type="number"
          min={0}
          step={100}
          value={draft.thresholdCredits}
          onChange={(e) => change({ thresholdCredits: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="auto-topup-threshold"
        />
        <span>{t("settings.billing.autoTopup.package")}</span>
        <select
          value={draft.tokenPackageId ?? ""}
          onChange={(e) => change({ tokenPackageId: e.target.value || null })}
          className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="auto-topup-package"
        >
          <option value="">—</option>
          {(packages.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.id}
              {p.totalToken != null ? ` · ${p.totalToken.toLocaleString()}` : ""}
              {p.priceUsd != null ? ` · $${p.priceUsd}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-neutral-700 dark:text-neutral-300">
        <span>{t("settings.billing.autoTopup.monthlyLimit")}</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={draft.monthlyLimit}
          onChange={(e) => change({ monthlyLimit: e.target.value })}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          data-testid="auto-topup-limit"
        />
        {saved.monthlyLimitUsd != null ? (
          <span className="text-[12px] text-neutral-500 dark:text-neutral-400" data-testid="auto-topup-charged">
            {t("settings.billing.autoTopup.chargedThisMonth")
              .replace("{charged}", formatUsd(saved.monthChargedUsd))
              .replace("{limit}", formatUsd(saved.monthlyLimitUsd))}
          </span>
        ) : null}
      </div>
      {missingPackage ? (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">{t("settings.billing.autoTopup.noPackage")}</p>
      ) : null}
      {thresholdTooHigh ? (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300" data-testid="auto-topup-threshold-problem">
          {t("settings.billing.autoTopup.errorThresholdNotBelowPack")}
        </p>
      ) : null}
      {problem ? (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300" data-testid="auto-topup-limit-problem">
          {problem === "required"
            ? t("settings.billing.autoTopup.limitRequired")
            : problem === "invalid"
              ? t("settings.billing.autoTopup.limitInvalid")
              : t("settings.billing.autoTopup.limitBelowPack").replace("{price}", formatUsd(packPrice ?? 0))}
        </p>
      ) : null}
      {consentNeeded ? (
        <label className="mt-3 flex items-start gap-2 text-[12px] text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={draft.consent}
            onChange={(e) => setEdited({ ...draft, consent: e.target.checked })}
            data-testid="auto-topup-consent"
          />
          <span data-testid="auto-topup-consent-text">
            {consentText(t("settings.billing.autoTopup.consentText"), {
              card: cardLabel,
              packPriceUsd: packPrice,
              packName: pack?.name || pack?.id || "",
              thresholdCredits: draft.thresholdCredits,
              limitUsd: parseLimit(draft.monthlyLimit),
            })}
          </span>
        </label>
      ) : null}
      {saved.enabled && saved.consentAt ? (
        <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400" data-testid="auto-topup-consent-given">
          {t("settings.billing.autoTopup.consentGiven").replace(
            "{date}",
            new Date(saved.consentAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
          )}
        </p>
      ) : null}
      <StatusNotice settings={saved} packPriceUsd={packPrice} t={t} />
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" data-testid="auto-topup-save" disabled={blocked || save.isPending} onClick={() =>
            save.mutate({
              enabled: draft.enabled,
              thresholdCredits: draft.thresholdCredits,
              tokenPackageId: draft.tokenPackageId,
              monthlyLimitUsd: parseLimit(draft.monthlyLimit),
              consent: draft.consent,
            })
          }>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : t("settings.billing.autoTopup.save")}
        </Button>
        {save.isSuccess ? <span className="text-[12px] text-emerald-600">{t("settings.billing.autoTopup.saved")}</span> : null}
        {save.isError ? (
          <span className="text-[12px] text-red-600" data-testid="auto-topup-error">
            {saveErrorText(save.error, t)}
          </span>
        ) : null}
      </div>
    </Shell>
  );
}

function saveErrorText(error: unknown, t: Translate): string {
  const key = error instanceof AutoTopupError ? saveErrorKey(error.code) : null;
  if (key) return t(`settings.billing.autoTopup.${key}`);
  return error instanceof Error ? error.message : String(error);
}

function StatusNotice({ settings, packPriceUsd, t }: { settings: AutoTopupSettings; packPriceUsd: number | null; t: Translate }) {
  if (settings.lastStatus === "failed") {
    return (
      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
        {t("settings.billing.autoTopup.lastFailed").replace("{error}", settings.lastError ?? "")}
      </p>
    );
  }
  if (settings.lastStatus === "requires_authentication") {
    return (
      <div
        className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        data-testid="auto-topup-requires-authentication"
      >
        <span>{t("settings.billing.autoTopup.requiresAuthentication")}</span>
        <BuyCreditsPopover />
      </div>
    );
  }
  if (limitReachedApplies(settings, packPriceUsd)) {
    return (
      <p
        className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        data-testid="auto-topup-limit-reached"
      >
        {t("settings.billing.autoTopup.limitReached").replace("{limit}", formatUsd(settings.monthlyLimitUsd ?? 0))}
      </p>
    );
  }
  return null;
}

function Shell({ t, children }: { t: Translate; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
      id="auto-topup"
      data-testid="auto-topup-panel"
    >
      <div className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        <RefreshCw className="size-4" strokeWidth={1.75} />
        {t("settings.billing.autoTopup.title")}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
