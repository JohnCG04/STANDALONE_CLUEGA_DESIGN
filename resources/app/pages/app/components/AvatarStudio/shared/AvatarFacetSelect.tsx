"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";

import { PickerSearchInput } from "../../PromptComposer/components/modals/PickerSearchInput";

// One facet dropdown in the avatar picker's filter row (PRD Screen 6): a pill
// trigger that reads as a placeholder until something is picked, and a panel
// holding a value search box plus the checkable value rows.
//
// A <select> cannot carry the search box, and the facet lists are long enough
// (regions ship ten values) that scrolling a native list is the worse option —
// hence a Popover over the shared primitive. The rows are the design system's
// `Checkbox` and the search field is the picker modals' own
// [PickerSearchInput](../../PromptComposer/components/modals/PickerSearchInput.tsx),
// so neither look is a recipe this file owns.
//
// MULTI-select, and the panel stays open while boxes are ticked: the rows ARE
// checkboxes, so a click has to mean "add this value", not "replace the facet and
// close" — which is what the single-value version did despite drawing boxes.
//
// A tick therefore does not submit. It writes a local DRAFT the boxes render
// immediately, and the draft is handed to `onChange` — the request — only once the
// user stops ticking for `debounceMs`, or closes the panel. Tick two boxes and the
// catalog is fetched once, not twice.

export type AvatarFacetOption = {
  value: string;
  label: string;
};

/** Long enough to swallow a second (and third) tick, short enough that a single
 *  tick still feels like it applied on its own. */
const COMMIT_DEBOUNCE_MS = 400;

export type AvatarFacetSelectProps = {
  /** Placeholder on the trigger — the facet's name ("Industry"). */
  label: string;
  /** The committed selection. Empty means the facet is off ("all"). */
  values: readonly string[];
  options: readonly AvatarFacetOption[];
  /** Handed the settled selection, once per burst of ticks. */
  onChange: (values: string[]) => void;
  /** Override the debounce window; 0 submits on every tick. */
  debounceMs?: number;
  className?: string;
};

export function AvatarFacetSelect({
  label,
  values,
  options,
  onChange,
  debounceMs = COMMIT_DEBOUNCE_MS,
  className,
}: AvatarFacetSelectProps) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * Ticks not yet submitted, or null when there are none. An OVERLAY on top of
   * `values` rather than a copy of it: nothing has to sync the two, so the
   * committed selection stays the single source of truth and a re-render from the
   * parent can never fight a draft the user is still building.
   */
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** What the boxes and the trigger show: the draft while one exists, the
   *  committed selection otherwise. */
  const selection = draft ?? values;

  const writeDraft = (next: string[]) => {
    draftRef.current = next;
    setDraft(next);
  };

  // Clearing the draft in the same tick as the submit keeps the boxes from
  // blinking back to the old selection: React batches this with whatever state
  // the parent sets in `onChange`, so one render carries both.
  const submit = useCallback(() => {
    const next = draftRef.current;
    if (!next) return;
    draftRef.current = null;
    setDraft(null);
    onChange(next);
  }, [onChange]);

  const stopTimer = () => {
    if (!timerRef.current) return false;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    return true;
  };

  // A pending tick dies with the dropdown — the modal that owns it is closing and
  // resets its filters anyway.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const toggle = (value: string) => {
    // Read through the ref, not the render's `selection`: two clicks inside one
    // frame would otherwise both start from the pre-click set and only the second
    // would survive.
    const current = draftRef.current ?? [...values];
    writeDraft(
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );

    stopTimer();
    if (debounceMs <= 0) {
      submit();
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      submit();
    }, debounceMs);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const selectedLabel = useMemo(() => {
    if (selection.length === 0) return null;
    const byValue = new Map(options.map((option) => [option.value, option.label]));
    return selection.map((value) => byValue.get(value) ?? value).join(", ");
  }, [options, selection]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        // The search is scoped to one visit of the panel — reopening a facet
        // should show its whole list again. A tick still waiting out its debounce
        // is submitted on the way out rather than dropped.
        setQuery("");
        if (stopTimer()) submit();
      }}
    >
      <PopoverTrigger
        className={cn(
          "flex h-9 w-[136px] items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-transparent px-3 text-[13px] transition-colors",
          // Open is a border darkening, not an accent — the same call
          // PickerSearchInput makes about focus on this surface.
          "hover:border-neutral-300 data-[state=open]:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-700 dark:data-[state=open]:border-neutral-600",
          selectedLabel ? "text-foreground" : "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{selectedLabel ?? label}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-[220px] p-0">
        <div className="p-2">
          <PickerSearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("appChat.avatarModal.filterSearch")}
          />
        </div>

        <div className="max-h-[232px] overflow-y-auto pb-1">
          {visible.map((option) => (
            <Checkbox
              key={option.value}
              checked={selection.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              label={option.label}
              className="w-full px-3 py-2 text-[13px] hover:bg-muted"
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
