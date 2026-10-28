"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_LANGUAGE,
  getHtmlLang,
  isLanguageCode,
  languages,
  LANGUAGE_COOKIE_KEY,
  LANGUAGE_STORAGE_KEY,
  type LanguageCode,
} from "@/i18n/config";
// Chrome only (cookie banner, footer policy links). The policy documents
// themselves live in `legalDocs.json` and are read by the server-rendered
// `/legal` routes — far too large to ship in every page's dictionary.
import {
  currentLanguageSource,
  readStoredLanguage,
  resolvedLanguage,
  setCurrentLanguage,
  type LanguageSource,
} from "@/i18n/language-state";
import {
  dictionaries,
  type Dictionary,
  getPathValue,
  translateStatic,
} from "@/i18n/dictionaries";
import { COOKIE_CONSENT_CHANGE_EVENT, hasFunctionalityConsent } from "@/lib/cookie-consent";

export { languages, LANGUAGE_STORAGE_KEY, type LanguageCode };

const LANGUAGE_CHANGE_EVENT = "cluega-language-change";






type I18nContextValue = {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: (path: string) => string;
  tArray: (path: string) => string[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
  deferUntilClient?: boolean;
  initialLang?: LanguageCode;
};

type I18nState = {
  isReady: boolean;
  lang: LanguageCode;
};

export function I18nProvider({
  children,
  deferUntilClient = false,
  initialLang = DEFAULT_LANGUAGE,
}: I18nProviderProps) {
  const [state, setState] = useState<I18nState>({
    isReady: true,
    // What this TAB already settled on wins over the server's guess. Without
    // it a remount re-seeded from `initialLang`, which is DEFAULT_LANGUAGE
    // whenever the language cookie was never written — and it never is until
    // functionality cookies are accepted. The reader saw English, navigated,
    // and the interface was Chinese again (dev, 2026-09-16).
    lang: resolvedLanguage() ?? initialLang,
  });

  // Whether this tab has painted once. Everything below turns on it — see
  // `persistLanguage`'s "first paint never writes" rule.
  const hasPainted = useRef(false);

  useLayoutEffect(() => {
    const stored = deferUntilClient ? readStoredLanguage() : null;
    // Same rule as the initial state, for the same reason: a resolved language
    // is only replaced by something that actually says otherwise.
    const nextLang = stored ?? resolvedLanguage() ?? initialLang;

    setDocumentLanguage(nextLang, stored ? "stored" : "default");
    // First paint restates what this tab LOADED with, which is not news and must
    // not be broadcast. Afterwards `initialLang` only changes because the reader
    // navigated to a differently-prefixed URL, which is a real choice worth
    // remembering. See the rule above `persistLanguage`.
    persistLanguage(nextLang, { deliberate: hasPainted.current });
    setState((current) => {
      if (current.isReady && current.lang === nextLang) {
        return current;
      }

      return { isReady: true, lang: nextLang };
    });
  }, [deferUntilClient, initialLang]);

  useEffect(() => {
    if (!state.isReady) {
      return;
    }

    // Re-asserting the SAME language must not re-label where it came from: this
    // effect runs after every paint, and labelling it "default" would undo the
    // profile's answer a moment after it arrived.
    setDocumentLanguage(state.lang, currentLanguageSource());
    persistLanguage(state.lang, { deliberate: hasPainted.current });
    hasPainted.current = true;
  }, [state.isReady, state.lang]);

  useEffect(() => {
    const applyLanguage = (nextLang: LanguageCode) => {
      setDocumentLanguage(nextLang, "user");
      setState((current) => {
        if (current.isReady && current.lang === nextLang) {
          return current;
        }

        return { isReady: true, lang: nextLang };
      });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY && isLanguageCode(event.newValue)) {
        applyLanguage(event.newValue);
      }
    };

    const handleLanguageChange = (event: Event) => {
      const nextLang = (event as CustomEvent<unknown>).detail;

      if (isLanguageCode(nextLang)) {
        applyLanguage(nextLang);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    };
  }, []);

  // Accepting functionality cookies has to take effect straight away: write the
  // language the visitor is already reading, rather than waiting for them to
  // switch it. Withdrawal needs no handler here — `writeCookieConsent` purges the
  // cookie, and `persistLanguage` then declines to write it again.
  useEffect(() => {
    const handleConsentChange = () => {
      if (state.isReady) {
        // The visitor has just said "yes, remember things" — that is a choice,
        // and the whole point of the handler is to act on it now.
        persistLanguage(state.lang, { deliberate: true });
      }
    };

    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange);

    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, handleConsentChange);
  }, [state.isReady, state.lang]);

  const setLang = useCallback((nextLang: LanguageCode) => {
    setDocumentLanguage(nextLang, "user");
    // The language switcher: the one unambiguously deliberate write, and the one
    // that still propagates to every other tab.
    persistLanguage(nextLang, { deliberate: true });
    setState({ isReady: true, lang: nextLang });
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: nextLang }));
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[state.lang];

    return {
      lang: state.lang,
      setLang,
      t: (path) => {
        const valueAtPath = getPathValue(dictionary, path);

        return typeof valueAtPath === "string" ? valueAtPath : path;
      },
      tArray: (path) => {
        const valueAtPath = getPathValue(dictionary, path);

        return Array.isArray(valueAtPath) ? valueAtPath.filter((item) => typeof item === "string") : [];
      },
    };
  }, [state.lang, setLang]);

  if (!state.isReady) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Resolve a translation key OUTSIDE React — e.g. inside Zustand stores or other
