"use client";

import { Gem, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { UsageTab } from "../types";

// The ledger's tab strip: a segmented pill group above the card, one pill per
// view, the active one filled.
//
// Not `UnderlineTabs` — that strip belongs to full-page tab bars (the Flow
// admin, the account list) where the underline sits ON the content's top edge.
// Here the tabs float above a card they are not attached to, so there is no
// edge for an underline to run along, and the segmented group is what reads as
// a control rather than as a stray row of links.
//
// Team and Credits are visible but DISABLED on purpose (US-07 is deferred):
// the shape of what is coming is part of the answer to "where do I find team
// usage?", and a pill that cannot be pressed says "not yet" where a missing
// one says "never".

const TAB_ICONS: Record<UsageTab, LucideIcon> = {
  generations: Sparkles,
  team: Users,
  credits: Gem,
};

export function LedgerTabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { value: UsageTab; label: string; disabled?: boolean }[];
  value: UsageTab;
  onChange: (value: UsageTab) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.value];
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            // `disabled` rather than aria-disabled: a deferred view must not be
            // reachable by keyboard either, or Tab lands on a dead control.
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors",
              active
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : tab.disabled
                  ? "cursor-not-allowed text-neutral-400 dark:text-neutral-600"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
