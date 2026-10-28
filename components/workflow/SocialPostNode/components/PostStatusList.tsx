"use client";

import { useTranslate } from "@/hooks/useTranslate";
import type { SocialPostRecord } from "@/lib/social-posts/client";
import { socialPlatformLabel } from "@/lib/social-posts/platforms";
import { PostStatusIcon } from "@/resources/app/pages/app/components/SocialPost/components/PostStatusIcon";
import { formatPostTime } from "@/resources/app/pages/app/components/SocialPost/helpers";

/** Each post this node sent, one row per account, newest first. */
export function PostStatusList({ records }: { records: readonly SocialPostRecord[] }) {
  const { t } = useTranslate();
  if (records.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-foreground">
        {t("appChat.socialPost.statusTitle")}
      </h3>
      <ul className="flex flex-col overflow-hidden rounded-xl border border-border">
        {records.flatMap((record) =>
          record.targets.map((target) => {
            const platform = socialPlatformLabel(target.platform);
            return (
              <li
                // Two accounts of one platform can share a post, so the account is in the key.
                key={`${record.id}:${target.platform}:${target.accountKey ?? ""}`}
                className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
              >
                <PostStatusIcon status={target.status} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span className="truncate font-semibold text-foreground">
                      {target.accountName || platform}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {t(`appChat.socialPost.status.${target.status}`)}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {target.status === "scheduled" && record.scheduleAt
                      ? `${t("appChat.socialPost.scheduledFor")} ${formatPostTime(record.scheduleAt)}`
                      : formatPostTime(record.createdAt)}
                  </span>
                  {target.error ? (
                    <span className="text-red-600 dark:text-red-400">{target.error}</span>
                  ) : null}
                  {target.sentToInbox ? (
                    <span className="text-muted-foreground">{t("appChat.socialPost.sentToInbox")}</span>
                  ) : null}
                  {target.link ? (
                    <a
                      href={target.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {t("appChat.socialPost.viewPost").replace("{platform}", platform)}
                    </a>
                  ) : null}
                </div>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
