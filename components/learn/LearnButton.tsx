"use client";

import { GraduationCap } from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import { LEARN_GUIDES, type LearnGuideId } from "@/lib/learn/guides";
import { useLearn } from "./LearnContext";

// Visual variants matching the host toolbars (all page headers use raw
// buttons + Tailwind rather than the shared <Button>, so LearnButton mirrors
// the exact classes of its neighbors per page family):
// - "toolbar": bordered h-9 buttons (Account View / Marketing Dashboard rows)
// - "pill":    rounded-full bg-neutral-100 (AbilityPageHeader actions)
// - "ghost":   quiet compact button (Pulse header, dense toolbars)
export type LearnButtonAppearance = "toolbar" | "pill" | "ghost";

const APPEARANCE_CLASSES: Record<LearnButtonAppearance, string> = {
  toolbar:
    "flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[12px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900",
  pill: "flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
  ghost:
    "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
};

type LearnButtonProps = {
  guideId: LearnGuideId;
  appearance?: LearnButtonAppearance;
  className?: string;
  labelClassName?: string;
};

/**
 * LearnButton is the shared entry point of a page's Learn guide. Until the
 * user opens the guide once it reads "Learn · 0/x" with a soft attention dot;
 * afterwards it collapses to just "Learn".
 *
 * Clicking runs the step guide straight away — the spotlight opens on the
 * current step (resuming where the user left off) instead of asking them to
 * press start in a panel first. Once the guide is completed the click opens
 * the summary panel instead, which is where "review the steps" and restart
 * live.
 */
export function LearnButton({
  guideId,
  appearance = "toolbar",
  className,
  labelClassName,
}: LearnButtonProps) {
  const { t } = useTranslate();
  const { guideProgress, openDrawer, startTour } = useLearn();

  const guide = LEARN_GUIDES[guideId];
  const progress = guideProgress(guideId);
  const total = guide.steps.length;
  const done = guide.steps.filter((step) =>
    progress.doneSteps.includes(step.key),
  ).length;

  function handleClick() {
    if (progress.completed) {
      openDrawer(guideId);
      return;
    }
    // Resume at the saved step so closing the spotlight never loses progress.
    startTour(guideId, Math.min(progress.lastStepIndex, Math.max(total - 1, 0)));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${t("learn.button.aria")}: ${t(`learn.guides.${guideId}.title`)}`}
      aria-haspopup="dialog"
      data-slot="learn-button"
      data-learn-guide={guideId}
      className={cn(
        "relative shrink-0",
        APPEARANCE_CLASSES[appearance],
        className,
      )}
    >
      <GraduationCap
        className={cn(appearance === "pill" ? "h-4 w-4" : "h-3.5 w-3.5")}
        strokeWidth={1.75}
      />
      <span className={cn("whitespace-nowrap", labelClassName)}>
        {t("learn.button.label")}
      </span>
      {!progress.opened ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex size-2"
          aria-hidden
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
          <span className="relative inline-flex size-2 rounded-full border border-background bg-foreground" />
        </span>
      ) : null}
    </button>
  );
}
