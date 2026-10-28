"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { useTranslate } from "@/hooks/useTranslate";
import { searchFamilies } from "@/lib/media/brandFonts";
import { cn } from "@/lib/utils";

import {
  FONT_PICKER_EMPTY_CLASS,
  FONT_PICKER_LIST_CLASS,
  FONT_PICKER_OPTION_ACTIVE_CLASS,
  FONT_PICKER_OPTION_CLASS,
  FONT_PICKER_POPOVER_CLASS,
  FONT_PICKER_SEARCH_CLASS,
  FONT_PICKER_TRIGGER_CLASS,
} from "../constants";
import { useFontCatalogue } from "../hooks/useFontCatalogue";
import { useFontPreview } from "../hooks/useFontPreview";

/**
 * The Font field: a searchable list of families, each drawn in its own face.
 *
 * Not a `<Select>`: Google serves ~1600 families, and scrolling that is no way
 * to reach "Space Grotesk". Search is the feature; the list is what it filters.
 * Every row renders in the family it names, because a font name means nothing
 * to most people.
 *
 * Keyboard is the combobox pattern — focus stays in the search box and Up/Down
 * walk the options through `aria-activedescendant`, so typing keeps working.
 * Hence a `listbox` of `option`s rather than a column of buttons.
 */
export const FontPicker = ({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (family: string) => void;
  disabled?: boolean;
  className?: string;
}) => {
  const { t } = useTranslate();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { families, isLoading } = useFontCatalogue();
  const matches = useMemo(() => searchFamilies(families, query), [families, query]);
  useFontPreview(open ? matches : value ? [value] : []);

  // Both follow from an event, not a render, so they are set where the event
  // happens rather than in an effect watching for it.

  /** A new search is a new list; the highlight belongs on its first row. */
  const search = (next: string) => {
    setQuery(next);
    setActive(0);
  };

  /** Opening lands on the chosen family, not the top of sixteen hundred. */
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setQuery("");
    const at = families.indexOf(value);
    setActive(at === -1 ? 0 : at);
  };

  // Keep the highlighted row in view while the arrows walk past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-at="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (family: string) => {
    onChange(family);
    setOpen(false);
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at) => (at + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const family = matches[active];
      if (family) choose(family);
    }
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : toggle}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("appChat.brandKit.typography.fontLabel")}
          className={cn(
            FONT_PICKER_TRIGGER_CLASS,
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          <span
            className="min-w-0 truncate"
            style={value ? { fontFamily: `"${value}"` } : undefined}
          >
            {value || t("appChat.brandKit.fontUnset")}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className={FONT_PICKER_POPOVER_CLASS}>
        <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
          {/* autoFocus: the popover exists to be typed into. */}
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              matches[active] ? `${listId}-${active}` : undefined
            }
            value={query}
            spellCheck={false}
            placeholder={t("appChat.brandKit.typography.fontSearch")}
            onChange={(event) => search(event.target.value)}
            onKeyDown={onSearchKey}
            className={FONT_PICKER_SEARCH_CLASS}
          />
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={t("appChat.brandKit.typography.fontLabel")}
          className={FONT_PICKER_LIST_CLASS}
        >
          {isLoading ? (
            <p className={FONT_PICKER_EMPTY_CLASS}>
              <Loader2 className="mx-auto size-4 animate-spin" aria-hidden="true" />
              <span className="sr-only">{t("appChat.brandKit.loading")}</span>
            </p>
          ) : matches.length === 0 ? (
            <p className={FONT_PICKER_EMPTY_CLASS}>
              {t("appChat.brandKit.typography.fontNoMatch")}
            </p>
          ) : (
            matches.map((family, at) => (
              <div
                key={family}
                id={`${listId}-${at}`}
                data-at={at}
                role="option"
                aria-selected={family === value}
                onClick={() => choose(family)}
                onMouseEnter={() => setActive(at)}
                className={cn(
                  FONT_PICKER_OPTION_CLASS,
                  at === active && FONT_PICKER_OPTION_ACTIVE_CLASS,
                )}
                style={{ fontFamily: `"${family}"` }}
              >
                <span className="min-w-0 truncate">{family}</span>
                {family === value ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
