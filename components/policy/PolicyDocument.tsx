"use client";

import { ShieldAlert } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

// Fixed, ordered section list. Kept as a literal (rather than iterating the
// locale object) so the three locale files stay key-identical under
// `Dictionary = typeof zh` and a missing translation shows up as a raw key path.
const SECTION_KEYS = [
  "acceptance",
  "aiUsage",
  "prohibited",
  "financial",
  "minors",
  "adultContent",
  "ipRights",
  "enforcement",
  "dataPrivacy",
  "contact",
] as const;

// Sections whose subject matter warrants visual emphasis over the plain ones.
const HIGHLIGHTED = new Set<string>(["prohibited", "minors", "adultContent"]);

export function PolicyDocument({ className }: { className?: string }) {
  const { t, tArray } = useTranslate();

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-foreground",
        className,
      )}
    >
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("policy.pageTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("policy.lastUpdated")}</p>
        <p className="mt-4 text-muted-foreground">{t("policy.intro")}</p>
      </header>

      <div
        role="alert"
        className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          {t("policy.banner.title")}
        </p>
        <p className="mt-2 text-sm text-destructive/90">{t("policy.banner.body")}</p>
      </div>

      <nav aria-label={t("policy.tocTitle")} className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("policy.tocTitle")}
        </h2>
        <ol className="mt-3 grid gap-1 sm:grid-cols-2">
          {SECTION_KEYS.map((key) => (
            <li key={key}>
              <a className="text-sm text-muted-foreground hover:text-foreground hover:underline" href={`#${key}`}>
                {t(`policy.sections.${key}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {SECTION_KEYS.map((key) => (
          <section
            key={key}
            id={key}
            // scroll-mt keeps the heading clear of the top edge when reached via anchor.
            className={cn(
              "scroll-mt-8",
              HIGHLIGHTED.has(key) && "rounded-lg border border-destructive/30 bg-destructive/5 p-5",
            )}
          >
            <h2 className="text-lg font-semibold tracking-tight">
              {t(`policy.sections.${key}.title`)}
            </h2>
            <p className="mt-2 text-muted-foreground">{t(`policy.sections.${key}.body`)}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground marker:text-muted-foreground/60">
              {tArray(`policy.sections.${key}.bullets`).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
