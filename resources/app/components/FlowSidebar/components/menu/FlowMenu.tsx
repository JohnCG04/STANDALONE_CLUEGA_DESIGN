"use client";

import { useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import {
  FLOW_SIDEBAR_MENU,
  type FlowMenuItem,
  type FlowMenuKey,
} from "../../constants";
import { FlowMenuGroupRow } from "./FlowMenuGroupRow";
import { FlowSidebarItem } from "../sidebar/FlowSidebarItem";

const LEARN_ANCHORS: Partial<Record<FlowMenuKey, string>> = {
  create: "flow-home.sidebar-create",
};

export const FlowMenu = ({
  activeKey,
  isCreating,
  collapsed = false,
  onSelect,
}: {
  activeKey: FlowMenuKey | null;
  isCreating: boolean;
  collapsed?: boolean;
  onSelect: (item: FlowMenuItem) => void;
}) => {
  const { t } = useTranslate();
  const [folded, setFolded] = useState<Partial<Record<FlowMenuKey, boolean>>>(
    {},
  );

  const renderRow = (item: FlowMenuItem, nested: boolean) => {
    const row = (
      <FlowSidebarItem
        icon={item.icon}
        label={t(item.labelKey)}
        active={activeKey === item.key}
        nested={nested}
        collapsed={collapsed}
        disabled={item.action === "create" && isCreating}
        onClick={() => onSelect(item)}
      />
    );

    const anchor = LEARN_ANCHORS[item.key];
    return anchor ? (
      <div key={item.key} data-learn={anchor}>
        {row}
      </div>
    ) : (
      <div key={item.key}>{row}</div>
    );
  };

  return (
    <nav
      aria-label={t("appChat.nav.cluegaDesign")}
      className={cn("flex flex-col gap-0.5", collapsed && "items-center")}
      data-learn="flow-home.sidebar-main-nav"
    >
      {FLOW_SIDEBAR_MENU.map((item) => {
        if (!item.children || collapsed) return renderRow(item, false);

        const bodyId = `flow-menu-${item.key}`;
        const expanded = !folded[item.key];
        return (
          <div key={item.key} className="flex flex-col gap-0.5">
            <FlowMenuGroupRow
              icon={item.icon}
              label={t(item.labelKey)}
              active={activeKey === item.key}
              expanded={expanded}
              bodyId={bodyId}
              toggleLabel={t(
                expanded ? "appChat.nav.collapseSection" : "appChat.nav.expandSection",
              )}
              onOpen={() => onSelect(item)}
              onToggle={() =>
                setFolded((current) => ({
                  ...current,
                  [item.key]: !current[item.key],
                }))
              }
            />
            {expanded ? (
              <div
                id={bodyId}
                className="ml-4 flex flex-col gap-0.5 border-l border-neutral-200/80 pl-2 dark:border-neutral-800"
              >
                {item.children.map((child) => renderRow(child, true))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
};
