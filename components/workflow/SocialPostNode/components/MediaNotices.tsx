"use client";

import type { SocialPostNodeInput } from "@dogclaw-ad/workflow";

import { useTranslate } from "@/hooks/useTranslate";

import { INPUT_NOTICE_KEYS } from "../constants";

/** Why a wired input can't go out yet, one line each; or what to wire when nothing is. */
export function MediaNotices({ inputs }: { inputs: readonly SocialPostNodeInput[] }) {
  const { t } = useTranslate();
  if (inputs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
        {t("appChat.socialPost.node.mediaEmpty")}
      </p>
    );
  }
  const waiting = inputs.flatMap((input) =>
    input.status === "ready" ? [] : [{ input, key: INPUT_NOTICE_KEYS[input.status] }],
  );
  if (waiting.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {waiting.map(({ input, key }) => (
        <li
          key={input.handle}
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
        >
          {t(key).replace(
            "{name}",
            input.sourceLabel || t("appChat.socialPost.node.sourceFallback"),
          )}
        </li>
      ))}
    </ul>
  );
}
