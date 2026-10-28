"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

import { renderInline } from "@/components/legal/inline";
import { useLegalHref } from "@/hooks/useLegalHref";
import { useSurfaceScheme, type SurfaceScheme } from "@/hooks/useSurfaceScheme";
import { useTranslate } from "@/hooks/useTranslate";
import {
  DEFAULT_COOKIE_CONSENT,
  OPEN_COOKIE_PREFERENCES_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsent as CookieConsentValue,
} from "@/lib/cookie-consent";
import { OVERLAY_LAYER } from "@/lib/overlay-layers";
import { cn } from "@/lib/utils";

/**
 * Cookie consent, laid out after the reference screenshots (Sony/OneTrust):
 *
 * 1. A notice card whose actions are centred, underlined text links — "Accept
 *    all" and "Reject non-essential cookies" in ink, "Manage cookies" in link
 *    blue — plus a dismiss ✕.
 * 2. "Cookie Preference Center", anchored to the bottom-right corner, with a
 *    sticky brand header, scrolling body, the category list, and a closing
 *    action bar.
 *
 * Opening the preference center dims the page and leaves the notice card mounted
 * behind the scrim, as in the reference. Solid buttons are black on white and the
 * category toggle is black/white — the brand substitution the policy spec asks
 * for in place of OneTrust's green — and both invert on a dark surface so they
 * stay visible.
 *
 * ## Why the colours are a palette object and not `dark:` variants
 *
 * These panels are `fixed` and render from a layout, so they land on whatever the
 * page happens to be: the light marketing site, a dark-by-design `/solutions/*`
 * page, or `/app` in either theme. `useSurfaceScheme` decides which — keyed on the
 * *page*, never on the visitor's saved theme.
 *
 * `dark:` variants cannot express that. The variant is `&:is(.dark *)`, so once
 * the theme puts `.dark` on `<html>` every `dark:` class in the document fires:
 * a local wrapper can force dark *on* but nothing can force it *off*, which is
 * exactly the case we need — a light home page while the saved theme is dark.
 * Picking explicit classes per scheme is the only deterministic option.
 *
 * Every colour is an arbitrary value (`bg-[#ffffff]`, not `bg-white`) on purpose:
 * `globals.css` carries ~95 `.dark body.app-route-body .<utility>` rules that
 * rewrite named palette utilities inside the dark app — `.bg-white` becomes
 * `var(--card)`. Arbitrary values are matched by none of them, so the panel's
 * appearance stays hermetic.
 *
 * Re-openable at any time: the footer's "Cookie settings" link dispatches
 * `OPEN_COOKIE_PREFERENCES_EVENT`, which the Cookie Policy promises.
 *
 * ## Stacking
 *
 * Both panels take their z-index from `OVERLAY_LAYER`, which documents the whole
 * hierarchy. The split matters: the notice card is non-blocking and sits *below*
 * the modal layer so it can never cover — or intercept clicks over — a dialog,
 * while the preference center is a blocking dialog the user asked for and sits
 * above it. The notice used to sit above everything, which made any modal that
 * reached the bottom-left corner partly unclickable.
 */

type Palette = {
  surface: string;
  hairline: string;
  divide: string;
  ink: string;
  inkHover: string;
  muted: string;
  link: string;
  solid: string;
  icon: string;
  iconBorder: string;
  toggleOn: string;
  toggleOff: string;
  knob: string;
  scrim: string;
  shadow: string;
  ring: string;
  ringOffset: string;
};

const LIGHT_PALETTE: Palette = {
  surface: "bg-[#ffffff]",
  hairline: "border-[#e4e7ec]",
  divide: "divide-[#e4e7ec]",
  ink: "text-[#1a1a1a]",
  inkHover: "hover:text-[#4b5563]",
  muted: "text-[#4b5563]",
  link: "text-[#2563eb] hover:text-[#1d4ed8]",
  solid: "bg-[#202124] text-[#ffffff] hover:bg-[#383e47]",
  icon: "text-[#4b5563] hover:text-[#1a1a1a]",
  iconBorder: "border-[#c7ccd4]",
  toggleOn: "bg-[#202124]",
  toggleOff: "bg-[#c7ccd4]",
  knob: "bg-[#ffffff]",
  scrim: "bg-[rgb(0_0_0_/_0.3)]",
  shadow:
    "shadow-[0_10px_30px_-4px_rgba(28,40,64,0.10),0_8px_8px_-8px_rgba(28,40,64,0.10),0_4px_4px_-6px_rgba(28,40,64,0.14)]",
  ring: "focus-visible:ring-[rgb(32_33_36_/_0.2)]",
  ringOffset: "focus-visible:ring-offset-[#ffffff]",
};

