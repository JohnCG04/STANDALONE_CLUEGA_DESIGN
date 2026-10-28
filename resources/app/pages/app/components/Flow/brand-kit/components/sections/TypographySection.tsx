"use client";

import { useState } from "react";
import { Bold, Check, Italic, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft, BrandDraftTextStyle } from "@/lib/media/brandKit";
import { cn } from "@/lib/utils";

import { FontPicker } from "../FontPicker";
import { StyleToggleButton } from "../StyleToggleButton";
import {
  BRAND_SELECT_CONTENT_CLASS,
  BRAND_SELECT_ITEM_CLASS,
  BRAND_SELECT_TRIGGER_CLASS,
  BOLD_WEIGHT,
  ROW_ICON_BUTTON_CLASS,
  ROW_ICON_DELETE_CLASS,
  ROW_ICON_GHOST_CLASS,
  STYLE_PANEL_CLASS,
  STYLE_ROW_CLASS,
  STYLE_ROW_CLOSED_CLASS,
  FONT_SIZES,
  REGULAR_WEIGHT,
  TYPOGRAPHY_ROLES,
  TYPOGRAPHY_ROLE_LABEL_KEY,
} from "../../constants";

const NEW_STYLE: BrandDraftTextStyle = {
  role: "body",
  label: "",
  fontFamily: "",
  fontSize: "16px",
  bold: false,
  italic: false,
  weight: REGULAR_WEIGHT,
  lineHeight: null,
  letterSpacing: null,
  usage: "",
};

/**
 * §3 — one row per text style, the row being edited expanded.
 *
 * `bold` is what §4 derives from `weight >= 600`; `italic` has no kit field at
 * all, which is why creating a brand costs an import plus a patch (see
 * lib/media/brandKit/save.ts). The preview is `aria-hidden` with a live
 * summary beside it, so the change is HEARD as "Inter, 32px" rather than
 * silently redrawn.
 */
