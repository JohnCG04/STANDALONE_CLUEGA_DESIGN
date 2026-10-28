"use client";

import { useCallback } from "react";

import { useLocalizedHref } from "@/components/i18n/Link";
import { landingZoneHref } from "@/config/help-center";

/**
 * Order matters: localize first, then cross zones. `localizeHref` only rewrites
 * site-relative paths, so crossing first would hand it an absolute URL and leave
 * a Vietnamese reader on the English policy.
 */
export function resolveLegalHref(
  href: string,
  localize: (href: string) => string,
): string {
  return landingZoneHref(localize(href));
}

/**
 * Resolver for legal links inside translated copy. Safe without the SSR dance
 * `useHelpHref` needs: the only callers are the cookie panels, which render
 * nothing until a mount effect opens them.
 */
export function useLegalHref(): (href: string) => string {
  const localize = useLocalizedHref();

  return useCallback((href: string) => resolveLegalHref(href, localize), [localize]);
}
