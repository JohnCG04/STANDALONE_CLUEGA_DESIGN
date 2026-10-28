"use client";

import { cn } from "@/lib/utils";

export function SettingsSubTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: { id: string; label: string; disabled?: boolean }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mt-1 flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative h-9 px-3 text-[13px] font-semibold transition-colors",
              tab.disabled && "cursor-not-allowed opacity-40 hover:text-neutral-500",
              isActive
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
            )}
          >
            {tab.label}
            {isActive ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-neutral-900 dark:bg-neutral-100" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
