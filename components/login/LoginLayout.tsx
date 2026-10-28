import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import Image from "next/image";

import { LoginSimpleFooter } from "@/components/login/LoginSimpleFooter";
import { I18nProvider } from "@/hooks/useTranslate";
import { isLanguageCode, LANGUAGE_COOKIE_KEY } from "@/i18n/config";
import { resolveLocaleFromRequest } from "@/lib/resolve-locale-from-request";
// Imported as a module rather than referenced as "/images/…": the product zone
// has no copy of the landing zone's `public/`, and a bundled asset is served
// correctly from either origin.
import clueGaLogo from "@/public/images/cluega-logo-2026-full.png";

/**
 * Chrome around the `/login` route, shared by both zones. See LoginPage for why
 * the body lives in the package instead of in each app's `app/` tree.
 */
export default async function LoginLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const storedLang = cookieStore.get(LANGUAGE_COOKIE_KEY)?.value;
  const hasStoredLang = isLanguageCode(storedLang);
  const initialLang = hasStoredLang
    ? storedLang
    : resolveLocaleFromRequest(await headers());

  return (
    <I18nProvider initialLang={initialLang}>
      <div className="flex min-h-screen flex-col overflow-auto bg-white text-neutral-900 dark:bg-background dark:text-foreground">
        <div className="flex justify-center pb-2 pt-8">
          <Image
            alt="Cluega"
            className="h-7 w-auto object-contain dark:invert"
            height={28}
            priority
            src={clueGaLogo}
            width={140}
          />
        </div>
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          {children}
        </main>
        <LoginSimpleFooter />
      </div>
    </I18nProvider>
  );
}
