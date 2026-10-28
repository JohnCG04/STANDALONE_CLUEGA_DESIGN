"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Coins, Info, ListChecks, Wallet } from "lucide-react";

import { color, font, tabular, weight } from "@/components/dashboard/widgets/tokens";
import type { WidgetState } from "@/components/dashboard/widgets/types";
import { formatFullNumber } from "@/components/dashboard/widgets/widgetFormat";
import { WidgetShell } from "@/components/dashboard/widgets/WidgetShell";
import { useTranslate } from "@/hooks/useTranslate";
import { useCurrentCredits } from "../hooks/useCurrentCredits";
import { useUsageOverview } from "../hooks/useUsageOverview";
import { cn } from "@/lib/utils";

import type { UsageOverview } from "../usage-analytics.service";

// US-01's four cards. Current Credits is the live wallet figure (real data);
// the other three come from the usage overview for the selected window. Each
// card is its own WidgetShell so the overview failing leaves the wallet card
// standing, and vice versa.
//
// The card is TINTED rather than white-on-white: a row of four flat cards on a
// flat page reads as four empty boxes, and the mockup's soft ground is what
// separates the summary strip from the blocks under it. The tint is a gradient
// that fades out downward so the figure — the thing the card exists for — sits
// on the palest part of it.
//
// `delta` is optional and currently passed by nobody. GET /usage/overview
// returns one window's figures and no comparison, so there is no
// previous-period number to derive a percentage from; the card renders its
// footer only when a caller has a real one to give it. Printing a fabricated
// "+2.7%" to match the mockup would be the one thing a usage dashboard must
// never do.

/**
 * The card's tinted ground.
 *
 * Passed as WidgetShell's `surface`, NOT as a Tailwind gradient class: the
 * shell writes `background` as an inline style, which beats any class the
 * caller adds, so a `bg-gradient-to-b` here would simply never paint.
 *
 * Both stops are tokens, so the tint follows the theme with no `dark:` variant
 * of its own — `--widget-accent-bg` is the pale blue ground of the frozen
 * palette (#eef3f8 light, #1e2a36 dark) and it lands on the card's own bg.
 */
const CARD_SURFACE =
  "linear-gradient(to bottom, var(--widget-accent-bg) 0%, var(--widget-bg) 78%)";

/** The change a card can show against the previous window. */
export interface StatDelta {
  /** Signed percentage; the arrow and the tint follow the sign. */
  percent: number;
  /** What it is measured against ("From the last month"). */
  caption: string;
}

function DeltaPill({ delta }: { delta: StatDelta }) {
  const up = delta.percent >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums",
          up
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
        )}
      >
        <Arrow className="size-3" strokeWidth={2.5} />
        {Math.abs(delta.percent).toFixed(1)}%
      </span>
      <span className="text-[12px] text-neutral-500 dark:text-neutral-400">{delta.caption}</span>
    </div>
  );
}

function StatCard({
  title,
  icon: Icon,
  hint,
  value,
  delta,
  state,
  onRetry,
}: {
  title: string;
  icon: LucideIcon;
  /** The native-tooltip text behind the (i) — what the figure counts. */
  hint?: string;
  /** null prints "—": an unknown figure is not a zero (UsageBillingTab's rule). */
  value: number | null;
  delta?: StatDelta;
  state: WidgetState;
  onRetry?: () => void;
}) {
  return (
    <WidgetShell
      state={state}
      dense
      hideSynced
      onRetry={onRetry}
      surface={CARD_SURFACE}
      // No `title`: it is rendered in the body beside its icon, and passing it
      // here as well would print the label twice.
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-neutral-500 dark:text-neutral-400" strokeWidth={2} />
          <span
            className="min-w-0 truncate"
            style={{ fontSize: font.title, fontWeight: weight.title, color: color.inkPrimary }}
          >
            {title}
          </span>
          {hint ? (
            // The tooltip hangs off a span rather than the SVG: `title` on an
            // <svg> is not surfaced by every browser, and the span is also
            // what gives the hint a hoverable box of its own.
            <span className="ml-auto shrink-0 leading-none" title={hint}>
              <Info className="size-3.5 text-neutral-400 dark:text-neutral-500" aria-hidden />
              <span className="sr-only">{hint}</span>
            </span>
          ) : null}
        </div>

        <div
          className="leading-none"
          style={{ fontSize: font.kpi, fontWeight: weight.kpi, color: color.inkPrimary, ...tabular }}
        >
          {value === null ? "—" : formatFullNumber(value)}
        </div>

        {delta ? <DeltaPill delta={delta} /> : null}
      </div>
    </WidgetShell>
  );
}

// Reads its own data rather than taking it as props: the page container then
// holds nothing that a filter or a page step can change, so those actions cannot
// re-render this row — or the chart next to it.
export function StatCardsRow() {
  const { t } = useTranslate();
  const { credits, isLoading: creditsLoading } = useCurrentCredits();
  const {
    overview,
    isLoading: overviewLoading,
    failed: overviewFailed,
    retry: retryOverview,
  } = useUsageOverview();
  const overviewState: WidgetState = overviewLoading
    ? "loading"
    : overviewFailed
      ? "error"
      : "ok";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        title={t("usageAnalytics.stats.currentCredits")}
        hint={t("usageAnalytics.stats.currentCreditsHint")}
        icon={Wallet}
        value={credits}
        state={creditsLoading ? "loading" : "ok"}
      />
      <StatCard
        title={t("usageAnalytics.stats.totalJobs")}
        hint={t("usageAnalytics.stats.totalJobsHint")}
        icon={ListChecks}
        value={overview?.totalJobs ?? null}
        state={overviewState}
        onRetry={retryOverview}
      />
      <StatCard
        title={t("usageAnalytics.stats.creditsIn")}
        hint={t("usageAnalytics.stats.creditsInHint")}
        icon={ArrowDownRight}
        value={overview?.creditsIn ?? null}
        state={overviewState}
        onRetry={retryOverview}
      />
      <StatCard
        title={t("usageAnalytics.stats.creditsOut")}
        hint={t("usageAnalytics.stats.creditsOutHint")}
        icon={Coins}
        value={overview?.creditsOut ?? null}
        state={overviewState}
        onRetry={retryOverview}
      />
    </div>
  );
}
