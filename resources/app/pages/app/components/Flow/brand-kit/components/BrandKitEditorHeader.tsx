"use client";

import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";

/**
 * Back on the left, the editable brand name under it, Save Changes on the right.
 *
 * The heading is an `<input>` inside the `<h1>`, never `contentEditable`: the
 * latter has no reliable accessible name and no label to associate.
 */
export const BrandKitEditorHeader = ({
  name,
  isDirty,
  isSaving,
  onNameChange,
  onBack,
  onSave,
}: {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  onNameChange: (next: string) => void;
  onBack: () => void;
  onSave: () => void;
}) => {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <Button variant="outline" className="rounded-full" onClick={onBack}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("appChat.brandKit.editor.back")}
        </Button>
        <div className="flex items-center gap-3">
          {/* The status is announced, not just drawn: a disabled button is not
              self-explanatory when the reason is "nothing has changed". */}
          <span aria-live="polite" className="sr-only">
            {isSaving
              ? t("appChat.brandKit.editor.saving")
              : isDirty
                ? t("appChat.brandKit.editor.unsaved")
                : t("appChat.brandKit.editor.saved")}
          </span>
          <Button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            aria-busy={isSaving}
            className="rounded-full"
          >
            {isSaving
              ? t("appChat.brandKit.editor.saving")
              : t("appChat.brandKit.editor.save")}
          </Button>
        </div>
      </div>
      <h1>
        <input
          value={name}
          aria-label={t("appChat.brandKit.editor.nameLabel")}
          placeholder={t("appChat.brandKit.editor.namePlaceholder")}
          onChange={(event) => onNameChange(event.target.value)}
          className="w-full max-w-xl border-b border-neutral-200 bg-transparent pb-1 text-[26px] font-bold leading-tight text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus-visible:border-neutral-500 dark:border-neutral-800 dark:text-neutral-50"
        />
      </h1>
    </div>
  );
};
