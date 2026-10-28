"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  HelpCircle,
  LogOut,
  Plus,
} from "lucide-react";

import { SignOutConfirmDialog } from "@/components/app-shell/SignOutConfirmDialog";
import { useHelpHref } from "@/hooks/useHelpHref";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { SettingsTab } from "@/lib/settings/types";
import { useSettings } from "./context";
import {
  ACCOUNT_TAB_ORDER,
  DISABLED_TABS,
  TAB_ICONS,
  TAB_I18N_KEY,
} from "./icons";
import { SettingsUserAvatar } from "./SettingsUserAvatar";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function SidebarNavButton({
  tab,
  isActive,
  isDisabled,
  onSelect,
  label,
}: {
  tab: SettingsTab;
  isActive: boolean;
  isDisabled: boolean;
  onSelect: (tab: SettingsTab) => void;
  label: string;
}) {
  const Icon = TAB_ICONS[tab];

  return (
    <button
      type="button"
      // `disabled` alone already blocks the click and keyboard activation; the
      // dimmed styling is what tells the user why nothing happens.
      disabled={isDisabled}
      onClick={() => onSelect(tab)}
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-[13px] font-semibold transition-colors",
        isDisabled
          ? "cursor-not-allowed text-neutral-400 dark:text-neutral-600"
          : isActive
            ? "bg-neutral-200/70 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          isDisabled
            ? "text-neutral-300 dark:text-neutral-700"
            : "text-neutral-500 dark:text-neutral-400",
        )}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 text-left leading-tight">{label}</span>
    </button>
  );
}

export function SettingsSidebar() {
  const { activeTab, setActiveTab } = useSettings();
  const { t } = useTranslate();
  const me = useCurrentUser();
  const helpHref = useHelpHref("/help");
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const renderTab = (tab: SettingsTab) => {
    const isActive = activeTab === tab;

    return (
      <SidebarNavButton
        key={tab}
        tab={tab}
        isActive={isActive}
        isDisabled={DISABLED_TABS.has(tab)}
        onSelect={setActiveTab}
        label={t(`settings.tabs.${TAB_I18N_KEY[tab]}`)}
      />
    );
  };

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative mb-3">
        <button
          type="button"
          onClick={() => setUserMenuOpen((current) => !current)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <SettingsUserAvatar className="h-full w-full text-[12px]" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[13px] text-neutral-900 dark:text-neutral-100">
              {me.displayName}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {t("settings.sidebar.personal")}
            </div>
          </div>
          <ChevronDown
            className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
            strokeWidth={1.75}
          />
        </button>

        {userMenuOpen ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
            <button
              type="button"
              onClick={() => setUserMenuOpen(false)}
              className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-lg bg-neutral-100 px-2 py-2 dark:bg-neutral-900"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <SettingsUserAvatar className="h-full w-full text-[12px]" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] text-neutral-900 dark:text-neutral-100">
                  {me.displayName}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {t("settings.sidebar.personal")}
                </div>
              </div>
              <Check
                className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
                strokeWidth={2}
              />
            </button>
            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                setActiveTab("team");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              {t("settings.sidebar.createTeam")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Scrollable nav area */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        <div>
          <div className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
            {t("settings.sidebar.account")}
          </div>
          <div className="flex flex-col gap-0.5">
            {ACCOUNT_TAB_ORDER.map(renderTab)}
          </div>
        </div>
      </div>

      {/* Pinned bottom buttons */}
      <div className="mt-2 flex flex-col gap-0.5 border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          onClick={() => window.open(helpHref, "_blank", "noopener,noreferrer")}
        >
          <HelpCircle
            className="h-4 w-4 text-neutral-500 dark:text-neutral-400"
            strokeWidth={1.75}
          />
          <span className="flex-1 text-left">{t("settings.sidebar.help")}</span>
          <ArrowUpRight
            className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
            strokeWidth={1.75}
          />
        </button>

        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-semibold text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          {t("profileMenu.signOut")}
        </button>
      </div>

      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </aside>
  );
}
