"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, type ComponentProps } from "react";

import { useOptionalLanguage } from "@/hooks/useTranslate";
import { DEFAULT_PUBLIC_LANGUAGE, localizeHref, type LanguageCode } from "@/i18n/config";
import { useOptionalHelpLanguage } from "@/i18n/help/locale-provider";

/**
 * Drop-in replacement for `next/link` that keeps the current language's URL
 * prefix. Public pages live under `/` (English), `/cn/…` and `/vn/…`, so a bare
 * `href="/pricing"` written in a component has to become `/cn/pricing` while the
 * visitor is reading the Chinese site.
 *
 * Only site-relative hrefs are rewritten — external URLs, `mailto:`/`tel:` and
 * bare `#hash` links pass through untouched, and query strings + hashes are kept.
 * Import this instead of `next/link` anywhere inside the localized public site.
 */
/**
 * Current language, whichever provider tree this renders in.
 *
 * The public site mounts `I18nProvider`; the help section mounts its own
 * `HelpLocaleProvider`. Both reads are plain `useContext` calls (safe to run
 * unconditionally) and neither throws, so this component works in either tree —
 * and degrades to the unprefixed default language instead of crashing the render
 * if it ever lands somewhere with no provider at all.
 */
function useCurrentLanguage(): LanguageCode {
  const siteLanguage = useOptionalLanguage();
  const helpLanguage = useOptionalHelpLanguage();

  return siteLanguage ?? helpLanguage ?? DEFAULT_PUBLIC_LANGUAGE;
}

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(
  function Link({ href, ...props }, ref) {
    const lang = useCurrentLanguage();
    const localizedHref = typeof href === "string" ? localizeHref(href, lang) : href;

    return <NextLink ref={ref} href={localizedHref} {...props} />;
  },
);

export default Link;

/** Localize an href by hand — for `<a>` tags, `router.push` and similar. */
export function useLocalizedHref() {
  const lang = useCurrentLanguage();

  return useCallback((href: string) => localizeHref(href, lang), [lang]);
}

/** `useRouter` whose `push`/`replace` keep the current language prefix. */
export function useLocalizedRouter() {
  const router = useRouter();
  const localize = useLocalizedHref();

  const push = useCallback(
    (href: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(localize(href), options),
    [localize, router],
  );

  const replace = useCallback(
    (href: string, options?: Parameters<typeof router.replace>[1]) =>
      router.replace(localize(href), options),
    [localize, router],
  );

  return { ...router, push, replace };
}
