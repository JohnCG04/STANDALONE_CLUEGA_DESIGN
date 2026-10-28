import { memo } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { PickerSource } from "../../types";
import { SOURCES } from "../constants";

export interface SourceTabsProps {
  value: PickerSource;
  onChange: (source: PickerSource) => void;
}

/** Where the files come from: the user's own uploads, or what Cluega made for them. */
export const SourceTabs = memo(function SourceTabs({ value, onChange }: SourceTabsProps) {
  const { t } = useTranslate();
  return (
    <div role="tablist" className="flex gap-5">
      {SOURCES.map((source) => (
        <button
          key={source}
          type="button"
          role="tab"
          aria-selected={value === source}
          onClick={() => onChange(source)}
          className={cn(
            "border-b-2 pb-1.5 text-[14px] transition-colors",
            value === source
              ? "border-neutral-900 font-semibold text-neutral-900 dark:border-white dark:text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
          )}
        >
          {t(`appChat.flow.variables.picker.source.${source}`)}
        </button>
      ))}
    </div>
  );
});
