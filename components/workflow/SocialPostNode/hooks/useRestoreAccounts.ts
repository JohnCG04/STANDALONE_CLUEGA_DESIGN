"use client";

import { useEffect, useRef, type RefObject } from "react";

import { accountRowState } from "@/resources/app/pages/app/components/SocialPost/helpers";
import { toSelectedAccount } from "@/resources/app/pages/app/components/SocialPost/store";
import type { ComposeController } from "@/resources/app/pages/app/components/SocialPost/types";

/** Re-ticks the saved accounts as each becomes selectable; a broken one waits for a reconnect. */
export function useRestoreAccounts(
  controller: ComposeController,
  pendingKeys: RefObject<string[]>,
) {
  const { accountsLoading, accountsFailed, listedAccounts, accountReads, accounts, toggleAccount } =
    controller;
  // Before the first read the list is empty, which would read as "every account is gone".
  const listRead = useRef(false);

  useEffect(() => {
    if (accountsLoading) {
      listRead.current = true;
      return;
    }
    if (!listRead.current || accountsFailed || pendingKeys.current.length === 0) return;
    const listed = new Map(listedAccounts.map((account) => [account.accountKey, account]));
    const ticked = new Set(accounts.map((account) => account.accountKey));
    const waiting: string[] = [];
    for (const key of pendingKeys.current) {
      const account = listed.get(key);
      if (!account || ticked.has(key)) continue;
      if (accountRowState(account, accountReads[account.accountId]) === "selectable") {
        toggleAccount(toSelectedAccount(account));
      } else {
        waiting.push(key);
      }
    }
    pendingKeys.current = waiting;
  }, [accountsLoading, accountsFailed, listedAccounts, accountReads, accounts, toggleAccount, pendingKeys]);
}
