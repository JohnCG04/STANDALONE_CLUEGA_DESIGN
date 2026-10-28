"use client";

import type { ComponentProps } from "react";
import type { DayPicker } from "react-day-picker";

// The calendar's look, as class names rather than react-day-picker's stylesheet.
//
// The package ships a CSS file that styles by its own class names and its own
// colour variables; importing it into this app would put a second theme system
// next to Tailwind's and leave the calendar light-mode-only, because those
// variables know nothing about `dark:`. The class map is the supported way to
// dress it, so the calendar inherits the same neutrals, radii and dark variants
// as every other Flow surface.
//
// The keys are react-day-picker v10's UI slots (see its `UI` enum) — v8's names
// (`head_cell`, `day_selected`, `nav_button`) are silently ignored here, which
// is what an unstyled calendar in this app usually means.
//
// The board (2026-09-29) is the same one the app's own DateRangePicker draws:
// 38px round days, #292929 for a chosen end, an 8% black band between them,
// 12px weekdays with Sunday in red. Sunday is the LAST column, so a calendar
// dressed by this map passes `weekStartsOn={1}` (`WEEK_STARTS_ON`).
export const dayPickerClassNames: NonNullable<
  ComponentProps<typeof DayPicker>["classNames"]
> = {
  root: "relative text-[#424242] dark:text-neutral-100",
  // Two months side by side, stacked once the popover would outgrow the screen.
  months: "flex flex-col gap-5 sm:flex-row sm:gap-7",
  month: "flex flex-col gap-3",
  month_caption: "flex h-6 items-center justify-center",
  caption_label: "text-[16px] font-bold leading-6",
  nav: "absolute inset-x-0 top-0 flex h-6 items-center justify-between",
  button_previous:
    "inline-flex size-5 items-center justify-center text-[#424242] transition-opacity hover:opacity-70 disabled:opacity-25 dark:text-neutral-300",
  button_next:
    "inline-flex size-5 items-center justify-center text-[#424242] transition-opacity hover:opacity-70 disabled:opacity-25 dark:text-neutral-300",
  chevron: "size-4 fill-current",
  month_grid: "w-full border-collapse",
  weekdays: "grid grid-cols-7 [&>*:last-child]:text-[#FF3636]",
  weekday: "flex h-8 items-center justify-center text-[12px] font-semibold text-[#A3A3A3]",
  weeks: "flex flex-col gap-1",
  week: "grid grid-cols-7",
  // The range's ground is painted on the CELL, so it runs edge to edge between
  // days instead of leaving a gap under every gutter.
  day: "flex h-[38px] items-center justify-center p-0 text-center",
  day_button:
    "flex size-[38px] items-center justify-center rounded-full text-[14px] font-medium tabular-nums transition-colors hover:bg-black/[0.05] dark:hover:bg-white/10",
  today: "font-bold",
  outside: "text-[#D6D6D6] dark:text-neutral-600",
  disabled: "opacity-40 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
  hidden: "invisible",
  range_middle: "bg-black/[0.08] dark:bg-white/10",
  // Half a band under each end, facing the other one. A one-day range is both
  // ends at once and gets no band at all (`rdp-end-start`).
  range_start:
    "rdp-end-start bg-[linear-gradient(to_right,transparent_50%,rgba(0,0,0,0.08)_50%)] dark:bg-[linear-gradient(to_right,transparent_50%,rgba(255,255,255,0.1)_50%)] [&>button]:bg-[#292929] [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-[#292929] dark:[&>button]:bg-neutral-100 dark:[&>button]:text-neutral-900 dark:[&>button]:hover:bg-neutral-100",
  range_end:
    "bg-[linear-gradient(to_left,transparent_50%,rgba(0,0,0,0.08)_50%)] dark:bg-[linear-gradient(to_left,transparent_50%,rgba(255,255,255,0.1)_50%)] [&.rdp-end-start]:bg-none [&>button]:bg-[#292929] [&>button]:font-semibold [&>button]:text-white [&>button]:hover:bg-[#292929] dark:[&>button]:bg-neutral-100 dark:[&>button]:text-neutral-900 dark:[&>button]:hover:bg-neutral-100",
  selected: "",
};