// non-component code that has no access to the I18nProvider context. Reads the
export function useTranslate() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useTranslate must be used within I18nProvider");
  }

  return context;
}

/**
 * Current language, or null when there is no I18nProvider above — unlike
 * `useTranslate` this never throws. Used by components that render in more than
 * one provider tree (e.g. the locale-aware `Link`, which also appears under the
 * help section's own HelpLocaleProvider).
 */
export function useOptionalLanguage(): LanguageCode | null {
  return useContext(I18nContext)?.lang ?? null;
}

/**
 * Remember the chosen language for next time — a "Functionality" cookie under the
 * Cookie Policy, so it requires consent. Without consent the language still
 * works for the current visit (public URLs carry the locale prefix and the
 * provider holds it in state); it simply is not remembered.
 *
 * `deliberate` is what stops one tab overwriting another's language.
 *
 * localStorage is shared by every tab, and a write here raises a `storage` event
 * in all the others — which the listener above applies immediately. That is the
 * right behaviour for a language the reader just CHOSE, and the wrong behaviour
 * for a language a tab merely happens to be holding: a second tab left open on
 * the old locale re-persisted its stale value on mount and dragged the tab the
 * reader was actually using back to English mid-session (TT-G-13 ③, dev
 * 2026-09-13, ~1 minute in — which is how long it took the other tab to reload).
 *
 * So a tab's FIRST paint never writes. It has nothing to say: it is restating
 * what it was served with, and whatever is in storage is by definition at least
 * as new. The one exception is an empty store — a first-ever visit has to be
 * recorded, and it cannot be clobbering anyone.
 *
 * Every later write is a real event (the switcher, or a navigation to a
 * differently-prefixed URL) and still propagates to the other tabs, so choosing
 * a language once still changes it everywhere.
 */
function persistLanguage(lang: LanguageCode, { deliberate }: { deliberate: boolean }) {
  if (!hasFunctionalityConsent()) {
    return;
  }

  if (!deliberate && readStoredLanguage() !== null) {
    return;
  }

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage failures from private browsing or disabled storage.
  }

  document.cookie = `${LANGUAGE_COOKIE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

function setDocumentLanguage(lang: LanguageCode, source: LanguageSource = "default") {
  setCurrentLanguage(lang, source);
  document.documentElement.lang = getHtmlLang(lang);
}

// Re-exported so existing `@/hooks/useTranslate` importers keep working; the
// implementations live in plain .ts modules that `node --test` can resolve.
export { currentLanguage } from "@/i18n/language-state";
export { translateStatic };
