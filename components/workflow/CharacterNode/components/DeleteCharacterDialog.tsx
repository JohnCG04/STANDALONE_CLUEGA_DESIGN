"use client";

import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";

export interface DeleteCharacterDialogProps {
  name: string;
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirms deleting a character from the workspace; its slots are freed, which can't be undone. */
export const DeleteCharacterDialog = ({
  name,
  open,
  pending,
  onCancel,
  onConfirm,
}: DeleteCharacterDialogProps) => {
  const { t } = useTranslate();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="w-full max-w-md p-6">
        <DialogTitle>{t("appChat.characters.deleteDialog.title").replace("{name}", name)}</DialogTitle>
        <DialogDescription className="mt-1.5">
          {t("appChat.characters.deleteDialog.description")}
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("appChat.characters.form.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {t("appChat.characters.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
