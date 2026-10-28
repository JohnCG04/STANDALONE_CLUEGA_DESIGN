"use client";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import type { CreatorState } from "../types";

/** Says up front when a post won't go live (draft or moderation); TikTok's read decides. */
export function PublishModeNotice({
  creator,
  className,
}: {
  creator: CreatorState;
  className?: string;
}) {
  const { t } = useTranslate();
  const info = creator.status === "ready" ? creator.info : null;
  // A live or mock deployment needs no caveat; a Facebook-only post has no read at all.
  if (!info || info.publishMode === "live" || info.publishMode === "mock") return null;
  return (
    <p
      className={cn(
        "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      {info.publishMode === "draft"
        ? t("appChat.socialPost.draftModeNotice")
        : t("appChat.socialPost.moderationNotice")}
    </p>
  );
}