const DARK_PALETTE: Palette = {
  surface: "bg-[#1c1f26]",
  hairline: "border-[rgb(255_255_255_/_0.12)]",
  divide: "divide-[rgb(255_255_255_/_0.10)]",
  ink: "text-[#f2f4f7]",
  inkHover: "hover:text-[#ffffff]",
  muted: "text-[#98a2b3]",
  link: "text-[#60a5fa] hover:text-[#93c5fd]",
  solid: "bg-[#f2f4f7] text-[#16181d] hover:bg-[#ffffff]",
  icon: "text-[#98a2b3] hover:text-[#ffffff]",
  iconBorder: "border-[rgb(255_255_255_/_0.2)]",
  toggleOn: "bg-[#f2f4f7]",
  toggleOff: "bg-[rgb(255_255_255_/_0.25)]",
  knob: "bg-[#16181d]",
  scrim: "bg-[rgb(0_0_0_/_0.6)]",
  shadow: "shadow-[0_16px_40px_-8px_rgba(0,0,0,0.7)]",
  ring: "focus-visible:ring-[rgb(255_255_255_/_0.3)]",
  ringOffset: "focus-visible:ring-offset-[#1c1f26]",
};

function paletteFor(scheme: SurfaceScheme): Palette {
  return scheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Centred underlined action, as the reference renders its banner buttons. */
const bannerActionClass =
  "mx-auto block rounded-sm text-[15px] font-semibold leading-[1.4] underline decoration-[1.5px] underline-offset-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2";

/** Near-square solid button — the reference shape, in black instead of green. */
const solidButtonClass =
  "inline-flex items-center justify-center rounded-[6px] px-7 py-2.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px]";

const iconButtonClass =
  "inline-flex items-center justify-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-2";

export function CookieConsent() {
  const { t } = useTranslate();
  const resolveLegalHref = useLegalHref();
  const palette = paletteFor(useSurfaceScheme());
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [hasDecided, setHasDecided] = useState(true);
  const [draft, setDraft] = useState<CookieConsentValue>(DEFAULT_COOKIE_CONSENT);

  useEffect(() => {
    const stored = readCookieConsent();

    if (stored) {
      setDraft(stored);
      return;
    }

    setHasDecided(false);
    setIsNoticeOpen(true);
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setDraft(readCookieConsent() ?? DEFAULT_COOKIE_CONSENT);
      setIsCenterOpen(true);
    };

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);

    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
  }, []);

  const save = useCallback((consent: CookieConsentValue) => {
    writeCookieConsent(consent);
    setDraft(consent);
    setHasDecided(true);
    setIsCenterOpen(false);
    setIsNoticeOpen(false);
  }, []);

  if (!isNoticeOpen && !isCenterOpen) {
    return null;
  }

  return (
    <>
      {isNoticeOpen ? (
        <aside
          role="region"
          aria-label={t("legal.cookie.banner.ariaLabel")}
          className={cn(
            "fixed bottom-4 left-4 w-[480px] max-w-[calc(100vw-2rem)] rounded-2xl border px-8 pb-8 pt-6",
            OVERLAY_LAYER.consentNotice,
            palette.surface,
            palette.hairline,
            palette.shadow,
          )}
        >
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={() => setIsNoticeOpen(false)}
              aria-label={t("legal.cookie.center.close")}
              className={cn(iconButtonClass, palette.icon, palette.ring, "-mr-2 -mt-1 size-8")}
            >
              <X className="size-[18px]" strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>

          <p className={cn("text-[15px] leading-[1.6]", palette.ink)}>
            {renderInline(t("legal.cookie.banner.body"), {
              linkClassName: cn("underline underline-offset-2 transition-colors", palette.link),
              resolveHref: resolveLegalHref,
            })}
          </p>

          <div className="mt-7 flex flex-col gap-6 text-center">
            <button
              type="button"
              className={cn(bannerActionClass, palette.ink, palette.inkHover, palette.ring)}
              onClick={() => save({ functionality: true, analytics: true })}
            >
              {t("legal.cookie.banner.acceptAll")}
            </button>
            <button
              type="button"
              className={cn(bannerActionClass, palette.ink, palette.inkHover, palette.ring)}
              onClick={() => save({ functionality: false, analytics: false })}
            >
              {t("legal.cookie.banner.reject")}
            </button>
            <button
              type="button"
              className={cn(bannerActionClass, palette.link, palette.ring)}
              onClick={() => setIsCenterOpen(true)}
            >
              {t("legal.cookie.banner.manage")}
            </button>
          </div>
        </aside>
      ) : null}

      {isCenterOpen ? (
        <CookiePreferenceCenter
          draft={draft}
          onAcceptAll={() => save({ functionality: true, analytics: true })}
          onChange={setDraft}
          // Dismissing without confirming is not a decision: a first-time
          // visitor drops back to the notice card and is still asked.
          onClose={() => {
            setIsCenterOpen(false);
            setIsNoticeOpen(!hasDecided);
          }}
          onConfirm={() => save(draft)}
          palette={palette}
        />
      ) : null}
    </>
  );
}

