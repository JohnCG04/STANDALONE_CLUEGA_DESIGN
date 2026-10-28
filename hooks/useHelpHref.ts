"use client";

import { useSyncExternalStore } from "react";

import { useLocalizedHref } from "@/components/i18n/Link";
import { helpCenterHref } from "@/config/help-center";

/** Nothing to subscribe to: the origin cannot change without a navigation. */
const noSubscribe = () => () => {};

export function useHelpHref(path: string): string {
  const localize = useLocalizedHref();
  const localized = localize(path);

  return useSyncExternalStore(
    noSubscribe,
    () => helpCenterHref(localized),
    () => localized,
  );
}
