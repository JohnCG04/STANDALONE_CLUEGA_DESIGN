"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import {
  CHIP_BASE_CLASS,
  CHIP_IDLE_CLASS,
  CHIP_SELECTED_CLASS,
} from "../constants";
import type { BrandChipOption } from "../types";

/**
 * A row of multi-select pills with an "Other…" escape hatch.
 *
 * Ported from onboarding/personalization/PersonalizationChips rather than
 * imported: that one has zero `dark:` variants and types its options as a
 * per-user onboarding registry. What transferred is the idea worth keeping —
 * typed values are derived by subtracting the presets from the selection.
 *
 * `role="group"`, not `radiogroup`: these are independent toggles, and each
 * pill is a real `role="checkbox"` with `aria-checked`.
 */
export const BrandChipGroup = ({
  label,
  options,
  selected,
  onToggle,
  onRemove,
  labelFor,
  allowCustom = true,
  disabled = false,
}: {
  label: string;
  options: readonly BrandChipOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  onRemove: (value: string) => void;
  /** Preset values resolve through i18n; a typed value is its own label. */
  labelFor: (value: string) => string;
  allowCustom?: boolean;
  disabled?: boolean;
}) => {
  const { t } = useTranslate();
  const labelId = useId();
  const draftId = useId();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const otherRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  const presetValues = options.map((option) => option.value);
  const customValues = selected.filter(
    (value) => value && !presetValues.includes(value),
  );

  const commit = () => {
    const value = draft.trim();
    setDraft("");
    setIsAdding(false);
    otherRef.current?.focus();
    if (!value || selected.includes(value)) return;
    onToggle(value);
  };

  const renderChip = (value: string) => {
    const isSelected = selected.includes(value);
    const text = labelFor(value);
    if (!isSelected) {
      return (
        <button
          key={value}
          type="button"
          role="checkbox"
          aria-checked={false}
          disabled={disabled}
          onClick={() => onToggle(value)}
          className={cn(CHIP_BASE_CLASS, CHIP_IDLE_CLASS, disabled && "opacity-50")}
        >
          <span className="truncate">{text}</span>
        </button>
      );
    }
    // Two SIBLING buttons inside a span, never nested: a button inside a button
    // is invalid HTML, which is why ProjectCard puts its star beside the
    // thumbnail button rather than within it.
    return (
      <span key={value} className={cn(CHIP_BASE_CLASS, CHIP_SELECTED_CLASS)}>
        <button
          type="button"
          role="checkbox"
          aria-checked
          disabled={disabled}
          onClick={() => onToggle(value)}
          className="truncate text-left"
        >
          {text}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("appChat.brandKit.chips.remove").replace("{label}", text)}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(value);
          }}
          className="-mr-0.5 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        id={labelId}
        className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-wrap items-center gap-2"
      >
        {presetValues.map(renderChip)}
        {customValues.map(renderChip)}

        {allowCustom && !isAdding ? (
          <button
            ref={otherRef}
            type="button"
            disabled={disabled}
            aria-expanded={false}
            aria-controls={draftId}
            onClick={() => setIsAdding(true)}
            className={cn(CHIP_BASE_CLASS, CHIP_IDLE_CLASS, disabled && "opacity-50")}
          >
            {t("appChat.brandKit.chips.other")}
          </button>
        ) : null}

        {allowCustom && isAdding ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              id={draftId}
              value={draft}
              aria-label={t("appChat.brandKit.chips.customPlaceholder")}
              placeholder={t("appChat.brandKit.chips.customPlaceholder")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft("");
                  setIsAdding(false);
                  otherRef.current?.focus();
                }
              }}
              className="h-7 w-40 rounded-xl border border-neutral-300 bg-white px-2 text-[12px] text-neutral-900 outline-none focus-visible:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:border-neutral-100"
            />
            <button
              type="button"
              aria-label={t("appChat.brandKit.chips.add")}
              onClick={commit}
              className="flex size-7 shrink-0 items-center justify-center rounded-xl border border-neutral-300 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
};
