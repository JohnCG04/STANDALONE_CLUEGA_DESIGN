"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { HoverTooltip } from "@/resources/app/components/ui/HoverTooltip";
import { cn } from "@/lib/utils";

/**
 * One settings line: label (+ optional ⓘ) and sub-line on the left, its control
 * on the right. Same shape as the settings screen's `SwitchRow`, so the posting
 * panel reads like the rest of the product rather than like a form of its own.
 */
export function SettingRow({
  children,
  className,
  hint,
  sub,
  title,
}: {
  children?: ReactNode;
  className?: string;
  /** Tooltip copy for the ⓘ beside the title. */
  hint?: string;
  sub?: ReactNode;
  title: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            {title}
          </span>
          {hint ? (
            <HoverTooltip content={hint}>
              <Info className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
            </HoverTooltip>
          ) : null}
        </div>
        {sub ? (
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {sub}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
