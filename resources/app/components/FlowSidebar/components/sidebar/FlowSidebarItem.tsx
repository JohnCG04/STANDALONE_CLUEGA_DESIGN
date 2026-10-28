"use client";

import type { IconType } from "react-icons";

import { cn } from "@/lib/utils";

import { BADGE, ROW, ROW_ACTIVE, ROW_DISABLED, ROW_ICON, ROW_IDLE } from "../../styles";


export const FlowSidebarItem = ({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  nested = false,
  collapsed = false,
  badge,
  onClick,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  nested?: boolean;
  collapsed?: boolean;
  badge?: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    aria-current={active ? "page" : undefined}
    title={collapsed ? label : undefined}
    className={cn(
      ROW,
      active ? ROW_ACTIVE : ROW_IDLE,
      disabled && ROW_DISABLED,
      nested && !collapsed && "h-[30px]",
      collapsed && "size-9 justify-center p-0",
    )}
  >
    <Icon className={cn(ROW_ICON, collapsed && "mr-0")} aria-hidden="true" />
    
    {collapsed ? (
      <span className="sr-only">{label}</span>
    ) : (
      <>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge ? <span className={BADGE}>{badge}</span> : null}
      </>
    )}
  </button>
);
