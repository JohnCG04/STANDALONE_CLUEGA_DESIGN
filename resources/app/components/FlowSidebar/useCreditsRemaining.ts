"use client";

import { useEffect, useMemo, useState } from "react";

import { useActiveTeam } from "@/hooks/useActiveTeam";
import { readWalletBalance } from "@/hooks/useWalletBalance";
import { getCdpToken } from "@/lib/ai-agent/cluega-session-auth";
import { readBillingSummary } from "@/lib/billing/cdp-billing";
import {
  resolveCreditsRemaining,
  type CreditsQuota,
  type CreditsRemaining,
} from "@/lib/flow/creditsRemaining";

/** Both figures the pill can show, read together so they belong to one team. */
type Figures = {
  plan: CreditsQuota | null;
  tokenBalance: number | null;
};

/**
 * What the footer's credits pill shows — see lib/flow/creditsRemaining.ts for
 * the three states and why the plan is read before the wallet.
 *
 * `undefined` while the figures are still being read (the pill shows a
 * skeleton); afterwards the resolved state, where `null` means genuinely
 * unknown.
 *
 * Both reads go through the shared, briefly-cached readers (readBillingSummary,
 * readWalletBalance) rather than fresh requests: the settings modal reads the
 * same two figures, and each reader keys its cache on the active team. They are
 * read TOGETHER, keyed on useActiveTeam's id, so a workspace switch replaces
 * both — a wallet figure read once on mount would keep quoting the previous
 * team's balance next to the new team's plan. No polling — a failed balance
 * read is remembered on purpose (a refused 401 costs a token refresh), and an
 * interval here would rotate tokens for such tenants.
 */
export function useCreditsRemaining(): CreditsRemaining | undefined {
  const [figures, setFigures] = useState<Figures | undefined>(undefined);
  // Re-read when the active team changes — including the fallback resolution
  // (first team persisted without an event), which only this hook's re-render
  // reflects; the shared readers key their caches on the same id.
  const { activeId } = useActiveTeam();

  useEffect(() => {
    // The token is read in the effect, not an initializer: this renders on the
    // server too, where there is no localStorage.
    if (!getCdpToken()) {
      setFigures({ plan: null, tokenBalance: null });
      return;
    }
    let cancelled = false;
    // Back to the skeleton while the new team's figures load, so the pill never
    // shows one team's number under another team's name.
    setFigures(undefined);
    void Promise.all([readBillingSummary(), readWalletBalance()]).then(
      ([summary, wallet]) => {
        if (cancelled) return;
        setFigures({
          plan: summary?.plan ?? null,
          tokenBalance: wallet?.tokenBalance ?? null,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  return useMemo(
    () =>
      figures === undefined
        ? undefined
        : resolveCreditsRemaining(figures.plan, figures.tokenBalance),
    [figures],
  );
}
