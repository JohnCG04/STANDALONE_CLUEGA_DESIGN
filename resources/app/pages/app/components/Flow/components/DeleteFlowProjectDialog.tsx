"use client";

import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";

/** The slice of a project card the dialog needs to say what is about to go. */
export type DeleteFlowProjectTarget = {
  id: string;
  name: string;
  assets: number;
};

type Props = {
  /** The project awaiting confirmation, or null when the dialog is closed. */
  project: DeleteFlowProjectTarget | null;
  /** True while the DELETE request is in flight. */
  pending: boolean;
  /**
   * True when the last confirm failed. The list hook rolls the card back on its
   * own but only surfaces the error when the list is empty, so without this the
   * card would silently reappear with nothing said — the dialog stays open and
   * tells the user instead, leaving them to retry or back out.
   */
  failed: boolean;
  /**
   * A specific reason for the failure (e.g. naming the template/tool a
   * `flow_project_in_use` conflict refuses to let go of). Falls back to the
   * generic `deleteDialog.error` copy when absent, so every failure the
   * backend does not single out still shows something.
   */
  failedMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirms deleting one workflow project from the Flow list.
 *
 * `DELETE /projects/:id` removes the project together with its workflow document
 * and there is no restore, so the "..." menu must not do it on a single click.
 * Assets the workflow produced live in the Knowledge Base and survive — the copy
 * says so rather than claiming everything is lost.
 */
export function DeleteFlowProjectDialog({
  project,
  pending,
  failed,
  failedMessage,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslate();

  return (
    <Dialog
      open={project !== null}
      onOpenChange={(next) => {
        // Never close mid-delete: the card would vanish under a dialog that is
        // still working.
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="w-[420px] max-w-[calc(100vw-32px)] p-0">
        <div className="flex items-start gap-4 border-b border-neutral-100 px-5 py-4 dark:border-neutral-800">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-destructive dark:bg-red-950/40">
            <AlertTriangle className="size-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[15px] font-semibold text-neutral-950 dark:text-neutral-50">
              {t("appChat.flow.deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
              {t("appChat.flow.deleteDialog.description")}
            </DialogDescription>
          </div>
        </div>

        {/* {project ? (
          <div className="mx-5 mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
              {project.name}
            </div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-neutral-500 dark:text-neutral-400">
              <ImageIcon className="size-3" strokeWidth={2} />
              {project.assets} {t("appChat.flow.assets")}
            </div>
          </div>
        ) : null} */}

        {failed ? (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {failedMessage ?? t("appChat.flow.deleteDialog.error")}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            size="pill"
            disabled={pending}
            onClick={onCancel}
          >
            {t("appChat.flow.deleteDialog.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="pill"
            disabled={pending || !project}
            onClick={onConfirm}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" strokeWidth={1.8} />
            )}
            {t("appChat.flow.deleteDialog.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
