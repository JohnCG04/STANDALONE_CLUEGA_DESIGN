"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import type { SettingsTab } from "@/lib/settings/types";
import { cn } from "@/lib/utils";
import { useSettings } from "./context";
import { TAB_I18N_KEY } from "./icons";
import { ProfileTab } from "./tabs/ProfileTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { UsageBillingTab } from "./tabs/UsageBillingTab";
import { TeamManagementTab } from "./tabs/TeamManagementTab";

function renderTab(tab: SettingsTab) {
  switch (tab) {
    case "profile":
      return <ProfileTab />;
    case "general":
      return <GeneralTab />;
    case "billing":
      return <UsageBillingTab />;
    case "team":
      return <TeamManagementTab />;
    default:
      return null;
  }
}

export function SettingsContent() {
  const { activeTab, closeSettings } = useSettings();
  const { t } = useTranslate();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  return (
    <section className="flex h-full min-w-[360px] flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-6 dark:border-neutral-800">
        <h2 className="text-[16px] font-medium text-neutral-900 dark:text-neutral-100">
          {t(`settings.tabs.${TAB_I18N_KEY[activeTab]}`)}
        </h2>
        <button
          type="button"
          onClick={closeSettings}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
          aria-label={t("settings.modal.close")}
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {renderTab(activeTab)}
        </div>
      </div>
    </section>
  );
}
