import { memo } from "react";
import { AudioLines, PlayCircle, Type } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import type { FlowVariableKind } from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import type { PickedTile } from "../../types";
import { PREVIEW_COUNT } from "../constants";

export interface SelectionFooterProps {
  kind: FlowVariableKind;
  picked: readonly PickedTile[];
  canSave: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** What will be saved, then Cancel / Save Variable. */
export const SelectionFooter = memo(function SelectionFooter({
  kind,
  picked,
  canSave,
  saving,
  onCancel,
  onSave,
}: SelectionFooterProps) {
  const { t } = useTranslate();
  return (
    <div className="flex items-center gap-3 border-t border-border px-7 py-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {kind === "text" ? (
          <Type className="size-4 text-neutral-500" aria-hidden="true" />
        ) : (
          <div className="flex -space-x-2">
            {picked.slice(0, PREVIEW_COUNT).map((tile) => (
              <span
                key={tile.key}
                className="flex size-7 items-center justify-center overflow-hidden rounded-md border-2 border-white bg-neutral-200 dark:border-neutral-900 dark:bg-neutral-700"
              >
                {tile.isAudio ? (
                  <AudioLines className="size-3.5 text-neutral-500" />
                ) : tile.isVideo && !tile.thumbnailUrl ? (
                  <PlayCircle className="size-3.5 text-neutral-500" />
                ) : (
                  <img
                    src={tile.thumbnailUrl || tile.url}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </span>
            ))}
          </div>
        )}
        {kind !== "text" && (
          <span className="text-[14px] text-neutral-700 dark:text-neutral-200">
            {t("appChat.flow.variables.picker.selected").replace("{count}", String(picked.length))}
          </span>
        )}
      </div>
      <Button variant="outline" onClick={onCancel} disabled={saving} className="rounded-full px-5">
        {t("appChat.flow.variables.picker.cancel")}
      </Button>
      <Button
        variant="primary"
        onClick={onSave}
        disabled={!canSave || saving}
        className="rounded-full px-5"
      >
        {saving
          ? t("appChat.flow.variables.picker.saving")
          : t("appChat.flow.variables.picker.save")}
      </Button>
    </div>
  );
});
