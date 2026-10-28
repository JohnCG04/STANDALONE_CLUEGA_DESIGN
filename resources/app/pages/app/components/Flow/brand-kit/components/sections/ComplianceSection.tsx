"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import { ROW_ICON_DELETE_CLASS, ROW_ICON_GHOST_CLASS } from "../../constants";

/**
 * §9 — the disclaimer lines.
 *
 * This section exists because `disclaimers` has NO kit field at all: §4's
 * projection table produces no such row, yet §7.2's example carries
 * ["18+", "Play responsibly"]. It is also the one part of a brand kit that is
 * pasted onto a render verbatim rather than described to a model, which is why
 * the hint says so — a model told to print "18+" paraphrases it.
 */
export const ComplianceSection = ({
  disclaimers,
  onChange,
}: {
  disclaimers: readonly string[];
  onChange: (next: string[]) => void;
}) => {
  const { t } = useTranslate();

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
        {t("appChat.brandKit.compliance.label")}
      </span>

      {disclaimers.length === 0 ? (
        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.brandKit.compliance.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {disclaimers.map((line, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                value={line}
                placeholder={t("appChat.brandKit.compliance.placeholder")}
                onChange={(event) => {
                  const next = [...disclaimers];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
              <button
                type="button"
                aria-label={t("appChat.brandKit.compliance.remove")}
                onClick={() => onChange(disclaimers.filter((_, at) => at !== index))}
                className={cn(ROW_ICON_GHOST_CLASS, ROW_ICON_DELETE_CLASS)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
        {t("appChat.brandKit.compliance.hint")}
      </p>

      <Button
        variant="outline"
        className="self-start rounded-full"
        onClick={() => onChange([...disclaimers, ""])}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("appChat.brandKit.compliance.add")}
      </Button>
    </div>
  );
};
