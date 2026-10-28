"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft, BrandDraftRule } from "@/lib/media/brandKit";
import { cn } from "@/lib/utils";

import {
  BRAND_SELECT_CONTENT_CLASS,
  BRAND_SELECT_ITEM_CLASS,
  BRAND_SELECT_TRIGGER_CLASS,
  ROW_ICON_DELETE_CLASS,
  ROW_ICON_GHOST_CLASS,
  RULE_ACCENT_CLASS,
} from "../../constants";

/**
 * §8 — the do and don't lines carried into every prompt.
 *
 * ONE list, deliberately. Three kit branches land in the same
 * `prompt_rules.dont` — `rules.items[type=dont]`, `logo.rules.donts`, and the
 * legacy `do_nots` the service JOINS rather than overrides — so showing them
 * separately would leave a rule that applies at render invisible here. Each row
 * remembers where it came from (`origin`), and `draftToKit` puts it back.
 *
 * The green/red left border is decoration: the select beside it states "Do" or
 * "Don't" in words, and the rows are an `<ol>` so position is announced.
 */
export const RulesSection = ({
  rules,
  onChange,
}: {
  rules: BrandDraft["rules"];
  onChange: (next: BrandDraftRule[]) => void;
}) => {
  const { t } = useTranslate();

  const update = (index: number, patch: Partial<BrandDraftRule>) => {
    const next = [...rules];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {rules.length === 0 ? (
        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
          {t("appChat.brandKit.rules.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-neutral-200 py-2 pl-3 pr-2 dark:border-neutral-800",
                RULE_ACCENT_CLASS[rule.type],
              )}
            >
              <Select
                value={rule.type}
                onValueChange={(value) =>
                  update(index, { type: value === "dont" ? "dont" : "do" })
                }
              >
                <SelectTrigger
                  className={cn(BRAND_SELECT_TRIGGER_CLASS, "w-28 shrink-0")}
                  aria-label={t("appChat.brandKit.rules.typeLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={BRAND_SELECT_CONTENT_CLASS}>
                  <SelectItem value="do" hideIndicator className={BRAND_SELECT_ITEM_CLASS}>{t("appChat.brandKit.rules.do")}</SelectItem>
                  <SelectItem value="dont" hideIndicator className={BRAND_SELECT_ITEM_CLASS}>{t("appChat.brandKit.rules.dont")}</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={rule.text}
                aria-label={t("appChat.brandKit.rules.textLabel")}
                placeholder={t("appChat.brandKit.rules.textPlaceholder")}
                onChange={(event) => update(index, { text: event.target.value })}
                className="border-0 shadow-none focus-visible:ring-0"
              />

              <button
                type="button"
                aria-label={t("appChat.brandKit.rules.remove")}
                onClick={() => onChange(rules.filter((_, at) => at !== index))}
                className={cn(ROW_ICON_GHOST_CLASS, ROW_ICON_DELETE_CLASS)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <Button
        variant="secondary"
        className="justify-center rounded-xl py-6"
        onClick={() =>
          onChange([
            ...rules,
            {
              // Minted here so React has a stable key before the row has text.
              id: `rule-new-${rules.length + 1}`,
              type: "do",
              category: "",
              text: "",
              imageUrl: "",
              origin: "rules",
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("appChat.brandKit.rules.add")}
      </Button>
    </div>
  );
};
