"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";

/** Confirms abandoning a dirty editor. Modelled on DeleteFlowProjectDialog. */
export const UnsavedChangesDialog = ({
  open,
  onStay,
  onDiscard,
}: {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
}) => {
  const { t } = useTranslate();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onStay())}>
      <DialogContent className="w-full max-w-md p-6">
        <DialogTitle>{t("appChat.brandKit.unsaved.title")}</DialogTitle>
        <DialogDescription className="mt-1.5">
          {t("appChat.brandKit.unsaved.description")}
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onStay}>
            {t("appChat.brandKit.unsaved.stay")}
          </Button>
          <Button onClick={onDiscard}>
            {t("appChat.brandKit.unsaved.discard")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
