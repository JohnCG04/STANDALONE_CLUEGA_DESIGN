"use client";

import type { Bold } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The B / I marks on a typography row.
 *
 * Hand-rolled because there is no toggle-group primitive in this repo and no
 * `@radix-ui/react-toggle*` in package.json — and none may be added. `aria-pressed`
 * is the state; the filled styling is redundant reinforcement, not the signal.
 */
export const StyleToggleButton = ({
  pressed,
  label,
  icon: Icon,
  onToggle,
}: {
  pressed: boolean;
  label: string;
  icon: typeof Bold;
  onToggle: () => void;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    aria-label={label}
    onClick={onToggle}
    className={cn(
      "flex size-9 items-center justify-center rounded-lg border transition-colors",
      pressed
        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
        : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    )}
  >
    <Icon className="size-4" aria-hidden="true" />
  </button>
);
