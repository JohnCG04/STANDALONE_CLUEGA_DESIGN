"use client";

import {
  createContext,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { useTranslate } from "@/hooks/useTranslate";
import {
  DEFAULT_LANGUAGE,
  languages,
  splitLanguageFromPathname,
  type LanguageCode,
} from "@/i18n/config";
import { HELP_FOOTER_MESSAGES } from "@/i18n/help/messages/footer";

type HelpLocaleContextValue = {
  locale: LanguageCode;
  t: (key: string, vars?: Record<string, string>) => string;
};

const HelpLocaleContext = createContext<HelpLocaleContextValue | null>(null);

/**
 * The help section's language is the URL's: `/help` English, `/vn/help` Tiếng
 * Việt, `/cn/help` 繁體中文, as on the rest of the public site.
 *
 * `initialLang` (from the proxy's header) is right for the server render, but
 * it is a layout prop, and the layout is NOT re-rendered when the reader moves
 * between `/help/…` and `/vn/help/…` on the client: the proxy rewrites both to
 * the same route, so Next keeps the segment. Following it left the article
 * English under a Vietnamese URL until a reload. So the client follows the
 * pathname instead.
 *
 * A stored preference (cookie, localStorage, another tab's choice) never
 * overrides the URL here. Remembering the choice, `<html lang>` and the consent
 * handling belong to the site's `I18nProvider`, which the help switcher calls.
 * That provider only changes language when told to, so a URL change it did not
 * cause (Back, Forward) is passed on to it here; otherwise the navbar, footer
 * and links stay on the previous language while the article follows the URL.
 */
export function HelpLocaleProvider({
  children,
  initialLang = DEFAULT_LANGUAGE,
}: {
  children: ReactNode;
  initialLang?: LanguageCode;
}) {
  const pathname = usePathname();
  const { lang: siteLang, setLang: setSiteLang } = useTranslate();
  const [locale, setLocale] = useState<LanguageCode>(initialLang);

  // Read the site language without depending on it. Re-running when it changes
  // would answer another tab's choice (a `storage` event) by writing this tab's
  // URL language back to storage, and two tabs on different prefixes would
  // overwrite each other forever.
  const syncSiteLanguage = useEffectEvent((urlLang: LanguageCode) => {
    if (siteLang !== urlLang) {
      setSiteLang(urlLang);
    }
  });

  // After render, not during it: whether `usePathname()` returns the prefixed
  // or the rewritten path on the server is not something to bet hydration on.
  // A layout effect, so there is no frame in the old language after a switch.
  useLayoutEffect(() => {
    if (!pathname) return;

    const urlLang = splitLanguageFromPathname(pathname).lang;
    setLocale(urlLang);
    syncSiteLanguage(urlLang);
  }, [pathname]);

  const value = useMemo<HelpLocaleContextValue>(() => {
    const footerMessages = HELP_FOOTER_MESSAGES[locale];

    function t(key: string, vars?: Record<string, string>): string {
      let message = key;

      if (key === "helpCenter.footer.copyright") message = footerMessages.copyright;
      if (key === "helpCenter.footer.terms") message = footerMessages.terms;
      if (key === "helpCenter.footer.privacy") message = footerMessages.privacy;
      if (key === "helpCenter.footer.contact") message = footerMessages.contact;

      if (!vars) return message;

      let result = message;
      for (const [name, value] of Object.entries(vars)) {
        result = result.split(`{${name}}`).join(value);
      }
      return result;
    }

    return { locale, t };
  }, [locale]);

  return (
    <HelpLocaleContext.Provider value={value}>{children}</HelpLocaleContext.Provider>
  );
}

export function useHelpLocale() {
  const context = useContext(HelpLocaleContext);
  if (!context) {
    throw new Error("useHelpLocale must be used within HelpLocaleProvider");
  }
  return context;
}

/**
 * Current help-section language, or null outside HelpLocaleProvider — the
 * non-throwing counterpart of `useHelpLocale`, for components shared with the
 * rest of the site (e.g. the locale-aware `Link`).
 */
export function useOptionalHelpLanguage(): LanguageCode | null {
  return useContext(HelpLocaleContext)?.locale ?? null;
}

export const HELP_LANGUAGE_OPTIONS = languages;
