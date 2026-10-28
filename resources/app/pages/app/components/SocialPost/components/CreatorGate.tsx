"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import type { CreatorState } from "../types";

/**
 * The TikTok settings are a rendering of the creator's own account options, so
 * none of them can be shown before the live read lands. This gate is what
 * stands in for them meanwhile — and what tells the two failures apart: a
 * connection that died needs reconnecting, a request that failed needs a retry.
 */
export function CreatorGate({
  children,
  creator,
  onRetry,
}: {
  children: ReactNode;
  creator: CreatorState;
  onRetry: () => void;
}) {
  const { t } = useTranslate();

  if (creator.status === "ready") return <>{children}</>;

  if (creator.status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-[12px] text-red-600 dark:text-red-400">
        <span>
          {creator.reconnect
            ? t("appChat.socialPost.creatorReconnect")
            : t("appChat.socialPost.creatorFailed")}
        </span>
        <Button variant="outline" size="pillCompact" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {t("appChat.socialPost.creatorRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {t("appChat.socialPost.creatorLoading")}
    </div>
  );
}