function CookiePreferenceCenter({
  draft,
  onAcceptAll,
  onChange,
  onClose,
  onConfirm,
  palette,
}: {
  draft: CookieConsentValue;
  onAcceptAll: () => void;
  onChange: (consent: CookieConsentValue) => void;
  onClose: () => void;
  onConfirm: () => void;
  palette: Palette;
}) {
  const { t } = useTranslate();
  const resolveLegalHref = useLegalHref();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label={t("legal.cookie.center.close")}
        className={cn("fixed inset-0", OVERLAY_LAYER.consentCenterScrim, palette.scrim)}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("legal.cookie.center.title")}
        className={cn(
          "fixed bottom-4 left-4 right-4 flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border",
          OVERLAY_LAYER.consentCenterPanel,
          "sm:left-auto sm:w-[452px] sm:max-h-[min(720px,calc(100vh-2rem))]",
          palette.surface,
          palette.hairline,
          palette.shadow,
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4",
            palette.hairline,
          )}
        >
          <span className={cn("text-[17px] font-bold tracking-[-0.01em]", palette.ink)}>
            {t("legal.cookie.center.brand")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("legal.cookie.center.close")}
            className={cn(
              iconButtonClass,
              palette.icon,
              palette.ring,
              palette.iconBorder,
              "-mr-1 size-8 border",
            )}
          >
            <X className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <h2 className={cn("text-[16px] font-bold leading-[1.35]", palette.ink)}>
            {t("legal.cookie.center.title")}
          </h2>
          <p className={cn("mt-3 text-[13px] leading-[1.65]", palette.ink)}>
            {renderInline(t("legal.cookie.center.body"), {
              linkClassName: cn("underline underline-offset-2 transition-colors", palette.link),
              resolveHref: resolveLegalHref,
            })}
          </p>

          <button
            type="button"
            className={cn(solidButtonClass, palette.solid, palette.ring, "mt-5")}
            onClick={onAcceptAll}
          >
            {t("legal.cookie.banner.acceptAll")}
          </button>

          <h3 className={cn("mt-7 text-[15px] font-bold", palette.ink)}>
            {t("legal.cookie.center.manageTitle")}
          </h3>

          <div className={cn("mt-3 divide-y border", palette.hairline, palette.divide)}>
            <CategoryRow
              description={t("legal.cookie.center.categories.necessary.description")}
              name={t("legal.cookie.center.categories.necessary.name")}
              palette={palette}
              status={t("legal.cookie.center.categories.necessary.status")}
            />
            <CategoryRow
              description={t("legal.cookie.center.categories.functionality.description")}
              name={t("legal.cookie.center.categories.functionality.name")}
              palette={palette}
              toggle={{
                checked: draft.functionality,
                label: t("legal.cookie.center.categories.functionality.status"),
                onChange: (checked) => onChange({ ...draft, functionality: checked }),
              }}
            />
            <CategoryRow
              description={t("legal.cookie.center.categories.analytics.description")}
              name={t("legal.cookie.center.categories.analytics.name")}
              palette={palette}
              toggle={{
                checked: draft.analytics,
                label: t("legal.cookie.center.categories.analytics.status"),
                onChange: (checked) => onChange({ ...draft, analytics: checked }),
              }}
            />
          </div>
        </div>

        <footer className={cn("shrink-0 border-t px-6 py-4", palette.hairline)}>
          <button
            type="button"
            className={cn(solidButtonClass, palette.solid, palette.ring)}
            onClick={onConfirm}
          >
            {t("legal.cookie.center.confirm")}
          </button>
        </footer>
      </div>
    </>
  );
}

function CategoryRow({
  description,
  name,
  palette,
  status,
  toggle,
}: {
  description: string;
  name: string;
  palette: Palette;
  status?: string;
  toggle?: { checked: boolean; label: string; onChange: (checked: boolean) => void };
}) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-label={isOpen ? t("legal.cookie.center.collapse") : t("legal.cookie.center.expand")}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2",
            palette.ring,
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-3 shrink-0 text-center text-[15px] font-medium leading-none",
              palette.muted,
            )}
          >
            {isOpen ? "−" : "+"}
          </span>
          <span className={cn("truncate text-[13.5px] font-bold", palette.ink)}>{name}</span>
        </button>

        {toggle ? (
          <ConsentToggle
            checked={toggle.checked}
            label={`${name} — ${toggle.label}`}
            onChange={toggle.onChange}
            palette={palette}
          />
        ) : (
          <span className={cn("shrink-0 text-[13px] font-semibold", palette.link)}>{status}</span>
        )}
      </div>

      {isOpen ? (
        <p className={cn("px-4 pb-4 text-[13px] leading-[1.65]", palette.muted)}>{description}</p>
      ) : null}
    </div>
  );
}

/**
 * Standalone toggle rather than `components/ui/switch`: that primitive carries
 * its own blue in a `dark:` variant that survives tailwind-merge, and its thumb
 * uses `bg-card`. This one is black/white per the spec and inverts on a dark
 * surface, so the knob stays visible in both states either way.
 */
function ConsentToggle({
  checked,
  label,
  onChange,
  palette,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  palette: Palette;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        palette.ring,
        palette.ringOffset,
        checked ? palette.toggleOn : palette.toggleOff,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0.5 size-5 rounded-full shadow-sm transition-transform",
          palette.knob,
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
