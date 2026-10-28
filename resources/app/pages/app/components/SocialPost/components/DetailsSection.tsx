"use client";

import { Hash, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { TIKTOK_MAX_CAPTION } from "@/lib/social-posts/tiktokRules";

/**
 * The post's text, shaped like TikTok's own Details block: one description
 * field with its tools on the field's own footer.
 *
 * The counter measures the CAPTION only. Hashtags travel as their own wire
 * field and the backend merges them, so counting them here would put the number
 * and `maxLength` at odds — the user would hit a cap the input never enforces.
 *
 * No `@ Mention` control and no Location field: neither exists in the draft the
 * composer sends, and a control that quietly does nothing is worse than none.
 */
export function DetailsSection({
  caption,
  children,
  hashtags,
  onCaptionChange,
  onCycleHashtags,
  onRegenerate,
  onRemoveHashtag,
}: {
  caption: string;
  /** The media / cover picker, when the turn produced more than one output. */
  children?: ReactNode;
  hashtags: readonly string[];
  onCaptionChange: (value: string) => void;
  onCycleHashtags: () => void;
  onRegenerate: () => void;
  onRemoveHashtag: (tag: string) => void;
}) {
  const { t } = useTranslate();

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold text-foreground">
        {t("appChat.socialPost.detailsHeading")}
      </h3>

      <div>
        <label
          htmlFor="social-post-caption"
          className="mb-1.5 block text-[12px] font-semibold text-muted-foreground"
        >
          {t("appChat.socialPost.caption")}
        </label>
        <div className="rounded-xl border border-input bg-background focus-within:border-blue-500/60">
          <Textarea
            id="social-post-caption"
            value={caption}
            maxLength={TIKTOK_MAX_CAPTION}
            placeholder={t("appChat.socialPost.captionPlaceholder")}
            onChange={(event) => onCaptionChange(event.target.value)}
            className="min-h-[112px] resize-none border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-center gap-1 border-t border-border/60 px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="pillCompact"
              onClick={onCycleHashtags}
              title={t("appChat.socialPost.cycleHashtags")}
            >
              <Hash className="size-4" strokeWidth={2} />
              {t("appChat.socialPost.hashtags")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="pillCompact"
              onClick={onRegenerate}
            >
              <Sparkles className="size-4" strokeWidth={2} />
              {t("appChat.socialPost.aiDraft")}
            </Button>
            <span className="ml-auto pr-1 text-[12px] text-muted-foreground tabular-nums">
              {t("appChat.socialPost.charCount")
                .replace("{count}", String(caption.length))
                .replace("{max}", String(TIKTOK_MAX_CAPTION))}
            </span>
          </div>
        </div>

        {hashtags.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onRemoveHashtag(tag)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/70"
              >
                #{tag}
                <X className="size-2.5" strokeWidth={2.5} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  );
}
