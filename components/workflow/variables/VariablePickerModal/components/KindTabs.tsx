import { memo } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { FlowVariableKind } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { KINDS } from "../constants";

export interface KindTabsProps {
  value: FlowVariableKind;
  onChange: (kind: FlowVariableKind) => void;
}

/** What the variable holds; a segmented pill like the design's Image / Video / Audio / Text. */
export const KindTabs = memo(function KindTabs({ value, onChange }: KindTabsProps) {
  const { t } = useTranslate();
  return (
    <div
      role="tablist"
      aria-label={t("appChat.flow.variables.picker.kindLabel")}
      className="inline-flex gap-1 self-start rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
    >
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="tab"
          aria-selected={value === kind}
          onClick={() => onChange(kind)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === kind
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white",
          )}
        >
          {t(`appChat.flow.variables.picker.kind.${kind}`)}
        </button>
      ))}
    </div>
  );
});
