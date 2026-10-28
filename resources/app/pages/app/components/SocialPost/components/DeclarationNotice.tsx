"use client";

import type { ReactNode } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import {
  TIKTOK_BRANDED_CONTENT_POLICY_URL,
  TIKTOK_MUSIC_USAGE_URL,
  tiktokDeclarationKey,
  type TikTokPostSettings,
} from "@/lib/social-posts/tiktokRules";

/**
 * The consent line TikTok requires right where the poster commits: the music
 * confirmation always, the Branded Content Policy once a paid partnership is
 * declared. Kept beside Post so clicking it IS the express consent.
 */
export function DeclarationNotice({ settings }: { settings: TikTokPostSettings }) {
  const { t } = useTranslate();
  const template = t(`appChat.socialPost.declaration.${tiktokDeclarationKey(settings)}`);
  const links: Record<string, ReactNode> = {
    music: (
      <PolicyLink key="music" href={TIKTOK_MUSIC_USAGE_URL}>
        {t("appChat.socialPost.musicUsageLink")}
      </PolicyLink>
    ),
    policy: (
      <PolicyLink key="policy" href={TIKTOK_BRANDED_CONTENT_POLICY_URL}>
        {t("appChat.socialPost.brandedContentPolicyLink")}
      </PolicyLink>
    ),
  };

  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      {template.split(/(\{\w+\})/g).map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return name && name in links ? links[name] : part;
      })}
    </p>
  );
}

function PolicyLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  );
}
