"use client";

import { useEffect, useState } from "react";

import { getCdpUserId } from "@/lib/cdp/session";

/**
 * The signed-in user's id (the JWT `sub`), for "is this mine?" checks such as
 * the creator-only star on Flow projects.
 *
 * Read in an effect, not during render: the token lives in browser storage, so
 * reading it on the server would pin a null into the markup and mismatch on
 * hydration. Null until that effect runs — callers must treat null as "not
 * mine" rather than as an error.
 */
export function useCdpUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(getCdpUserId());
  }, []);
  return userId;
}
