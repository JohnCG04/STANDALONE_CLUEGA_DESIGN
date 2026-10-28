"use client";

import { Check, Loader2 } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import {
  accountsOfPlatform,
  type SocialAccount,
  type SocialPlatformAvailability,
} from "@/lib/social-posts/accounts";
import type { SocialPlatform } from "@/lib/social-posts/client";
import { facebookMediaFits } from "@/lib/social-posts/facebookRules";
import { SOCIAL_PLATFORMS } from "@/lib/social-posts/platforms";
import { tiktokMediaShape } from "@/lib/social-posts/tiktokRules";
import { cn } from "@/lib/utils";
import type { AssetRef } from "@/lib/creative/assetRef";

/** The platforms the panel can connect, with what their connect grants. */
const CONNECT_HINT_KEYS: Partial<Record<SocialPlatform, string>> = {
  tiktok: "appChat.socialPost.tiktokConnectHint",
  facebook: "appChat.socialPost.facebookConnectHint",
};

/**
 * Step 1 — WHICH PLATFORMS. Only that.
 *
 * The accounts belong to step 2, where each one can carry its avatar, its live
 * status and its own reconnect button. Putting them here would mean either a
 * flat list mixing platforms, or a nested picker inside a tile that also acts
 * as a toggle — and it would fire TikTok's uncacheable creator-info reads
 * before the user has said where they are posting.
 *
 * What the tiles DO say about accounts is the count: "2 accounts · 1 ready" is
 * what makes Continue's outcome predictable, and a platform with nothing ready
 * still lets the user through — reconnecting is offered in step 2, per account,
 * which is the only place it can be aimed at the right one.
 */
export function PlatformStep({
  accounts,
  connecting,
  failed,
  loading,
  onConnect,
  onReload,
  onToggle,
  platforms,
  selectedAssets,
  selectedPlatforms,
}: {
  accounts: readonly SocialAccount[];
  connecting: boolean;
  failed: boolean;
  loading: boolean;
  onConnect: (platform: SocialPlatform) => void;
  onReload: () => void;
  onToggle: (platform: SocialPlatform) => void;
  platforms: readonly SocialPlatformAvailability[];
  selectedAssets: readonly AssetRef[];
  selectedPlatforms: readonly SocialPlatform[];
}) {
  const { t } = useTranslate();
  const shape = tiktokMediaShape(selectedAssets);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          {t("appChat.socialPost.stepPlatformsHeading")}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("appChat.socialPost.stepPlatformsHint")}
        </p>
      </div>

      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-[12px] text-red-600 dark:text-red-400">
          <span>{t("appChat.socialPost.accountsFailed")}</span>
          <Button variant="outline" size="pillCompact" onClick={onReload}>
            {t("appChat.socialPost.creatorRetry")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const isSelected = selectedPlatforms.includes(platform.id);
          const availability = platforms.find((row) => row.platform === platform.id);
          // The server is the authority on whether a platform can publish at
          // all; the static `comingSoon` flag is the fallback for a backend too
          // old to say. Otherwise the UI keeps claiming "coming soon" on the
          // day the adapter ships.
          const unavailableReason = availability
            ? availability.canPublish
              ? null
              : (availability.reason ?? t("appChat.socialPost.comingSoon"))
            : platform.comingSoon
              ? t("appChat.socialPost.comingSoon")
              : null;
          // TikTok has exactly two post types — one video, or a photo carousel;
          // a Facebook post carries one photo or one video. A selection that
          // breaks its platform's rule would be rejected at create, so the tile
          // says so instead of failing later.
          const shapeProblem =
            platform.id === "tiktok" && shape.kind === "invalid"
              ? t(`appChat.socialPost.shape.${shape.problem}`)
              : platform.id === "facebook" && !facebookMediaFits(selectedAssets.length)
                ? t("appChat.socialPost.shape.facebookSingle")
                : null;
          const disabled = unavailableReason !== null || shapeProblem !== null;

          const rows = accountsOfPlatform(accounts, platform.id);
          const ready = rows.filter((account) => account.canPublish).length;
          const status = unavailableReason
            ? t("appChat.socialPost.comingSoon")
            : (shapeProblem ??
              (loading
                ? t("appChat.socialPost.accountsLoading")
                : rows.length === 0
                  ? t("appChat.socialPost.noAccounts")
                  : t("appChat.socialPost.platformAccountsSummary")
                      .replace("{count}", String(rows.length))
                      .replace("{ready}", String(ready))));

          return (
            <div
              key={platform.id}
              className={cn(
                "relative flex items-center justify-between gap-3 rounded-[12px] border px-3 py-3 text-left transition-colors",
                isSelected
                  ? "border-blue-500/80 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                  : "border-border hover:bg-muted/40",
                disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
              )}
            >
              {/* The whole tile toggles — as a stretched button rather than one
                  wrapping the row, so Connect can sit in the same tile without
                  nesting a button inside a button. */}
              <button
                type="button"
                disabled={disabled}
                aria-disabled={disabled}
                aria-pressed={isSelected}
                aria-label={platform.label}
                title={shapeProblem ?? unavailableReason ?? undefined}
                onClick={() => onToggle(platform.id)}
                className={cn(
                  "absolute inset-0 rounded-[12px]",
                  disabled && "cursor-not-allowed",
                )}
              />
              <div className="pointer-events-none relative min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    {platform.label}
                  </span>
                  {unavailableReason ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                      {t("appChat.socialPost.comingSoon")}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-[11px] font-medium",
                    !disabled && ready > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {status}
                </div>
              </div>
              <div className="pointer-events-none relative flex shrink-0 items-center gap-2">
                {/* Connect is offered here only when there is nothing to pick in
                    step 2 at all. Once an account exists, reconnecting and
                    adding belong to the account list, where they can be aimed
                    at one row. */}
                {!disabled && CONNECT_HINT_KEYS[platform.id] && !loading && rows.length === 0 ? (
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => onConnect(platform.id)}
                    title={t(CONNECT_HINT_KEYS[platform.id] ?? "")}
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
                  >
                    {connecting ? <Loader2 className="size-3 animate-spin" /> : null}
                    {t("appChat.socialPost.connect")}
                  </button>
                ) : null}
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-border",
                    unavailableReason && "opacity-0",
                  )}
                >
                  {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
