"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

// The checkbox for any list of toggleable values.
//
// The ROOT is the whole row, not just the square. Radix renders it as a
// `<button role="checkbox">`, so the label is part of the hit target and the
// ARIA state comes from the primitive instead of hand-written attributes — and a
// row can never end up nesting a button inside a clickable button, which is what
// every hand-rolled version of this in the codebase had to work around.

export type CheckboxProps = Omit<
  ComponentProps<typeof CheckboxPrimitive.Root>,
  "onCheckedChange" | "asChild" | "children"
> & {
  /** Indeterminate is not modelled — the callback is a plain boolean. */
  onCheckedChange?: (checked: boolean) => void;
  /** Rendered right of the square, inside the same control. */
  label?: ReactNode;
  /** Merged over the square's own recipe. */
  boxClassName?: string;
};

export function Checkbox({
  className,
  boxClassName,
  label,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      onCheckedChange={(next) => onCheckedChange?.(next === true)}
      className={cn(
        "group flex items-center gap-2.5 text-left outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {/* The box is a span so the control stays one element for the a11y tree;
          its state is read off the root's data-state rather than the prop, which
          is what keeps an uncontrolled checkbox looking right too. */}
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          "border-neutral-300 dark:border-neutral-600",
          // Selection across the picker surfaces is blue-500, not the mint
          // accent — see AssetGrid's selected card and TemplateCard's own dot.
          "group-data-[state=checked]:border-blue-500 group-data-[state=checked]:bg-blue-500 group-data-[state=checked]:text-white",
          "group-focus-visible:ring-[3px] group-focus-visible:ring-muted",
          boxClassName,
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </span>
      {label != null ? (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      ) : null}
    </CheckboxPrimitive.Root>
  );
}
