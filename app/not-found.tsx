import { cookies } from "next/headers";

import { NotFound } from "@/components/common/NotFound";
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGE_COOKIE_KEY } from "@/i18n/config";

// Body lives in @cluega/shared so both zones show the same 404. The language is
// resolved HERE, the same way `app/layout.tsx` above it resolves the `lang` on
// <html> — this zone has no `/cn` URL prefix to read, so the cookie is the only
// signal and Chinese is the fallback. Resolving it inside the shared component
// would give one zone a page whose words disagree with its own document
// language.
export default async function NotFoundPage() {
  const stored = (await cookies()).get(LANGUAGE_COOKIE_KEY)?.value;

  return <NotFound lang={isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE} />;
}
