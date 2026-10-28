"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { clearAll, hasAnyDeliveryMode } from "@/lib/ad-plan/deliveryModePreference";

/**
 * Settings -> General: forget the delivery modes Create Plan was asked to
 * remember (AI01-028). Afterwards every platform card shows the "Confirm
 * delivery mode" modal again.
 *
 * The choices live in this browser's `localStorage`, which does not exist while
 * rendering on the server, so they are read after mount. With none remembered
 * the button is off and says so instead of looking broken.
 */
export function DeliveryModeResetRow() {
  const { t } = useTranslate();
  const [remembered, setRemembered] = useState(false);
  const [justCleared, setJustCleared] = useState(false);

  useEffect(() => {
    setRemembered(hasAnyDeliveryMode());
  }, []);

  const statusKey = justCleared
    ? "settings.general.deliveryMode.done"
    : remembered
      ? null
      : "settings.general.deliveryMode.nothing";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t("settings.general.deliveryMode.title")}
        </div>
        <div className="mt-0.5 text-[12px] font-semibold leading-snug text-neutral-500 dark:text-neutral-400">
          {t("settings.general.deliveryMode.description")}
        </div>
        {statusKey ? (
          <div
            role="status"
            data-testid="delivery-mode-reset-status"
            className="mt-1 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400"
          >
            {t(statusKey)}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={!remembered}
        data-testid="delivery-mode-reset"
        onClick={() => {
          clearAll();
          setRemembered(false);
          setJustCleared(true);
        }}
      >
        {t("settings.general.deliveryMode.reset")}
      </Button>
    </div>
  );
}
