import { memo } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { MAX_VARIABLE_TEXT } from "../../constants";

export interface TextPanelProps {
  value: string;
  onChange: (value: string) => void;
}

/** A text variable is typed here rather than picked: the library holds no plain text. */
export const TextPanel = memo(function TextPanel({ value, onChange }: TextPanelProps) {
  const { t } = useTranslate();
  const length = [...value].length;
  return (
    <div className="flex h-full flex-col gap-2 pt-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("appChat.flow.variables.picker.textPlaceholder")}
        aria-label={t("appChat.flow.variables.picker.kind.text")}
        className="min-h-[240px] flex-1 resize-none rounded-xl border border-border bg-transparent p-4 text-[14px] leading-relaxed outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
      />
      <span
        className={cn(
          "self-end text-[12px] tabular-nums",
          length > MAX_VARIABLE_TEXT ? "text-destructive" : "text-neutral-500",
        )}
      >
        {length}/{MAX_VARIABLE_TEXT}
      </span>
    </div>
  );
});
