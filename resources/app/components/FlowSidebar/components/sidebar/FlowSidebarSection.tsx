"use client";

import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuChevronDown } from "react-icons/lu";

import { cn } from "@/lib/utils";

import { HOVER_FILL, ICON_STROKE_SM, SECTION_LABEL } from "../../styles";

export const FlowSidebarSection = ({
  id,
  title,
  collapsed,
  onToggle,
  action,
  children,
}: {
  /** Id of the body, for aria-controls (only while the body is in the DOM). */
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  action?: {
    icon: IconType;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-px">
    <div
      className={cn(
        "group/header relative flex h-8 items-center rounded-lg pr-1 transition-colors",
        HOVER_FILL,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={collapsed ? undefined : id}
        className="flex h-8 min-w-0 flex-1 items-center rounded-lg p-2 text-left"
      >
        <span className={cn(SECTION_LABEL, "truncate")}>{title}</span>
        <LuChevronDown
          aria-hidden="true"
          className={cn(
            "ml-1 size-3 shrink-0 text-neutral-500 transition-transform dark:text-neutral-400",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {action ? (
        <button
          type="button"
          aria-label={action.label}
          title={action.label}
          disabled={action.disabled}
          onClick={action.onClick}
          className="flex size-6 shrink-0 items-center justify-center rounded-lg text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-900/[0.06] hover:text-neutral-900 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40 group-hover/header:opacity-100 dark:text-neutral-400 dark:hover:bg-white/[0.08] dark:hover:text-neutral-100"
        >
          <action.icon className={cn("size-3.5", ICON_STROKE_SM)} aria-hidden="true" />
        </button>
      ) : null}
    </div>
    {!collapsed ? (
      <div id={id} className="flex flex-col gap-px">
        {children}
      </div>
    ) : null}
  </div>
);
