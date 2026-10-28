import { Suspense } from "react";

import { LoginForm } from "@/components/login/LoginForm";
import { LoginPageFallback } from "@/components/login/LoginPageFallback";

/** Dedicated route for choosing an organization after a successful login. */
export function OrganizationPickerPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginForm organizationPickerOnly />
    </Suspense>
  );
}
