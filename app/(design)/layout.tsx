import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { I18nProvider } from "@/hooks/useTranslate";
import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  LANGUAGE_COOKIE_KEY,
} from "@/i18n/config";
import { CookieConsent } from "@/components/common/CookieConsent";
import { SettingsProvider } from "@/components/settings/context";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { AppRouteBodyClass } from "@/components/layout/AppRouteBodyClass";
import { LearnProvider } from "@/components/learn";
import { LanguagePreferenceSync } from "@/components/providers/LanguagePreferenceSync";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ToastViewport } from "@/components/ui/Toast";
import { ModuleAccessGate } from "@/components/module-access/ModuleAccessGate";

export const metadata: Metadata = {
  title: "Cluega Design",
};

export default async function DesignLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const storedLang = cookieStore.get(LANGUAGE_COOKIE_KEY)?.value;
  const initialLang = isLanguageCode(storedLang)
    ? storedLang
    : DEFAULT_LANGUAGE;

  return (
    <I18nProvider
      deferUntilClient={!isLanguageCode(storedLang)}
      initialLang={initialLang}
    >
      <ModuleAccessGate>
        {/* Outside SettingsProvider on purpose: the query cache must sit as high as
            possible so it survives every child route change. */}
        <QueryProvider>
          {/* The language follows the user, not the browser. Inside I18nProvider
              because it both reads and sets the current language. */}
          <LanguagePreferenceSync browserHasChoice={isLanguageCode(storedLang)} />
          <SettingsProvider>
            <LearnProvider>
              <AppRouteBodyClass />
              {children}
              <SettingsModal />
              <ToastViewport />
            </LearnProvider>
            <CookieConsent />
          </SettingsProvider>
        </QueryProvider>
      </ModuleAccessGate>
    </I18nProvider>
  );
}
