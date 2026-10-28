"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/hooks/useTranslate";
import { useSettings } from "./context";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsContent } from "./SettingsContent";

export function SettingsModal() {
  const { isOpen, closeSettings } = useSettings();
  const { t } = useTranslate();

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? null : closeSettings())}>
      <DialogContent className="h-[720px] max-h-[92vh] w-[1080px] max-w-[94vw] min-w-[640px] overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl ring-0 dark:bg-neutral-950">
        <DialogTitle className="sr-only">{t("settings.modal.title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("settings.modal.title")}
        </DialogDescription>
        <div className="flex h-full">
          <SettingsSidebar />
          <SettingsContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}
