"use client";

import { useEffect, useMemo } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  ACTIONS,
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
  type TooltipRenderProps,
} from "react-joyride";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import {
  LEARN_GUIDES,
  learnStepActivateKeys,
  learnStepHelpHref,
  learnStepI18nBase,
  learnStepSelector,
  learnTargetSelector,
} from "@/lib/learn/guides";
import { useLearn } from "./LearnContext";

export function LearnTour() {
  const { tour } = useLearn();
  if (!tour) return null;
  // Remount per guide so joyride's internal state resets between guides.
  return <LearnTourRunner key={tour.guideId} />;
}

function LearnTourRunner() {
  const { t } = useTranslate();
  const { tour, goToStep, markStepDone, markStepSkipped, stopTour } =
    useLearn();

  const guideId = tour?.guideId ?? null;
  const guide = guideId ? LEARN_GUIDES[guideId] : null;

  const steps = useMemo<Step[]>(() => {
    if (!guide || !guideId) return [];
    return guide.steps.map((step, index) => ({
      target: learnStepSelector(guideId, index),
      title: t(`${learnStepI18nBase(guideId, step.key)}.title`),
      content: t(`${learnStepI18nBase(guideId, step.key)}.body`),
      placement: step.placement,
      skipBeacon: true,
    }));
  }, [guide, guideId, t]);

  const stepIndex = tour?.stepIndex ?? 0;
  useEffect(() => {
    if (!guideId) return;
    const keys = learnStepActivateKeys(guideId, stepIndex);
    if (keys.length === 0) return;
    let cancelled = false;
    const timers = keys.map((key, order) =>
      window.setTimeout(() => {
        if (cancelled) return;
        document
          .querySelector<HTMLElement>(learnTargetSelector(guideId, key))
          ?.click();
      }, order * 150),
    );
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [guideId, stepIndex]);

  if (!tour || !guide || !guideId || steps.length === 0) return null;

  const lastIndex = steps.length - 1;

  function handleEvent(data: EventData) {
    if (!tour || !guide || !guideId) return;
    const { type, action, index, status } = data;

    if (type === EVENTS.TARGET_NOT_FOUND) {
      markStepSkipped(guideId, guide.steps[index].key);
      const next = action === ACTIONS.PREV ? index - 1 : index + 1;
      if (next < 0) {
        stopTour({ pauseAtIndex: 0 });
      } else if (next > lastIndex) {
        stopTour({ completed: true });
      } else {
        goToStep(next);
      }
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT || action === ACTIONS.COMPLETE) {
        markStepDone(guideId, guide.steps[index].key);
        if (index >= lastIndex) {
          stopTour({ completed: true });
        } else {
          goToStep(index + 1);
        }
        return;
      }
      if (action === ACTIONS.PREV) {
        goToStep(Math.max(index - 1, 0));
        return;
      }
      if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
        // Pause: keep the current step as the resume point for "Continue".
        stopTour({ pauseAtIndex: index });
        return;
      }
    }

    if (type === EVENTS.TOUR_STATUS || type === EVENTS.TOUR_END) {
      if (status === STATUS.FINISHED) stopTour({ completed: true });
      else if (status === STATUS.SKIPPED) stopTour({ pauseAtIndex: tour.stepIndex });
    }
  }

  return (
    <Joyride
      steps={steps}
      run
      continuous
      stepIndex={tour.stepIndex}
      scrollToFirstStep
      onEvent={handleEvent}
      tooltipComponent={LearnTooltip}
      floatingOptions={{ hideArrow: true }}
      locale={{
        back: t("learn.tour.back"),
        close: t("learn.tour.close"),
        last: t("learn.tour.done"),
        next: t("learn.tour.next"),
        skip: t("learn.tour.close"),
      }}
      options={{
        buttons: ["back", "primary"],
        skipBeacon: true,
        // Escape pauses the tour (handled as CLOSE above).
        dismissKeyAction: "close",
        overlayClickAction: false,
        spotlightPadding: 6,
        spotlightRadius: 10,
        scrollOffset: 96,
        targetWaitTimeout: 2000,
        overlayColor: "rgba(10, 10, 10, 0.55)",
        zIndex: 10000,
        width: 340,
      }}
    />
  );
}

/**
 * Design-system tooltip for the Learn tour: Cluega tokens (popover surface,
 * border, muted text) so it follows light/dark mode, with a step counter and an
 * optional link to the matching help-center article.
 */
function LearnTooltip({
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  index,
  isLastStep,
  size,
  step,
}: TooltipRenderProps) {
  const { t } = useTranslate();
  const { tour } = useLearn();
  const helpHref = tour ? learnStepHelpHref(tour.guideId, index) : null;

  return (
    <div
      {...tooltipProps}
      className="w-[340px] max-w-[92vw] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-[0_18px_46px_-18px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {index + 1}/{size}
        </div>
        <button
          {...closeProps}
          type="button"
          className="-m-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      </div>
      {step.title ? (
        <div className="mt-1 text-[14px] font-semibold text-foreground">
          {step.title}
        </div>
      ) : null}
      <div className="mt-1.5 text-[12px] font-medium leading-relaxed text-muted-foreground">
        {step.content}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {helpHref ? (
            <a
              href={helpHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("learn.tour.helpLink")}
              <ExternalLink className="size-3" strokeWidth={2} />
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            {...backProps}
            type="button"
            className={cn(
              "flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              index === 0 && "invisible",
            )}
          >
            {t("learn.tour.back")}
          </button>
          <button
            {...primaryProps}
            type="button"
            className="flex h-8 items-center rounded-full bg-foreground px-4 text-[12px] font-semibold text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          >
            {isLastStep ? t("learn.tour.done") : t("learn.tour.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
