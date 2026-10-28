"use client";

import { useId, useRef } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import { LayoutGlyph } from "./LayoutGlyph";
import type { RadioCardOption } from "../types";

/**
 * A group of picture cards where exactly one is chosen.
 *
 * `role="radiogroup"` with a ROVING TABINDEX, so the whole group is one Tab
 * stop and the arrow keys move between cards — the behaviour a native
 * `<input type="radio">` set would give, which the card layout cannot use. The
 * selected-ring recipe follows TemplateLibrary/TemplateCard, which solves the
 * same problem for the composer's template grid.
 */
export const RadioCardGroup = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly RadioCardOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
}) => {
  const { t } = useTranslate();
  const labelId = useId();
  const captionId = useId();
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Nothing chosen yet: the first card is the group's Tab stop, so the group is
  // still reachable.
  const focusIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        id={labelId}
        className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300"
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <div
              key={option.value}
              ref={(node) => {
                refs.current[index] = node;
              }}
              role="radio"
              aria-checked={selected}
              aria-describedby={`${captionId}-${option.value}`}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, -1);
                } else if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  onChange(option.value);
                }
              }}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors",
                selected
                  ? "border-blue-500 ring-2 ring-blue-500/40"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600",
              )}
            >
              <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
                <LayoutGlyph bars={option.glyph} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-50">
                  {t(option.labelKey)}
                </p>
                <p
                  id={`${captionId}-${option.value}`}
                  className="truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400"
                >
                  {t(option.captionKey)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
