import { Suspense } from "react";

import { LoginForm } from "@/components/login/LoginForm";
import { LoginPageFallback } from "@/components/login/LoginPageFallback";

/**
 * Body of the `/login` route, shared by both zones.
 *
 * Next requires `page.tsx` to live physically inside each app's `app/` tree, so
 * `apps/landing/app/login/page.tsx` and `apps/app/app/login/page.tsx` are both
 * one-line re-exports of this component. Keeping the real body here is what lets
 * the product zone authenticate on its own origin (localhost:3001) instead of
 * only working behind the landing zone's rewrite.
 */
export function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginForm />
    </Suspense>
  );
}
