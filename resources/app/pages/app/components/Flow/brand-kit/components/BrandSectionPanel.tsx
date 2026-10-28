"use client";

import type { ReactNode } from "react";

import { useTranslate } from "@/hooks/useTranslate";

/** The right-hand panel frame: a section's title, its one-line why, its body. */
export const BrandSectionPanel = ({
  titleKey,
  descriptionKey,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  children: ReactNode;
}) => {
  const { t } = useTranslate();
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="text-[20px] font-medium leading-tight text-neutral-900 dark:text-neutral-50">
          {t(titleKey)}
        </h2>
        {/* Not a neutral step but a 70% ink wash: the description sits directly
            under the title, and a grey with its own hue reads as a second
            colour rather than the same sentence spoken quieter. */}
        <p className="mt-1 max-w-2xl text-[13px] font-medium text-[rgba(15,15,15,0.7)] dark:text-[rgba(255,255,255,0.7)]">
          {t(descriptionKey)}
        </p>
      </header>
      {children}
    </section>
  );
};
