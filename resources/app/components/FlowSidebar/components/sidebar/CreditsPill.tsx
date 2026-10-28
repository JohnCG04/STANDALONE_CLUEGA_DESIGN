"use client";

import { Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui";
import type { CreditsRemaining } from "@/lib/flow/creditsRemaining";

/**
 * The footer pill: "N% Left | Upgrade now" — one button, as in the reference
 * design, so the whole pill opens the billing tab.
 *
 * `remaining` follows lib/flow/creditsRemaining.ts — `undefined` while the plan
 * is still being read (a skeleton the same size, so the footer does not jump),
 * a percentage when the plan has an allowance, the raw balance when only the
 * wallet is known, and `null` for unknown, which renders a dash rather than a
 * number that would be a lie.
 *
 * Presentational: the caller passes the translated strings and the handler, so
 * this stays free of i18n and settings wiring.
 */
export const CreditsPill = ({
  remaining,
  onUpgrade,
  labels,
}: {
  remaining: CreditsRemaining | undefined;
  onUpgrade: () => void;
  labels: {
    /** "{percent}% Left" — the placeholder is filled here. */
    left: string;
    /** "{count} Credits" — the placeholder is filled here. */
    tokens: string;
    unknown: string;
    upgrade: string;
  };
}) => {
  if (remaining === undefined) {
    return <Skeleton className="h-[26px] w-40 rounded-full" />;
  }

  const figure =
    remaining === null
      ? labels.unknown
      : remaining.kind === "percent"
        ? labels.left.replace("{percent}", String(remaining.percent))
        : labels.tokens.replace("{count}", remaining.tokens.toLocaleString());

  return (
    <button
      type="button"
      onClick={onUpgrade}
      className="flex min-w-0 items-center gap-1 rounded-full border border-neutral-200/80 bg-neutral-900/[0.03] px-2 py-1 text-[11px] font-bold leading-none text-emerald-700 transition-colors hover:bg-neutral-900/[0.06] dark:border-neutral-700 dark:bg-white/[0.04] dark:text-emerald-400 dark:hover:bg-white/[0.08]"
    >
      <Sparkles
        className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="truncate whitespace-nowrap">{figure}</span>
      <span
        aria-hidden="true"
        className="mx-0.5 h-3 w-px shrink-0 bg-neutral-300 dark:bg-neutral-600"
      />
      <span className="whitespace-nowrap">{labels.upgrade}</span>
    </button>
  );
};
