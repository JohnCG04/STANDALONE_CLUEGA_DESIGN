"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import type { BrandDraft, BrandDraftColor } from "@/lib/media/brandKit";

import { AddTile } from "../AddTile";
import { ColorEditorPopover } from "../ColorEditorPopover";
import { ColorSwatchTile } from "../ColorSwatchTile";
import { DEFAULT_NEW_COLOR_HEX, TILE_GRID_CLASS } from "../../constants";

const NEW_COLOR: BrandDraftColor = {
  hex: DEFAULT_NEW_COLOR_HEX,
  name: "",
  role: "primary",
  usage: "",
  variants: {},
  group: "brand",
};

/**
 * §2 — the palette.
 *
 * Only the HEX reaches a render (§4 projects `colors.brand[].hex` then
 * `colors.neutrals[].hex` and nothing else), so a colour's name and role are
 * notes for the team — and on a saved brand they cannot be written back at all.
 * The popover says so rather than accepting an edit that reverts.
 */
export const ColorsSection = ({
  colors,
  onChange,
}: {
  colors: BrandDraft["colors"];
  onChange: (next: BrandDraftColor[]) => void;
}) => {
  const { t } = useTranslate();
  const [editing, setEditing] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const commit = (index: number | null, value: BrandDraftColor) => {
    if (index === null) {
      onChange([...colors, value]);
      return;
    }
    const next = [...colors];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className={TILE_GRID_CLASS}>
      <ColorEditorPopover
        open={isAdding}
        color={NEW_COLOR}
        onOpenChange={setIsAdding}
        onCommit={(value) => commit(null, value)}
      >
        <AddTile
          label={t("appChat.brandKit.colors.addShort")}
          icon={Plus}
          onClick={() => setIsAdding(true)}
        />
      </ColorEditorPopover>

      {colors.map((color, index) => (
        <ColorEditorPopover
          key={`${color.hex}-${index}`}
          open={editing === index}
          color={color}
          onOpenChange={(open) => setEditing(open ? index : null)}
          onCommit={(value) => commit(index, value)}
          onDelete={() => {
            onChange(colors.filter((_, at) => at !== index));
            setEditing(null);
          }}
        >
          <div>
            <ColorSwatchTile color={color} onEdit={() => setEditing(index)} />
          </div>
        </ColorEditorPopover>
      ))}
    </div>
  );
};
