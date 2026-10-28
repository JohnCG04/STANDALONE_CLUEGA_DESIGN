import { useCallback, useEffect, useState } from "react";

import {
  listSocialAccounts,
  type SocialAccount,
  type SocialPlatformAvailability,
} from "@/lib/social-posts/accounts";

export type SocialAccountsState = {
  accounts: SocialAccount[];
  platforms: SocialPlatformAvailability[];
  loading: boolean;
  /** True when the read itself failed — distinct from "it worked and there are
   *  no accounts", which is the connect prompt rather than a retry. */
  failed: boolean;
  reload: () => void;
};

/**
 * Every account this tenant can publish to, and every platform's verdict.
 *
 * One request for all of it, replacing the old per-platform "is it linked"
 * probe: that answered a boolean per platform, which cannot express "three
 * TikTok accounts, one of them expired" — the thing the picker now shows.
 *
 * `enabled` parks the read until the panel is open. It is not a cache: an
 * account list is a permission statement, so re-opening the panel re-reads it,
 * and `reload` is what a connect round-trip calls on its way back.
 */
export function useSocialAccounts(enabled: boolean): SocialAccountsState {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [platforms, setPlatforms] = useState<SocialPlatformAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    void listSocialAccounts(undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setAccounts(result.accounts);
        setPlatforms(result.platforms);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Left as an empty list AND a failure flag: the picker must not show
        // "connect an account" for a request that never landed, or the user
        // reconnects an account they already have.
        setAccounts([]);
        setPlatforms([]);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { accounts, platforms, loading, failed, reload };
}
