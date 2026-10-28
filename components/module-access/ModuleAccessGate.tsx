"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle, Mail, MessageCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import {
  clearCdpSessionTokens,
  getCdpAccessToken,
  getModuleAccessState,
  refreshCdpAccessToken,
  type CdpSessionClearReason,
} from "@/lib/cdp";
import {
  CONTACT_CHANNELS,
  type ContactChannelKey,
} from "@/components/contact-sales/contact-channels";
import { useTranslate } from "@/hooks/useTranslate";

type AccessStatus = "checking" | "active" | "inactive";

function ChannelGlyph({ channel }: { channel: ContactChannelKey }) {
  if (channel === "email") {
    return <Mail className="size-4" aria-hidden="true" />;
  }
  if (channel === "linkedin") {
    return <span className="text-[12px] font-bold leading-none">in</span>;
  }
  return <MessageCircle className="size-4" aria-hidden="true" />;
}

function ModuleInactivePanel({
  checking,
  onRetry,
  onSignOut,
}: {
  checking: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslate();
  const cards = CONTACT_CHANNELS.flatMap((channel) =>
    channel.entries.map((entry) => ({
      id: `${channel.key}-${entry.label}`,
      channel: channel.key,
      title: t(
        entry.titleKey ?? `contactSales.contact.channels.${channel.key}`,
      ),
      detail: entry.hintKey ? t(entry.hintKey) : entry.label,
      href: entry.href,
    })),
  );
  const qrCodes = CONTACT_CHANNELS.flatMap((channel) =>
    channel.qr ? [{ key: channel.key, ...channel.qr }] : [],
  );

  return (
    <main className="flex min-h-dvh items-start justify-center bg-[#f6f7f9] px-4 py-8 sm:items-center sm:px-6">
      <section className="w-full max-w-3xl rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
            {t("moduleAccess.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black sm:text-3xl">
            {t("moduleAccess.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-black/55 sm:text-base">
            {t("moduleAccess.subtitle")}
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-black">
            {t("contactSales.contact.channelsLabel")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {cards.map((card) => (
              <a
                key={card.id}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center gap-3 rounded-xl border border-black/[0.09] p-3 pr-9 transition-colors hover:border-black/25"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black text-white">
                  <ChannelGlyph channel={card.channel} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold leading-snug text-black">
                    {card.title}
                  </span>
                  <span
                    className="block truncate text-[12.5px] leading-snug text-black/50"
                    title={card.detail}
                  >
                    {card.detail}
                  </span>
                </span>
                <ArrowUpRight className="absolute right-3 top-3 size-4 text-black/25 group-hover:text-black" />
              </a>
            ))}

            {qrCodes.map((qr) => (
              <figure
                key={qr.key}
                className="col-span-full m-0 flex items-center gap-4 rounded-xl bg-black/[0.03] p-3.5"
              >
                <span className="flex size-[76px] shrink-0 items-center justify-center rounded-lg bg-white">
                  <QRCodeSVG
                    value={qr.value}
                    size={62}
                    level="M"
                    marginSize={0}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    title={t("contactSales.contact.qrHint")}
                  />
                </span>
                <figcaption className="text-[12.5px] leading-snug text-black/55">
                  {t("contactSales.contact.qrHint")}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-black/[0.07] pt-5">
          <button
            type="button"
            onClick={onRetry}
            disabled={checking}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-medium text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
          >
            {checking ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {t("moduleAccess.retry")}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="h-10 rounded-full px-4 text-sm font-medium text-black/55 hover:text-black"
          >
            {t("profileMenu.signOut")}
          </button>
        </div>
      </section>
    </main>
  );
}

export function ModuleAccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccessStatus>("checking");
  const [refreshing, setRefreshing] = useState(false);

  const resolveCurrentAccess = useCallback(() => {
    const access = getModuleAccessState(getCdpAccessToken());
    if (access === "active") {
      setStatus("active");
      return true;
    }
    if (access === "inactive") {
      setStatus("inactive");
      return false;
    }
    return null;
  }, []);

  // The panel's Sign out button is an explicit sign-out; the boot check that
  // finds no token is token loss ("expired"), which keeps what the person
  // connected, such as local folder handles (LF3b-11).
  const signOut = useCallback(async (reason: CdpSessionClearReason = "sign_out") => {
    clearCdpSessionTokens(reason);
    await fetch("/api/app-auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    window.location.assign("/login?from=/flow");
  }, []);

  useEffect(() => {
    if (resolveCurrentAccess() === null) {
      void signOut("expired");
    }
  }, [resolveCurrentAccess, signOut]);

  const retry = useCallback(async () => {
    setRefreshing(true);
    await refreshCdpAccessToken();
    resolveCurrentAccess();
    setRefreshing(false);
  }, [resolveCurrentAccess]);

  if (status === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f6f7f9]">
        <LoaderCircle
          className="size-6 animate-spin text-black/40"
          aria-hidden="true"
        />
      </main>
    );
  }

  if (status === "inactive") {
    return (
      <ModuleInactivePanel
        checking={refreshing}
        onRetry={() => void retry()}
        onSignOut={() => void signOut()}
      />
    );
  }

  return <>{children}</>;
}
