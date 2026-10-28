"use client";

import { useEffect, useRef, useState } from "react";

import { turnstileConfig } from "@/config/turnstile";
import { useTranslate } from "@/hooks/useTranslate";
import type { LanguageCode } from "@/i18n/config";
import { useThemeStore } from "@/lib/stores/useThemeStore";
import { cn } from "@/lib/utils";

const SCRIPT_ID = "cloudflare-turnstile";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  language?: string;
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Turnstile has its own locale codes; map our language codes onto them.
const widgetLanguageByLang: Record<LanguageCode, string> = {
  zh: "zh-tw",
  vn: "vi",
  en: "en",
  th: "th",
};

let scriptPromise: Promise<void> | null = null;

/** Load the Turnstile script once per page, shared across widget instances. */
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      // Let a later mount retry (offline, blocked by an extension, …).
      scriptPromise = null;
      reject(new Error("turnstileScriptFailed"));
    });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

type TurnstileWidgetProps = {
  /** Called with a fresh token on success, and with null whenever it is lost. */
  onTokenChange: (token: string | null) => void;
  /**
   * Increment to discard the current token and issue a new one — tokens are
   * single-use, so the widget has to be reset after every failed submit.
   */
  resetSignal?: number;
  className?: string;
};

export function TurnstileWidget({
  className,
  onTokenChange,
  resetSignal = 0,
}: TurnstileWidgetProps) {
  const { lang, t } = useTranslate();
  const themeMode = useThemeStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  // Kept in a ref so a new callback identity never re-renders the widget (which
  // would drop a token the user already solved for).
  const onTokenChangeRef = useRef(onTokenChange);
  const [hasScriptError, setHasScriptError] = useState(false);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let isCancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (isCancelled || !window.turnstile) {
          return;
        }

        setHasScriptError(false);
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: turnstileConfig.siteKey,
          // "system" follows the OS, which is exactly Turnstile's "auto".
          theme: themeMode === "system" ? "auto" : themeMode,
          language: widgetLanguageByLang[lang],
          size: "flexible",
          callback: (token) => onTokenChangeRef.current(token),
          "expired-callback": () => onTokenChangeRef.current(null),
          "timeout-callback": () => onTokenChangeRef.current(null),
          "error-callback": () => onTokenChangeRef.current(null),
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setHasScriptError(true);
        }
      });

    return () => {
      isCancelled = true;
      onTokenChangeRef.current(null);
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = undefined;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
    // Theme and language are render-time options — changing either rebuilds the
    // widget, which also clears the token (handled by the cleanup above).
  }, [lang, themeMode]);

  useEffect(() => {
    if (!resetSignal) {
      return;
    }

    const widgetId = widgetIdRef.current;
    if (widgetId) {
      onTokenChangeRef.current(null);
      window.turnstile?.reset(widgetId);
    }
  }, [resetSignal]);

  if (hasScriptError) {
    return (
      <p className="text-[12px] font-semibold text-red-700 dark:text-red-300">
        {t("login.errors.captchaUnavailable")}
      </p>
    );
  }

  return <div className={cn("min-h-[65px] w-full", className)} ref={containerRef} />;
}
