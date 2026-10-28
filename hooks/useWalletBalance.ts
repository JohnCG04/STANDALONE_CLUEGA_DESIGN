"use client";

import { useEffect, useState } from "react";
import { getWalletBalance, type WalletBalance } from "@/lib/billing/cdp-billing";
import { getActiveTeamId, getCdpToken } from "@/lib/ai-agent/cluega-session-auth";

/**
 * How long a fetched balance is reused. The number is a live figure, but it was
 * never live in the UI: the hook reads it once per mount, so sending a message —
 * which is what spends tokens — has never updated the displayed value. The window
 * only stops the app-shell and the composer re-asking on every navigation.
 */
const FRESH_MS = 60_000;

/**
 * How long a FAILURE is remembered. Failures are normally worth retrying, and the
 * list caches elsewhere deliberately do not cache them — but this request is
 * different: a 401 here costs three round trips, because the fetch wrapper answers
 * it by refreshing the access token and retrying. A tenant the balance endpoint
 * refuses outright (it answers 401 even after a successful refresh) would rotate
 * its token on every tab switch. Short enough to recover on its own, long enough
 * that navigating does not hammer it.
 */
const FAILED_MS = 30_000;

interface CacheEntry {
  /** null when the last attempt failed. */
  value: WalletBalance | null;
  at: number;
  /** The team the figure belongs to — the request carries X-Team-Id. */
  team: string | null;
}

let cache: CacheEntry | null = null;
/** Set while a request is open, so concurrent callers share one round trip. */
let inFlight: Promise<WalletBalance | null> | null = null;
/** The team the open request is for, so its answer is not cached under another. */
let inFlightTeam: string | null = null;

/** Test seam: forget everything cached. */
export function resetWalletBalanceCache(): void {
  cache = null;
  inFlight = null;
  inFlightTeam = null;
}

/**
 * Reads the tenant's token balance, reusing a recent answer.
 *
 * Returns null when there is no session, when the request failed, or when the
 * tenant has no wallet — callers show a placeholder either way.
 *
 * The wallet is per tenant and the request carries X-Team-Id, so the cache is
 * keyed on the active team: reusing it across a switch would quote one tenant's
 * balance to another.
 */
export async function readWalletBalance(
  now: number = Date.now(),
): Promise<WalletBalance | null> {
  const team = getActiveTeamId();
  if (cache && cache.team === team) {
    const ttl = cache.value ? FRESH_MS : FAILED_MS;
    if (now - cache.at < ttl) return cache.value;
  }
  // A second caller in the same tick joins the open request instead of starting
  // one: the app shell and the composer both read this on the same render. Only
  // when it is for the same team — otherwise its answer is the wrong wallet.
  if (inFlight && inFlightTeam === team) return inFlight;

  // Stamped with the request's START time, not its completion: the window is
  // about how old the figure is, and it also keeps `now` meaningful for callers
  // that pass one.
  const request = getWalletBalance()
    .then((balance) => {
      cache = { value: balance, at: now, team };
      return balance;
    })
    .catch((): WalletBalance | null => {
      cache = { value: null, at: now, team };
      return null;
    });
  inFlight = request;
  inFlightTeam = team;
  // Only clear the marker if it is still THIS request: a switch mid-flight starts
  // a second one, and the first to finish must not clear the other's marker.
  void request.finally(() => {
    if (inFlight === request) {
      inFlight = null;
      inFlightTeam = null;
    }
  });
  return request;
}

/**
 * useWalletBalance returns the signed-in tenant's CDP token balance, or null
 * while loading, when unauthenticated, or on error (so callers can fall back to a
 * placeholder). It only calls the API when a session token is present, so it is
 * safe on public/marketing pages.
 *
 * The answer is shared and briefly cached — see readWalletBalance. This hook is
 * mounted by both the app-shell profile menu and the composer, on a layout that
 * survives navigation, so an uncached read meant one request per surface per tab
 * switch.
 */
export function useWalletBalance(): number | null {
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !getCdpToken()) return;
    let cancelled = false;
    void readWalletBalance().then((balance) => {
      if (!cancelled && balance) setTokenBalance(balance.tokenBalance);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return tokenBalance;
}
