"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";

import {
  useTranslate,
  languages,
  type LanguageCode,
} from "@/hooks/useTranslate";
import { useThemeStore, type ThemeMode } from "@/lib/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { SettingsToggle } from "../SettingsToggle";
import { DeliveryModeResetRow } from "./DeliveryModeResetRow";

export function GeneralTab() {
  const { t, lang, setLang } = useTranslate();
  const theme = useThemeStore((state) => state.mode);
  const setTheme = useThemeStore((state) => state.setMode);
  const initTheme = useThemeStore((state) => state.init);
  const [langOpen, setLangOpen] = useState(false);
  const [notifications, setNotifications] = useState({
    productUpdates: true,
    taskEmails: true,
    ads: false,
  });
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const currentLanguage =
    languages.find((language) => language.code === lang)?.label ?? lang;

  const themeButtons: { mode: ThemeMode; icon: typeof Sun; labelKey: string }[] = [
    { mode: "light", icon: Sun, labelKey: "settings.general.theme.light" },
    { mode: "dark", icon: Moon, labelKey: "settings.general.theme.dark" },
    { mode: "system", icon: Monitor, labelKey: "settings.general.theme.system" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t("settings.general.appearance")}
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-[12px] text-neutral-500 dark:text-neutral-400 font-semibold">
            {t("settings.general.language")}
          </div>
          <div className="relative w-56">
            <button
              type="button"
              onClick={() => setLangOpen((current) => !current)}
              className="flex h-9 w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-900 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:border-neutral-700"
            >
              {currentLanguage}
              <ChevronDown
                className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 font-semibold"
                strokeWidth={1.75}
              />
            </button>
            {langOpen ? (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setLangOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
                  {languages.map((language) => (
                    <button
                      key={language.code}
                      type="button"
                      onClick={() => {
                        setLang(language.code as LanguageCode);
                        setLangOpen(false);
                      }}
                      className="flex h-8 w-full items-center px-3 text-left text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-900"
                    >
                      {language.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-neutral-500 dark:text-neutral-400 font-semibold">
            {t("settings.general.theme.label")}
          </div>
          <div className="flex items-center gap-2">
            {themeButtons.map(({ mode, icon: Icon, labelKey }) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  className={cn(
                    "flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-lg border text-[12px] transition-colors",
                    active
                      ? "border-neutral-900 text-neutral-900 font-semibold dark:border-neutral-100 dark:text-neutral-100"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
          {t("settings.general.communicationPreferences")}
        </div>
        <div className="flex flex-col gap-4">
          <SwitchRow
            label={t("settings.general.notifications.productUpdates")}
            sub={t("settings.general.notifications.productUpdatesDesc")}
            checked={notifications.productUpdates}
            onCheckedChange={(value) =>
              setNotifications((current) => ({
                ...current,
                productUpdates: value,
              }))
            }
          />
          <SwitchRow
            label={t("settings.general.notifications.taskEmails")}
            sub={t("settings.general.notifications.taskEmailsDesc")}
            checked={notifications.taskEmails}
            onCheckedChange={(value) =>
              setNotifications((current) => ({ ...current, taskEmails: value }))
            }
          />
          <SwitchRow
            label={t("settings.general.notifications.ads")}
            sub={t("settings.general.notifications.adsDesc")}
            checked={notifications.ads}
            onCheckedChange={(value) =>
              setNotifications((current) => ({ ...current, ads: value }))
            }
          />
        </div>
      </div>

      <DeliveryModeResetRow />
    </div>
  );
}

function SwitchRow({
  label,
  sub,
  checked,
  onCheckedChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{label}</div>
        {sub ? (
          <div className="mt-0.5 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400 font-semibold">
            {sub}
          </div>
        ) : null}
      </div>
      <SettingsToggle checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
