"use client";

import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { enUS } from "react-day-picker/locale/en-US";
import { vi } from "react-day-picker/locale/vi";
import { th } from "react-day-picker/locale/th";
import { zhTW } from "react-day-picker/locale/zh-TW";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useTranslate } from "@/hooks/useTranslate";
import {
  toIsoDate,
  USAGE_TIME_RANGES,
  type UsageTimeRangeKey,
} from "@/lib/flow/usage-analytics/timeRange";
import { cn } from "@/lib/utils";

import { RANGE_LABEL_KEYS } from "../constants";
import { formatWindowRange } from "../helpers";
import { useResetGenerationsCursor, useUsageRange } from "../hooks/useUsageUiState";
import { dayPickerClassNames } from "@/components/ui/dayPickerStyle";
import { WEEK_STARTS_ON } from "@/resources/app/components/DateRangePicker/date-range-picker.lib";

// The ONE control every block below obeys (US-01's second criterion): change the
// range here and the cards, both charts and the table all refetch — because the
// window is part of every one of their cache keys.
//
// One button instead of the five-segment pill it replaces. The pill could only
// ever hold the presets that fit across the page, and a reader who wanted "the
// 9th to the 14th" had no way to ask for it; a menu costs one click and holds
// both the presets and the custom range.
//
// The granularity is NOT shown and NOT a choice: it follows from the span
// (resolveBucket) — under a week reads hourly, up to two months daily, beyond
// that monthly — so a reader cannot ask for 90 days of hours and get a chart
// with 2 160 points. The axis itself says which one is in force.

/** react-day-picker speaks date-fns locales; the app speaks its own codes. */
function pickerLocale(lang: string) {
  const code = lang.trim().toLowerCase();
  if (code === "vn" || code === "vi") return vi;
  if (code === "zh") return zhTW;
  if (code === "th") return th;
  return enUS;
}

export function UsageRangePicker() {
  const { t, lang } = useTranslate();
  const { selection, rangeKey, dateWindow, setRange, setCustomRange } = useUsageRange();
  const resetCursor = useResetGenerationsCursor();

  const [open, setOpen] = useState(false);
  // The calendar is a second PANEL of the same popover rather than a second
  // popover: the presets are what most visits want, and a calendar that pushes
  // them off screen on open makes the common case the slower one.
  const [showCalendar, setShowCalendar] = useState(false);
  // What the calendar is showing before Apply. Held here, not in the cache — a
  // half-picked range (a start with no end) is not a window anything can fetch.
  const [draft, setDraft] = useState<DateRange | undefined>();

  const today = useMemo(() => new Date(), []);

  // A new window is a new list, and a cursor minted in the old one addresses a
  // row that may not be in it — so the ledger goes back to its newest page.
  const commit = (apply: () => void) => {
    apply();
    resetCursor();
    setOpen(false);
    setShowCalendar(false);
    setDraft(undefined);
  };

  const openCalendar = () => {
    // Seeded with the window on screen, so "roughly this, two days earlier" is
    // two clicks rather than a hunt for the month you were already in.
    setDraft({
      from: dateWindow.start_date ? new Date(`${dateWindow.start_date}T00:00:00`) : undefined,
      to: new Date(`${dateWindow.end_date}T00:00:00`),
    });
    setShowCalendar(true);
  };

  const label =
    rangeKey === "custom"
      ? formatWindowRange(dateWindow, lang)
      : t(RANGE_LABEL_KEYS[rangeKey]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopening lands on the presets, never on the calendar the last visit
        // happened to leave open.
        if (!next) setShowCalendar(false);
      }}
    >
      <PopoverTrigger
        className="flex h-9 max-w-full items-center gap-2 rounded-full border border-neutral-200 bg-white pl-3.5 pr-3 text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        aria-label={t("usageAnalytics.range.label")}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <span className="truncate">{label}</span>
        {/* The resolved days, so a preset still tells you exactly what it cut.
            All time has no start to name, and printing only its end would read
            as a one-day window. */}
        {rangeKey === "custom" || !dateWindow.start_date ? null : (
          <span className="hidden truncate text-[12px] font-medium text-neutral-400 sm:inline dark:text-neutral-500">
            {formatWindowRange(dateWindow, lang)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          // White, not the kit's `bg-popover`: that token is a warm cream
          // (oklch hue 95) which reads as a different surface next to the white
          // cards this menu sits over.
          "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
          // The calendar panel wears the date picker board's frame.
          showCalendar
            ? "w-auto max-w-[92vw] rounded-2xl border-[#D6D6D6] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
            : "w-[240px] p-2",
        )}
      >
        {showCalendar ? (
          <div className="flex flex-col gap-5">
            <DayPicker
              mode="range"
              locale={pickerLocale(lang)}
              defaultMonth={draft?.from ?? today}
              selected={draft}
              onSelect={setDraft}
              // Tomorrow has no buckets to group; an open end would come back as
              // empty tail buckets that read as measured zeros.
              disabled={{ after: today }}
              // Two months side by side: a range almost always crosses a month
              // boundary, and one grid makes that a click on the arrow, a
              // reload of the layout and a lost sense of where the other end is.
              // The class map stacks them on a narrow screen.
              numberOfMonths={2}
              weekStartsOn={WEEK_STARTS_ON}
              showOutsideDays
              classNames={dayPickerClassNames}
            />
            <div className="flex items-center gap-3 border-t border-[#F1F5F9] pt-5 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setShowCalendar(false)}
                className="flex h-[34px] flex-1 items-center justify-center rounded-xl bg-[#FAFAFA] px-3 text-[12px] font-semibold text-[#424242] outline outline-1 -outline-offset-1 outline-[#D6D6D6] transition-colors hover:bg-[#F0F0F0] dark:bg-neutral-900 dark:text-neutral-100 dark:outline-neutral-700"
              >
                {t("usageAnalytics.range.back")}
              </button>
              <button
                type="button"
                // Both ends required: one clicked day is a start, not a range.
                disabled={!draft?.from || !draft?.to}
                onClick={() =>
                  commit(() =>
                    setCustomRange(toIsoDate(draft!.from!), toIsoDate(draft!.to!)),
                  )
                }
                className="flex h-[34px] flex-1 items-center justify-center rounded-xl bg-[#292929] px-3 text-[12px] font-semibold text-[#FAFAFA] transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {t("usageAnalytics.range.apply")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div role="radiogroup" aria-label={t("usageAnalytics.range.label")} className="flex flex-col">
              {USAGE_TIME_RANGES.map((key: UsageTimeRangeKey) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={key === rangeKey}
                  onClick={() => commit(() => setRange(key))}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-200"
                >
                  {t(RANGE_LABEL_KEYS[key])}
                  {key === rangeKey ? <Check className="size-4 shrink-0" strokeWidth={2.5} /> : null}
                </button>
              ))}
            </div>

            <div className="mt-1 border-t border-neutral-200 pt-1 dark:border-neutral-800">
              <button
                type="button"
                onClick={openCalendar}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-200"
              >
                {t("usageAnalytics.range.custom")}
                {rangeKey === "custom" ? (
                  <Check className="size-4 shrink-0" strokeWidth={2.5} />
                ) : null}
              </button>
              {selection.key === "custom" ? (
                <p className="px-2.5 pb-1 text-[11px] text-muted-foreground">
                  {formatWindowRange(dateWindow, lang)}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
