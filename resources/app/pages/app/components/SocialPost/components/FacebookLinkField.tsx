"use client";

import { useTranslate } from "@/hooks/useTranslate";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The optional destination of a Facebook post. With a link, the photo goes out
 * as a link post — the image becomes its preview and it carries Facebook's CTA
 * button; without one it is a plain photo or video post.
 */
export function FacebookLinkField({
  invalid,
  onChange,
  value,
}: {
  invalid: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslate();

  return (
    <div>
      <label
        htmlFor="social-post-facebook-link"
        className="mb-1.5 block text-[13px] font-semibold text-foreground"
      >
        {t("appChat.socialPost.facebookLinkLabel")}
      </label>
      <Input
        id="social-post-facebook-link"
        type="url"
        inputMode="url"
        value={value}
        placeholder={t("appChat.socialPost.facebookLinkPlaceholder")}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl text-[13px]"
      />
      <p
        className={cn(
          "mt-1.5 text-[11px] leading-relaxed",
          invalid ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
        )}
      >
        {invalid
          ? t("appChat.socialPost.facebookLinkInvalid")
          : t("appChat.socialPost.facebookLinkHint")}
      </p>
    </div>
  );
}
