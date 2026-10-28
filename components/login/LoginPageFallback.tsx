"use client";

import { useTranslate } from "@/hooks/useTranslate";

export function LoginPageFallback() {
  const { t } = useTranslate();

  return (
    <div className="w-full max-w-[400px] px-4 text-center text-sm text-neutral-500 dark:text-muted-foreground">
      {t("login.loading")}
    </div>
  );
}
