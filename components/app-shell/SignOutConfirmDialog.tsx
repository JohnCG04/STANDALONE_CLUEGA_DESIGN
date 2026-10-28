"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { clearCdpSessionTokens } from "@/lib/cdp";

export function SignOutConfirmDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useTranslate();
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/app-auth", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      // Best-effort: continue clearing client-side state even if request fails.
    }
    clearCdpSessionTokens();
    // Hard navigation: avoids Radix Dialog scroll-lock leaking pointer-events:none
    // onto the body after an SPA navigation mid-close, and guarantees the
    // post-logout pages re-render fresh against the now-missing auth cookie.
    // `from=/flow` puts LoginForm into app-auth mode (otherwise inputs stay disabled).
    window.location.assign("/login?from=%2Fflow");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[360px] p-6">
        <DialogTitle>{t("profileMenu.signOutConfirmTitle")}</DialogTitle>
        <DialogDescription className="mt-1">{t("profileMenu.signOutConfirmBody")}</DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} type="button" disabled={pending}>
            {t("settings.common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} type="button" disabled={pending}>
            {t("profileMenu.signOut")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