export const TypographySection = ({
  textStyles,
  onChange,
}: {
  textStyles: BrandDraft["textStyles"];
  onChange: (next: BrandDraftTextStyle[]) => void;
}) => {
  const { t } = useTranslate();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<BrandDraftTextStyle>(NEW_STYLE);

  const open = (index: number) => {
    setDraft(textStyles[index]);
    setEditing(index);
  };

  const add = () => {
    const next = [...textStyles, NEW_STYLE];
    onChange(next);
    setDraft(NEW_STYLE);
    setEditing(next.length - 1);
  };

  const commit = () => {
    if (editing === null) return;
    const next = [...textStyles];
    next[editing] = {
      ...draft,
      // Keep the authored weight when it already agrees with the bold flag, so
      // an untouched 600 is not rewritten to 700 (see projection.ts).
      weight:
        draft.weight !== null && draft.weight >= 600 === draft.bold
          ? draft.weight
          : draft.bold
            ? BOLD_WEIGHT
            : REGULAR_WEIGHT,
    };
    onChange(next);
    setEditing(null);
  };

  const roleLabel = (style: BrandDraftTextStyle) => {
    if (style.role === "custom" && style.label) return style.label;
    const key = TYPOGRAPHY_ROLE_LABEL_KEY[style.role];
    return key ? t(key) : style.role;
  };

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {textStyles.map((style, index) => {
        const isOpen = editing === index;
        // Open, the preview answers to the controls above it; shut, to what was
        // last committed. One row, two sources, so the preview never shows an
        // abandoned edit after Cancel.
        const shown = isOpen ? draft : style;
        return (
          <div
            key={index}
            className={cn(STYLE_ROW_CLASS, !isOpen && STYLE_ROW_CLOSED_CLASS)}
          >
            <div
              inert={!isOpen}
              className={cn(
                STYLE_PANEL_CLASS,
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="flex flex-wrap items-end gap-3 px-4 pt-4">
                  {/* Not a Select: the catalogue is the live Google library, which
                  is a list you search, not one you scroll. See FontPicker. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">
                      {t("appChat.brandKit.typography.fontLabel")}
                    </span>
                    <FontPicker
                      value={draft.fontFamily}
                      onChange={(family) => setDraft({ ...draft, fontFamily: family })}
                      className="w-44"
                    />
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">
                      {t("appChat.brandKit.typography.roleLabel")}
                    </span>
                    <Select
                      value={draft.role || undefined}
                      onValueChange={(value) => setDraft({ ...draft, role: value })}
                    >
                      <SelectTrigger className={cn(BRAND_SELECT_TRIGGER_CLASS, "w-44")}>
                        <SelectValue
                          placeholder={t("appChat.brandKit.typography.rolePlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent className={BRAND_SELECT_CONTENT_CLASS}>
                        {TYPOGRAPHY_ROLES.map((role) => (
                          <SelectItem
                            key={role}
                            value={role}
                            hideIndicator
                            className={BRAND_SELECT_ITEM_CLASS}
                          >
                            {t(TYPOGRAPHY_ROLE_LABEL_KEY[role])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">
                      {t("appChat.brandKit.typography.sizeLabel")}
                    </span>
                    <Select
                      value={draft.fontSize || undefined}
                      onValueChange={(value) => setDraft({ ...draft, fontSize: value })}
                    >
                      <SelectTrigger className={cn(BRAND_SELECT_TRIGGER_CLASS, "w-28")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={BRAND_SELECT_CONTENT_CLASS}>
                        {FONT_SIZES.map((size) => (
                          <SelectItem
                            key={size}
                            value={`${size}px`}
                            hideIndicator
                            className={BRAND_SELECT_ITEM_CLASS}
                          >
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="flex items-center gap-2">
                    <StyleToggleButton
                      pressed={draft.bold}
                      label={t("appChat.brandKit.typography.bold")}
                      icon={Bold}
                      onToggle={() => setDraft({ ...draft, bold: !draft.bold })}
                    />
                    <StyleToggleButton
                      pressed={draft.italic}
                      label={t("appChat.brandKit.typography.italic")}
                      icon={Italic}
                      onToggle={() => setDraft({ ...draft, italic: !draft.italic })}
                    />
                  </div>
                </div>
                <div className="mx-4 mt-4 border-t border-neutral-200 dark:border-neutral-800" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3">
              {/* The preview is also the way in. Shut it is the whole row's
                  button; open it is inert text, because the row is already
                  open and the actions beside it are what is left to press. */}
              <button
                type="button"
                disabled={isOpen}
                aria-expanded={isOpen}
                onClick={() => open(index)}
                aria-label={t("appChat.brandKit.typography.edit").replace(
                  "{role}",
                  roleLabel(shown),
                )}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span
                  style={{
                    fontFamily: shown.fontFamily
                      ? `"${shown.fontFamily}", sans-serif`
                      : undefined,
                    fontSize: isOpen ? shown.fontSize || undefined : undefined,
                    fontWeight: shown.bold ? 700 : 400,
                    fontStyle: shown.italic ? "italic" : undefined,
                  }}
                  className={cn(
                    "block min-w-0 truncate text-neutral-900 transition-[font-size] duration-300 motion-reduce:transition-none dark:text-neutral-50",
                    !isOpen && (shown.role === "display" ? "text-[20px]" : "text-[15px]"),
                  )}
                >
                  {roleLabel(shown)}
                </span>
              </button>

              {isOpen ? (
                <>
                  <span aria-live="polite" className="sr-only">
                    {t("appChat.brandKit.typography.previewSummary")
                      .replace(
                        "{font}",
                        draft.fontFamily || t("appChat.brandKit.fontUnset"),
                      )
                      .replace("{size}", draft.fontSize)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={t("appChat.brandKit.typography.confirm")}
                      onClick={commit}
                      className={ROW_ICON_BUTTON_CLASS}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("appChat.brandKit.typography.cancel")}
                      onClick={() => setEditing(null)}
                      className={ROW_ICON_BUTTON_CLASS}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("appChat.brandKit.typography.remove")}
                      onClick={() => {
                        onChange(textStyles.filter((_, at) => at !== index));
                        setEditing(null);
                      }}
                      className={cn(ROW_ICON_GHOST_CLASS, ROW_ICON_DELETE_CLASS)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <span className="shrink-0 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  {[style.fontFamily || t("appChat.brandKit.fontUnset"), style.fontSize]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <Button
        variant="secondary"
        className="justify-center rounded-xl py-6"
        onClick={add}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t("appChat.brandKit.typography.add")}
      </Button>
    </div>
  );
};
