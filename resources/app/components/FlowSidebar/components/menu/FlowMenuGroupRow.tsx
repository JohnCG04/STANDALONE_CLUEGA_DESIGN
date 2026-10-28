"use client";

import type { IconType } from "react-icons";
import { LuChevronDown } from "react-icons/lu";

import { cn } from "@/lib/utils";

import { ICON_STROKE_SM, ROW, ROW_ACTIVE, ROW_ICON, ROW_IDLE } from "../../styles";

export const FlowMenuGroupRow = ({
  icon: Icon,
  label,
  active,
  expanded,
  bodyId,
  toggleLabel,
  onOpen,
  onToggle,
}: {
  icon: IconType;
  label: string;
  active: boolean;
  expanded: boolean;
  bodyId: string;
  toggleLabel: string;
  onOpen: () => void;
  onToggle: () => void;
}) => (
  <div
    className={cn(
      "flex items-center rounded-lg pr-1 transition-colors",
      active ? ROW_ACTIVE : ROW_IDLE,
    )}
  >
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, "flex-1 bg-transparent hover:bg-transparent")}
    >
      <Icon className={ROW_ICON} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
    <button
      type="button"
      onClick={onToggle}
      aria-label={toggleLabel}
      aria-expanded={expanded}
      aria-controls={expanded ? bodyId : undefined}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.08] dark:hover:text-neutral-100"
    >
      <LuChevronDown
        aria-hidden="true"
        className={cn("size-3.5 transition-transform", ICON_STROKE_SM, !expanded && "-rotate-90")}
      />
    </button>
  </div>
);
