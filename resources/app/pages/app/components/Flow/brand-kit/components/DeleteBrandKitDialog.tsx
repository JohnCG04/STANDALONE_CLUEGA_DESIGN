"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";

/**
 * Confirms deleting one brand kit.
 *
 * `failedMessage` is the shape DeleteFlowProjectDialog already found it needs,
 * and the Brand Kit needs it for the same reason: a `409` refusal is not a
 * crash, it is the service naming how many products still point at the brand.
 * So the dialog STAYS OPEN and says so, rather than closing on a card that
 * would then reappear with nothing explained.
 */
export const DeleteBrandKitDialog = ({
  name,
  open,
  pending,
  failedMessage,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  pending: boolean;
  failedMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const { t } = useTranslate();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="w-full max-w-md p-6">
        <DialogTitle>
          {t("appChat.brandKit.deleteDialog.title").replace("{name}", name)}
        </DialogTitle>
        <DialogDescription className="mt-1.5">
          {t("appChat.brandKit.deleteDialog.description")}
        </DialogDescription>

        {failedMessage ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-[13px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {failedMessage}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("appChat.brandKit.deleteDialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {t("appChat.brandKit.deleteDialog.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
