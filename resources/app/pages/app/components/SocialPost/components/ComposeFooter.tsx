"use client";

import { ChevronLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useTranslate } from "@/hooks/useTranslate";
import { HoverTooltip } from "@/resources/app/components/ui/HoverTooltip";
import type { ComposeController } from "../types";
import { DeclarationNotice } from "./DeclarationNotice";

/** Step 2's footer: TikTok's consent line right above Back, Discard and Post. */
export function ComposeFooter({
  controller,
  blockedReason,
  onBack,
  onDiscard,
  onSubmit,
  submitLabel,
}: {
  controller: ComposeController;
  /** Why Post is disabled, shown as its tooltip. */
  blockedReason: string | null;
  onBack: () => void;
  onDiscard: () => void;
  /** Defaults to posting at once; a workflow node asks before posting a second time. */
  onSubmit?: () => void;
  /** Defaults to "Post now", or "Schedule" with a time picked. */
  submitLabel?: string;
}) {
  const { t } = useTranslate();
  const { canSubmit, scheduleAt, settings, submit, submitting, tiktokSelected } = controller;

  return (
    <div className="flex flex-col gap-2">
      {/* TikTok's consent line; a Facebook-only post has nothing to declare. */}
      {tiktokSelected ? <DeclarationNotice settings={settings} /> : null}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="pillCompact" onClick={onBack}>
          <ChevronLeft className="size-4" strokeWidth={2} />
          {t("appChat.socialPost.backStep")}
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="pillCompact" onClick={onDiscard}>
            {t("appChat.socialPost.discard")}
          </Button>
          <HoverTooltip content={blockedReason}>
            <Button
              type="button"
              variant="primary"
              size="pillCompact"
              disabled={!canSubmit || submitting}
              onClick={onSubmit ?? (() => void submit())}
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {submitLabel ??
                (scheduleAt ? t("appChat.socialPost.schedule") : t("appChat.socialPost.postNow"))}
            </Button>
          </HoverTooltip>
        </div>
      </div>
    </div>
  );
}
