"use client";

import useSWR from "swr";

import { readWalletBalance } from "@/hooks/useWalletBalance";
import { readBillingSummary } from "@/lib/billing/cdp-billing";
import { resolveCreditsRemaining } from "@/lib/flow/creditsRemaining";
import { usageSwrKeys } from "@/lib/flow/usage-analytics/usageSwrKeys";

import { STALE_MS } from "../constants";
import type { CurrentCredits } from "../types";
import { useTeamScope } from "./useTeamScope";

/**
 * Current Credits — the live wallet and plan pair, not the usage endpoint.
 *
 * The usage read reports the same balance, but this figure must equal the one
 * the billing tab quotes (the PRD's single-source-of-truth constraint), and it
 * is also what the low-credit banner's three-state pill is computed from. Both
 * reads answer null on failure, so a wallet outage renders "—" rather than a
 * fake zero.
 */
export function useCurrentCredits() {
  const { teamId, enabled } = useTeamScope();

  const { data, isLoading } = useSWR<CurrentCredits>(
    enabled ? usageSwrKeys.wallet(teamId) : null,
    async () => {
      const [summary, balance] = await Promise.all([
        readBillingSummary(),
        readWalletBalance(),
      ]);
      return {
        credits: balance?.tokenBalance ?? summary?.plan?.creditsAvailable ?? null,
        remaining: resolveCreditsRemaining(
          summary?.plan ?? null,
          balance?.tokenBalance ?? null,
        ),
      };
    },
    { dedupingInterval: STALE_MS },
  );

  return {
    credits: data?.credits ?? null,
    remaining: data?.remaining ?? null,
    isLoading,
  };
}
