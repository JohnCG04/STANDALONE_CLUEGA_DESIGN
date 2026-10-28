"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useTranslate } from "@/hooks/useTranslate";
import { isPersonaFeatureEnabled } from "@/config/persona";
import { useAssistantAvatarStore } from "@/lib/stores/useAssistantAvatarStore";
import { SettingsToggle } from "./SettingsToggle";

/**
 * The opt-in for the animated assistant avatar, on the Profile tab.
 *
 * Its own file rather than more rows inside
 * [ProfileTab.tsx](tabs/ProfileTab.tsx) for the same reason
 * [AccountContextEditor.tsx](AccountContextEditor.tsx) is: the tab owns layout,
 * each preference owns its own state and persistence. Nothing here shares the
 * tab's `handleSave`, which is display-name-specific and gated on the
 * display-name dirty check.
 *
 * The switch reports its write, because there is now a real one to report: the
 * preference is stored on the user's onboarding profile (see
 * [useAssistantAvatarStore.ts](../../lib/stores/useAssistantAvatarStore.ts)).
 * `busy` while it is in flight, and if the server refuses, the store puts the
 * switch back and this row says so — a snap-back with no explanation reads as a
 * dropped click.
 *
 * Renders nothing while the persona feature is off, which is the default — the
 * Profile tab is then exactly the tab it was before.
 */
export function AssistantAvatarRow() {
  const { t } = useTranslate();
  const { enabled, hydrate, saveFailed, saving, setEnabled } = useAssistantAvatarStore(
    useShallow((s) => ({
      enabled: s.enabled,
      hydrate: s.hydrate,
      saveFailed: s.saveFailed,
      saving: s.saving,
      setEnabled: s.setEnabled,
    })),
  );

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!isPersonaFeatureEnabled()) return null;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t("settings.profile.avatar.label")}
        </div>
        <div className="mt-0.5 text-[12px] leading-snug font-semibold text-neutral-500 dark:text-neutral-400">
          {t("settings.profile.avatar.hint")}
        </div>
        {saveFailed ? (
          <div role="alert" className="mt-1 text-[12px] font-semibold text-rose-500">
            {t("settings.profile.avatar.saveError")}
          </div>
        ) : null}
      </div>
      <SettingsToggle
        ariaLabel={t("settings.profile.avatar.label")}
        busy={saving}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
    </div>
  );
}
