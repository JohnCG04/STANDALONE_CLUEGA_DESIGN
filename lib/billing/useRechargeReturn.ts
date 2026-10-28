"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { resetWalletBalanceCache } from "@/hooks/useWalletBalance";
import { getActiveTeamId } from "@/lib/ai-agent/cluega-session-auth";
import { getWalletBalance, resetBillingSummaryCache } from "@/lib/billing/cdp-billing";
import {
  browserStorage,
  clearBillingReturn,
  forgetPendingRecharge,
  peekBillingReturn,
  readPendingRecharge,
  type TokenPacksStatus,
} from "@/lib/billing/rechargePurchase";
import { waitForBalanceAbove } from "@/lib/billing/rechargeWait";

const readBalance = () =>
  getWalletBalance().then(
    (wallet) => wallet.tokenBalance,
    () => null,
  );

/** What to tell someone back from Stripe: acts on a marker plus a purchase this tab started. */
export function useRechargeReturn(): TokenPacksStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TokenPacksStatus>({ kind: "none" });

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const marker = peekBillingReturn();
      if (!marker) return;
      const storage = browserStorage();
      const pending = readPendingRecharge(storage, Date.now(), getActiveTeamId() ?? null);
      if (!pending) {
        clearBillingReturn();
        return;
      }
      const finish = (next: TokenPacksStatus) => {
        forgetPendingRecharge(storage);
        clearBillingReturn();
        setStatus(next);
      };
      if (marker === "cancelled") {
        finish({ kind: "cancelled" });
        return;
      }
      setStatus({ kind: "checking" });
      // Without the balance from before the trip, the first read is the baseline.
      const above = pending.balanceBefore ?? (await readBalance());
      if (!alive) return;
      if (above === null) {
        finish({ kind: "timeout" });
        return;
      }
      const result = await waitForBalanceAbove({ read: readBalance, above, isCancelled: () => !alive });
      if (result.outcome === "cancelled") return;
      if (result.outcome === "credited" && result.balance !== null) {
        // The credits pill and the Pulse card read these caches; forget them so they follow.
        resetWalletBalanceCache();
        resetBillingSummaryCache();
        void queryClient.invalidateQueries({ queryKey: ["billing"] });
        finish({ kind: "credited", balance: result.balance });
        return;
      }
      finish({ kind: "timeout" });
    };
    void run();
    return () => {
      alive = false;
    };
  }, [queryClient]);

  return status;
}
