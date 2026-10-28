import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { AutoTopupError, type AutoTopupSettings } from "@/lib/billing/auto-topup";

/** What the admin is editing; the limit stays text so a half-typed number survives. */
export interface AutoTopupDraft {
  enabled: boolean;
  thresholdCredits: number;
  tokenPackageId: string | null;
  monthlyLimit: string;
  consent: boolean;
}

export function draftFromSettings(s: AutoTopupSettings): AutoTopupDraft {
  return {
    enabled: s.enabled,
    thresholdCredits: s.thresholdCredits,
    tokenPackageId: s.tokenPackageId,
    monthlyLimit: s.monthlyLimitUsd == null ? "" : String(s.monthlyLimitUsd),
    consent: false,
  };
}

export const MAX_MONTHLY_LIMIT_USD = 100000;

/** The limit when it is a valid amount (0 < n <= 100000, whole cents), else null. */
export function parseLimit(text: string): number | null {
  const n = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(n) || n <= 0 || n > MAX_MONTHLY_LIMIT_USD) return null;
  return Math.round(n * 100) / 100 === n ? n : null;
}

/** Consent is needed when turning on, or changing threshold, pack or limit while on. */
export function needsConsent(saved: AutoTopupSettings, draft: AutoTopupDraft): boolean {
  if (!draft.enabled) return false;
  if (!saved.enabled) return true;
  return (
    draft.thresholdCredits !== saved.thresholdCredits ||
    draft.tokenPackageId !== saved.tokenPackageId ||
    parseLimit(draft.monthlyLimit) !== saved.monthlyLimitUsd
  );
}

export type LimitProblem = "required" | "invalid" | "belowPack" | null;

/** Client-side check only; Core stays the authority. */
export function limitProblem(draft: AutoTopupDraft, packPriceUsd: number | null): LimitProblem {
  if (!draft.enabled) return null;
  const limit = parseLimit(draft.monthlyLimit);
  if (limit === null) return draft.monthlyLimit.trim() === "" ? "required" : "invalid";
  return packPriceUsd != null && limit < packPriceUsd ? "belowPack" : null;
}

/**
 * Client-side mirror of Core's THRESHOLD_NOT_BELOW_PACK: the threshold must be
 * strictly below the credits of the pack bought, or one purchase would trigger
 * the next. Unknown pack credits cannot be judged here, so Core decides.
 */
export function thresholdProblem(draft: AutoTopupDraft, packCredits: number | null | undefined): boolean {
  if (!draft.enabled || packCredits == null) return false;
  return draft.thresholdCredits >= packCredits;
}

/**
 * Whether a stored `limit_reached` still holds this month. Core leaves the status
 * in the row after the UTC month rolls over until the next purchase re-evaluates
 * it, so the banner shows only when one more pack would still pass the limit.
 * With no pack price known, it holds only once the limit is already used up.
 */
export function limitReachedApplies(s: AutoTopupSettings, packPriceUsd: number | null): boolean {
  if (s.lastStatus !== "limit_reached" || s.monthlyLimitUsd == null) return false;
  if (packPriceUsd == null) return s.monthChargedUsd >= s.monthlyLimitUsd;
  return s.monthChargedUsd + packPriceUsd > s.monthlyLimitUsd;
}

export function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export interface ConsentValues {
  card: string;
  packPriceUsd: number | null;
  packName: string;
  thresholdCredits: number;
  limitUsd: number | null;
}

/** Fills the translated consent sentence with the values the admin is authorising. */
export function consentText(template: string, v: ConsentValues): string {
  return template
    .replace("{card}", v.card)
    .replace("{price}", v.packPriceUsd == null ? "" : formatUsd(v.packPriceUsd))
    .replace("{pack}", v.packName)
    .replace("{threshold}", v.thresholdCredits.toLocaleString("en-US"))
    .replace("{limit}", v.limitUsd == null ? "" : formatUsd(v.limitUsd))
    .replace(/ {2,}/g, " ");
}

/** The i18n key (under settings.billing.autoTopup) for a failed save; null keeps the server text. */
export function saveErrorKey(code: string): string | null {
  switch (code) {
    case "HUMAN_USER_REQUIRED":
      return "errorHumanUserRequired";
    case "CONSENT_REQUIRED":
      return "errorConsentRequired";
    case "NO_DEFAULT_PAYMENT_METHOD":
      return "noCard";
    case "INVALID_MONTHLY_LIMIT":
      return "limitInvalid";
    case "PACKAGE_REQUIRED":
      return "noPackage";
    case "SETTINGS_CHANGED":
      return "errorSettingsChanged";
    case "PACKAGE_UNAVAILABLE":
      return "errorPackageUnavailable";
    case "THRESHOLD_NOT_BELOW_PACK":
      return "errorThresholdNotBelowPack";
    case "AUTO_TOPUP_DISABLED":
      return "errorDisabled";
    default:
      return null;
  }
}

/** On SETTINGS_CHANGED (edited in another tab) drop the draft and refetch the saved view. */
export function handleSaveError(error: unknown, queryClient: QueryClient, key: QueryKey, resetDraft: () => void) {
  if (!(error instanceof AutoTopupError) || error.code !== "SETTINGS_CHANGED") return;
  resetDraft();
  void queryClient.invalidateQueries({ queryKey: key });
}
