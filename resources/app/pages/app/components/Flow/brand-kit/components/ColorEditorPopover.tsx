"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Pipette, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraftColor } from "@/lib/media/brandKit";
import { cn } from "@/lib/utils";

import { ColorPicker } from "./ColorPicker";
import {
  COLOR_ROLES,
  COLOR_ROLE_LABEL_KEY,
  PICKER_CANCEL_CLASS,
  PICKER_FIELD_CLASS,
  PICKER_ICON_BUTTON_CLASS,
  PICKER_POPOVER_CLASS,
  PICKER_SAVE_CLASS,
  BRAND_SELECT_CONTENT_CLASS,
  BRAND_SELECT_ITEM_CLASS,
  BRAND_SELECT_TRIGGER_CLASS,
} from "../constants";
import {
  groupForRole,
  hexToHsv,
  hsvToHex,
  isHex,
  normalizeHex,
  type Hsv,
} from "../helpers";

const FALLBACK_HSV: Hsv = { h: 0, s: 0, v: 0 };

/** Chrome and Edge only; Safari and Firefox get the field and the square. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null);

/**
 * Edit one colour: its hex, its name and its role.
 *
 * HSV is the state, not the hex — the square and strip are HSV axes, and a
 * round trip through `#RRGGBB` cannot carry a hue through black. The typed
 * field is read back only once it holds a complete colour, so half-finished
 * input never jerks the handles around.
 *
 * NO OPACITY, although the design shows one: `BrandDraftColor.hex` is six
 * digits and §4 hands that string to the renderer as-is. A percentage nothing
 * stores would be a control that lies.
 */
export const ColorEditorPopover = ({
  open,
  color,
  onOpenChange,
  onCommit,
  onDelete,
  children,
}: {
  open: boolean;
  color: BrandDraftColor;
  onOpenChange: (open: boolean) => void;
  onCommit: (next: BrandDraftColor) => void;
  onDelete?: () => void;
  children: ReactNode;
}) => {
  const { t } = useTranslate();
  const errorId = useId();
  const [hexText, setHexText] = useState(color.hex);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color.hex) ?? FALLBACK_HSV);
  const [name, setName] = useState(color.name);
  const [role, setRole] = useState(color.role || "primary");

  // Re-seed whenever the popover opens on a different colour.
  useEffect(() => {
    if (!open) return;
    setHexText(color.hex);
    setHsv(hexToHsv(color.hex) ?? FALLBACK_HSV);
    setName(color.name);
    setRole(color.role || "primary");
  }, [open, color]);

  const normalized = normalizeHex(hexText);
  const invalid = hexText.trim() !== "" && normalized === null;
  const EyeDropper = eyeDropper();

  const pick = (next: Hsv) => {
    setHsv(next);
    setHexText(hsvToHex(next));
  };

  const type = (value: string) => {
    setHexText(value);
    const parsed = hexToHsv(value);
    // Only a complete colour moves the handles; "#E85" on the way to "#E8521D"
    // is a valid three-digit hex, and snapping there mid-keystroke is what
    // makes a picker feel like it is fighting the user.
    if (parsed && value.trim().replace("#", "").length === 6) setHsv(parsed);
  };

  const commit = () => {
    const hex = normalizeHex(hexText);
    if (!hex) return;
    onCommit({
      ...color,
      hex,
      name,
      role,
      group: groupForRole(role),
    });
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label={t("appChat.brandKit.colors.pickerLabel")}
        className={PICKER_POPOVER_CLASS}
      >
        <div className="flex flex-col gap-3 p-4">
          <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-50">
            {t("appChat.brandKit.colors.pickerLabel")}
          </h3>

          <label>
            <span className="sr-only">{t("appChat.brandKit.colors.nameLabel")}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("appChat.brandKit.colors.namePlaceholder")}
              className={cn(PICKER_FIELD_CLASS, "w-full")}
            />
          </label>

          <ColorPicker hsv={hsv} onChange={pick} />

          <div className="flex items-center gap-2">
            {EyeDropper ? (
              <button
                type="button"
                aria-label={t("appChat.brandKit.colors.eyedropper")}
                onClick={() => {
                  void new EyeDropper()
                    .open()
                    .then(({ sRGBHex }) => {
                      const parsed = hexToHsv(sRGBHex);
                      if (parsed) pick(parsed);
                    })
                    // The user pressed Escape, which rejects. Nothing to say.
                    .catch(() => undefined);
                }}
                className={PICKER_ICON_BUTTON_CLASS}
              >
                <Pipette className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            <span className="flex h-9 shrink-0 items-center rounded-lg border border-neutral-200 px-3 text-[12px] font-medium text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              {t("appChat.brandKit.colors.hexLabel")}
            </span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t("appChat.brandKit.colors.hexLabel")}</span>
              <Input
                value={hexText}
                spellCheck={false}
                aria-describedby={invalid ? errorId : undefined}
                aria-invalid={invalid || undefined}
                onChange={(event) => type(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                }}
                placeholder="#E8521D"
                className={cn(PICKER_FIELD_CLASS, "w-full")}
              />
            </label>
          </div>

          {invalid ? (
            <p id={errorId} role="alert" className="text-[12px] font-medium text-red-500">
              {t("appChat.brandKit.colors.hexInvalid")}
            </p>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-400">
              {t("appChat.brandKit.colors.roleLabel")}
            </span>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className={BRAND_SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={BRAND_SELECT_CONTENT_CLASS}>
                {COLOR_ROLES.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    hideIndicator
                    className={BRAND_SELECT_ITEM_CLASS}
                  >
                    {t(COLOR_ROLE_LABEL_KEY[option])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="text-[11px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
            {t("appChat.brandKit.colors.nameHint")}
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          {onDelete ? (
            <button
              type="button"
              aria-label={t("appChat.brandKit.colors.remove")}
              onClick={onDelete}
              className={cn(PICKER_ICON_BUTTON_CLASS, "hover:text-red-600")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={PICKER_CANCEL_CLASS}
          >
            {t("appChat.brandKit.colors.cancel")}
          </button>
          <button
            type="button"
            disabled={!isHex(hexText)}
            onClick={commit}
            className={PICKER_SAVE_CLASS}
          >
            {t("appChat.brandKit.colors.save")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
