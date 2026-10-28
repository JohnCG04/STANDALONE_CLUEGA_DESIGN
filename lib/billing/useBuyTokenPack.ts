"use client";

import { useCallback, useRef, useState } from "react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getActiveTeamId } from "@/lib/ai-agent/cluega-session-auth";
import { getWalletBalance } from "@/lib/billing/cdp-billing";
import { RechargeCheckoutError, startRechargeCheckout, type RechargeFailureKind } from "@/lib/billing/platform-recharge";
import {
  browserStorage,
  forgetPendingRecharge,
  rechargeReturnUrl,
  rememberPendingRecharge,
} from "@/lib/billing/rechargePurchase";

/** Buys a token pack: notes the balance, then goes to Stripe; one purchase at a time. */
export function useBuyTokenPack() {
  const { tenant } = useCurrentUser();
  const tenantId = tenant?.id ?? null;
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<RechargeFailureKind | null>(null);
  // State lags a double click; a ref does not.
  const inFlight = useRef(false);

  const buy = useCallback(
    async (pack: { id: string }) => {
      if (!tenantId || inFlight.current) return;
      inFlight.current = true;
      setBuyingId(pack.id);
      setFailure(null);
      const storage = browserStorage();
      try {
        const balanceBefore = await getWalletBalance().then(
          (wallet) => wallet.tokenBalance,
          () => null,
        );
        rememberPendingRecharge(storage, { team: getActiveTeamId() ?? null, balanceBefore, startedAt: Date.now() });
        const { checkoutUrl } = await startRechargeCheckout(
          tenantId,
          pack.id,
          rechargeReturnUrl(window.location.origin, window.location.pathname),
        );
        window.location.assign(checkoutUrl);
      } catch (err) {
        forgetPendingRecharge(storage);
        setFailure(err instanceof RechargeCheckoutError ? err.kind : "unknown");
        setBuyingId(null);
        inFlight.current = false;
      }
    },
    [tenantId],
  );

  return { buy, buyingId, failure };
}
