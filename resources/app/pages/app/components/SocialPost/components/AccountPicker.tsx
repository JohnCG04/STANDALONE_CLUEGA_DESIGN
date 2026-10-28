"use client";

import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import type { SocialAccount } from "@/lib/social-posts/accounts";
import type { SocialPlatform } from "@/lib/social-posts/client";
import { socialPlatformLabel } from "@/lib/social-posts/platforms";
import { cn } from "@/lib/utils";
import { accountRowState, needsCreatorRead, platformIconUrl } from "../helpers";
import type { SelectedSocialAccount } from "../store";
import type { CreatorState } from "../types";

/**
 * Step 2's account list — every account of the chosen platforms, with the
 * platform's mark, the account's avatar, its @handle and its live status.
 *
 * This is where the connection state has to be shown, because it is where the
 * choice is made: an account whose grant TikTok has invalidated gets no
 * checkbox at all, only a reconnect button. The alternative — offering it and
 * failing at publish — spends the post to deliver the same information.
 *
 * "Loading" keeps the checkbox but disables it. Ticking an account whose
 * options are still unknown would fold the shared settings (privacy levels,
 * interaction switches, duration cap) from an answer that has not arrived.
 */
export function AccountPicker({
  accounts,
  connecting,
  failed,
  loading,
  onConnect,
  onReload,
  onRetryRead,
  onToggle,
  platforms,
  readyCount,
  reads,
  selectedKeys,
}: {
  accounts: readonly SocialAccount[];
  connecting: boolean;
  failed: boolean;
  loading: boolean;
  onConnect: (platform: SocialPlatform) => void;
  onReload: () => void;
  /** Re-runs the live creator reads — the way out of a "can't post right now" row. */
  onRetryRead: () => void;
  onToggle: (account: SelectedSocialAccount) => void;
  /** The platforms step 1 picked, in table order. One with no account at all
   *  gets its own Connect — with two platforms picked, the other one's rows
   *  must not hide that this one has nothing to post as. */
  platforms: readonly SocialPlatform[];
  /** How many SELECTED accounts have answered their live read. */
  readyCount: number;
  /** Each account's live creator read, keyed by the id it is addressed by. */
  reads: Record<string, CreatorState>;
  selectedKeys: readonly string[];
}) {
  const { t } = useTranslate();
  const selectedCount = selectedKeys.length;
  const unconnected = loading
    ? []
    : platforms.filter((platform) => !accounts.some((account) => account.platform === platform));
  const connectButtons = unconnected.map((platform) => (
    <Button
      key={platform}
      variant="outline"
      size="pillCompact"
      disabled={connecting}
      onClick={() => onConnect(platform)}
    >
      {connecting ? <Loader2 className="size-3 animate-spin" /> : null}
      {t("appChat.socialPost.connectPlatform").replace(
        "{platform}",
        socialPlatformLabel(platform),
      )}
    </Button>
  ));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-foreground">
          {t("appChat.socialPost.accountsHeading")}
        </h3>
        {selectedCount > 0 ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {/* While the reads are landing, the count alone would claim more is
                ready than is: the settings below fold from the ones that
                answered. */}
            {readyCount < selectedCount
              ? t("appChat.socialPost.creatorProgress")
                  .replace("{ready}", String(readyCount))
                  .replace("{total}", String(selectedCount))
              : t("appChat.socialPost.accountCount").replace(
                  "{count}",
                  String(selectedCount),
                )}
          </span>
        ) : null}
        {/* The list is never cached — a grant can die while the panel is open —
            so a re-read belongs next to it, and it doubles as the way back from
            a reconnect round trip. */}
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          aria-label={t("appChat.socialPost.accountsRefresh")}
          title={t("appChat.socialPost.accountsRefresh")}
          className="ml-auto flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("size-3.5", loading && "animate-spin")}
            strokeWidth={1.75}
          />
        </button>
      </div>

      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-[12px] text-red-600 dark:text-red-400">
          <span>{t("appChat.socialPost.accountsFailed")}</span>
          <Button variant="outline" size="pillCompact" onClick={onReload}>
            <RefreshCw className="size-3.5" />
            {t("appChat.socialPost.creatorRetry")}
          </Button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-700 dark:text-amber-400">
          <span>
            {loading
              ? t("appChat.socialPost.accountsLoading")
              : t("appChat.socialPost.noAccounts")}
          </span>
          {connectButtons.length > 0 ? (
            <div className="flex flex-wrap gap-2">{connectButtons}</div>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            {accounts.map((account) => (
              <AccountPickerRow
                key={account.accountKey}
                account={account}
                connecting={connecting}
                onConnect={onConnect}
                onRetryRead={onRetryRead}
                onToggle={onToggle}
                read={reads[account.accountId]}
                selected={selectedKeys.includes(account.accountKey)}
              />
            ))}
          </ul>
          {connectButtons.length > 0 ? (
            <div className="flex flex-wrap gap-2">{connectButtons}</div>
          ) : null}
        </>
      )}
    </section>
  );
}

