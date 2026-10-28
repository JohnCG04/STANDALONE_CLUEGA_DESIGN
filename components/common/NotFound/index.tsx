import Link from "next/link";

import type { LanguageCode } from "@/i18n/config";
import { translateStatic } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * The 404 page, shared by both zones.
 *
 * Next wants `not-found.tsx` physically inside each app's `app/` tree, so
 * `apps/app` and `apps/landing` each keep a one-line file that re-exports this
 * — the same arrangement `/login` already uses. One page, so a mistyped URL
 * looks the same whichever zone caught it.
 *
 * The design file is a fixed 1440x1024 board of absolutely-positioned layers.
 * None of that survives here: the cord is a flex row that reaches the viewport
 * edge at any width, and the numerals are ONE element with a gradient clipped
 * to the glyphs rather than three stacked layers per digit.
 *
 * A SERVER component, and `lang` is a PROP rather than something resolved here.
 * Two reasons, in that order:
 *
 * `not-found.tsx` at the root of `app/` renders ABOVE the segment layouts, and
 * `I18nProvider` is mounted in those — so `useTranslate` throws "must be used
 * within I18nProvider" and the 404 itself 500s. `i18n/server.ts` names this
 * case in its own doc: a server component reads the language for itself.
 *
 * And the two zones read it DIFFERENTLY. `apps/landing` takes the URL first
 * (the proxy turns a `/cn` prefix into a header) and falls back to English;
 * `apps/app` has no such prefix and falls back to `DEFAULT_LANGUAGE`, which is
 * Chinese. Resolving it here with either rule would give one zone a page whose
 * words disagree with the `lang` on its own `<html>`. Each zone's
 * `not-found.tsx` passes what its own layout resolved.
 */

/** The unplugged end of the cord. Filled with `currentColor` so the cord and
 *  the plug can never drift apart — they are one colour in the design and one
 *  value here. */
function Plug({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 118 86"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="0" y="8" width="68" height="70" rx="22" />
      <rect x="62" y="20" width="56" height="13" rx="6.5" />
      <rect x="62" y="53" width="56" height="13" rx="6.5" />
    </svg>
  );
}

/** The little burst where the cord has come apart — two rings and two sparks.
 *  One SVG rather than six positioned divs: the cluster is decoration, and it
 *  should scale with the gap it sits in rather than be placed six times. */
function Sparks({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" fill="none" aria-hidden="true" className={className}>
      <circle cx="28" cy="56" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="92" cy="40" r="3" stroke="currentColor" strokeWidth="2" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M26 12v8M22 16h8" />
        <path d="M96 62v8M92 66h8" />
        <path d="M60 20v6M57 23h6" />
        <path d="M64 60v6M61 63h6" />
      </g>
    </svg>
  );
}

/**
 * The page's look with its words passed in, so other "you can't be here" screens
 * (a feature switched off for the workspace) wear the same face as the 404
 * instead of inventing their own. `action` is optional: a screen with nowhere
 * to send the visitor shows no button.
 */
export function NotFoundView({
  code,
  title,
  body,
  action,
  compact,
  className,
}: {
  code: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
  /** Smaller numerals, cord, type and button, for a screen that sits inside the
   *  app rather than replacing it. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-white px-6 dark:bg-background",
        className,
      )}
    >
      {/* `leading-none` and a tight tracking: at this size the font's own line
          box adds a third of the height again in empty space, and the design
          sets the three glyphs close enough to read as one object. */}
      <p
        aria-hidden="true"
        className={cn(
          "bg-gradient-to-b from-[#3D3D3D] via-[#8F8F8F] to-[#D6D6D6] bg-clip-text font-bold leading-none tracking-[0.08em] text-transparent dark:from-[#E5E5E5] dark:via-[#8F8F8F] dark:to-[#4A4A4A]",
          compact ? "text-[64px] sm:text-[88px]" : "text-[120px] sm:text-[180px]",
        )}
      >
        {code}
      </p>

      {/* Full-bleed: the cord runs OFF the left edge in the design, which is
          what says it continues somewhere out of frame. `w-screen` on a centred
          page needs the half-width nudge to start at the viewport edge rather
          than at the content column's. */}
      <div
        className={cn(
          "relative left-1/2 flex w-screen -translate-x-1/2 items-center text-[#424242] dark:text-neutral-300",
          compact ? "mt-5 sm:mt-6" : "mt-10 sm:mt-14",
        )}
      >
        <span className={cn("flex-1 bg-current", compact ? "h-1" : "h-2")} />
        <span className={cn("relative shrink-0", compact ? "h-10 w-[48px] sm:w-[64px]" : "h-20 w-[80px] sm:w-[120px]")}>
          <Sparks className="absolute inset-0 h-full w-full" />
        </span>
        <span className={cn("shrink-0 bg-current", compact ? "h-1 w-[56px] sm:w-[120px]" : "h-2 w-[110px] sm:w-[267px]")} />
        <Plug className={cn("w-auto shrink-0", compact ? "h-[30px] sm:h-[40px]" : "h-[60px] sm:h-[86px]")} />
        {/* The design leaves the plug well short of the right edge — it has been
            pulled OUT, and a plug flush to the frame reads as still seated. */}
        <span className="w-[6%] shrink-0 sm:w-[16%]" />
      </div>

      <div
        className={cn(
          "flex flex-col items-center text-center",
          compact ? "mt-6 max-w-[320px] gap-5 sm:mt-8" : "mt-14 max-w-[366px] gap-8 sm:mt-20",
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <h1
            className={cn(
              "font-bold tracking-[0.06em] text-[#424242] dark:text-foreground",
              compact ? "text-[18px] leading-7" : "text-[24px] leading-8",
            )}
          >
            {title}
          </h1>
          <p
            className={cn(
              "font-normal tracking-[0.06em] text-[#77707F] dark:text-muted-foreground",
              compact ? "text-[14px] leading-5" : "text-[16px] leading-6",
            )}
          >
            {body}
          </p>
        </div>

        {/* Not the shared <Button>: its largest size is h-10, and this one is
            240x62 with 20px type. A variant nothing else would use costs more
            than the six classes it saves. */}
        {action ? (
          <Link
            href={action.href}
            className={cn(
              "flex items-center justify-center bg-[#292929] font-semibold text-[#FAFAFA] transition-opacity hover:opacity-90 dark:bg-foreground dark:text-background",
              compact
                ? "w-auto rounded-xl px-5 py-2.5 text-[14px] leading-5"
                : "w-[240px] rounded-2xl px-[22px] py-4 text-[20px] leading-[30px]",
            )}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </main>
  );
}

export function NotFound({ lang }: { lang: LanguageCode }) {
  const t = (key: string) => translateStatic(key, lang);

  return (
    <NotFoundView
      code="404"
      title={t("notFound.title")}
      body={t("notFound.body")}
      action={{ label: t("notFound.action"), href: "/" }}
    />
  );
}
