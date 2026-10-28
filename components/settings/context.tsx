"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SettingsTab } from "@/lib/settings/types";
import { rememberBillingReturn } from "@/lib/billing/rechargePurchase";
import {
  billingReturnFromSearch,
  searchWithoutSettingsOpener,
  settingsTabFromSearch,
} from "@/lib/settings/open-from-url";

interface SettingsContextValue {
  isOpen: boolean;
  activeTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const openSettings = useCallback((tab?: SettingsTab) => {
    setActiveTab(tab ?? "general");
    setIsOpen(true);
  }, []);

  const closeSettings = useCallback(() => setIsOpen(false), []);

  // Allow anywhere in the app (e.g. the chat out-of-tokens banner) to open a
  // settings tab via a window event, without importing the context.
  useEffect(() => {
    const handler = (e: Event) => openSettings((e as CustomEvent).detail as SettingsTab | undefined);
    window.addEventListener("cdp-open-settings", handler);
    return () => window.removeEventListener("cdp-open-settings", handler);
  }, [openSettings]);

  // Cmd/Ctrl+, — the shortcut the account menu advertises next to Settings.
  // Guards copied from useGlobalSearchHotkey: an IME candidate window owns its
  // keystrokes, and requiring exactly one of meta/ctrl keeps editor bindings
  // like Ctrl+Alt+, out of it.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== ",") return;
      if (event.metaKey === event.ctrlKey) return;
      if (event.altKey) return;

      event.preventDefault();
      openSettings();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSettings]);

  // ...and let a URL do it, which is what a redirect back from a payment
  // provider has to work with. Stripe's hosted card page returns the customer
  // to an address; before this, that address opened the bare app and nothing
  // told them the card had been saved.
  //
  // The parameter is then stripped with replaceState, so closing the modal and
  // refreshing -- or pressing back -- does not re-open it.
  useEffect(() => {
    const tab = settingsTabFromSearch(window.location.search);
    if (!tab) return;
    openSettings(tab);
    // The strip below removes the marker before any panel mounts, so park it first.
    const marker = billingReturnFromSearch(window.location.search);
    if (marker) rememberBillingReturn(marker);
    const rest = searchWithoutSettingsOpener(window.location.search);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${rest}${window.location.hash}`,
    );
  }, [openSettings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      isOpen,
      activeTab,
      openSettings,
      closeSettings,
      setActiveTab,
    }),
    [isOpen, activeTab, openSettings, closeSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used inside <SettingsProvider>");
  }
  return ctx;
}