function AccountPickerRow({
  account,
  connecting,
  onConnect,
  onRetryRead,
  onToggle,
  read,
  selected,
}: {
  account: SocialAccount;
  connecting: boolean;
  onConnect: (platform: SocialPlatform) => void;
  onRetryRead: () => void;
  onToggle: (account: SelectedSocialAccount) => void;
  read: CreatorState | undefined;
  selected: boolean;
}) {
  const { t } = useTranslate();
  const state = accountRowState(account, read);
  const iconUrl = platformIconUrl(account.platform);
  const platformLabel = socialPlatformLabel(account.platform);
  const broken = state === "reconnect" || state === "unusable" || state === "cannotPost";
  // TikTok requires the receiving creator's nickname on screen; the list's name is the fallback.
  const name =
    (read?.status === "ready" && read.info.nickname) ||
    account.displayName ||
    t("appChat.socialPost.subjectFallback");

  // What this row is: the @handle once the live read lands (the only place
  // TikTok exposes it), the failure otherwise. `unavailable_reason` is the
  // server's own wording where it had one — more specific than anything
  // invented here. An account with no live read (a Facebook Page) is named by
  // its platform once it is usable.
  const subtitle =
    read?.status === "ready"
      ? read.info.username
        ? `@${read.info.username}`
        : platformLabel
      : state === "selectable" && !needsCreatorRead(account)
        ? platformLabel
      : state === "reconnect"
        ? (account.unavailableReason ??
          t("appChat.socialPost.accountNeedsReconnect"))
        : state === "cannotPost"
          ? (read?.status === "error" && read.message) ||
            t("appChat.socialPost.creatorCannotPost")
          : state === "unusable"
            ? t("appChat.socialPost.accountReadFailed")
            : t("appChat.socialPost.creatorLoading");

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0",
        broken && "bg-muted/30",
      )}
    >
      <div className="relative shrink-0">
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote avatar
          <img loading="lazy" decoding="async"
            src={account.avatarUrl}
            alt=""
            className={cn(
              "size-8 rounded-full object-cover",
              broken && "opacity-50 grayscale",
            )}
          />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
            {(account.displayName || platformLabel).slice(0, 1).toUpperCase()}
          </span>
        )}
        {/* The platform mark rides the avatar rather than taking its own
            column: with two platforms in one list, the row has to say which
            without pushing the name off the line. */}
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- static brand mark
          <img loading="lazy" decoding="async"
            src={iconUrl}
            alt={platformLabel}
            title={platformLabel}
            className="absolute -right-1 -bottom-1 size-4 rounded-[4px] border border-card bg-card object-contain"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-foreground">
          {name}
        </div>
        <div
          className={cn(
            "flex items-center gap-1 truncate text-[11px]",
            broken
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {state === "loading" ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : broken ? (
            <AlertCircle className="size-3 shrink-0" />
          ) : null}
          <span className="truncate">{subtitle}</span>
        </div>
      </div>

      {/* An account that cannot publish gets NO checkbox — only the action that
          would make it publishable. Offering the tick and refusing the post
          later is the same answer, delivered after the user committed to it. */}
      {state === "cannotPost" ? (
        <Button type="button" variant="outline" size="pillCompact" onClick={onRetryRead}>
          <RefreshCw className="size-3.5" />
          {t("appChat.socialPost.creatorRetry")}
        </Button>
      ) : broken ? (
        <Button
          type="button"
          variant="outline"
          size="pillCompact"
          disabled={connecting}
          onClick={() => onConnect(account.platform)}
        >
          {connecting ? <Loader2 className="size-3 animate-spin" /> : null}
          {t("appChat.socialPost.reconnect")}
        </Button>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={account.displayName || platformLabel}
          disabled={state !== "selectable"}
          onClick={() =>
            onToggle({
              accountKey: account.accountKey,
              platform: account.platform,
              displayName: account.displayName,
              ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
              accountId: account.accountId,
            })
          }
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-[4px] border",
            selected ? "border-blue-500 bg-blue-500 text-white" : "border-border",
            state !== "selectable" && "cursor-not-allowed opacity-50",
          )}
        >
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </button>
      )}
    </li>
  );
}
