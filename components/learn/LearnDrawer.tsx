"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import { useTranslate } from "@/hooks/useTranslate";
import { cn } from "@/lib/utils";
import {
  LEARN_GUIDES,
  learnGuideI18nBase,
  learnStepI18nBase,
  learnTargetSelector,
} from "@/lib/learn/guides";
import { useLearn } from "./LearnContext";

/**
 * LearnDrawer is the panel a LearnButton opens: a full-height sheet on the
 * right holding the guide's step timeline. Two states:
 *
 * - in progress — progress ring + "n steps left · about m min", then a vertical
 *   timeline. Only the CURRENT step shows its description and a button that
 *   spotlights it on the live page; finished steps get a success check (never
 *   strikethrough) and upcoming ones stay quiet. Every marker shares one 20px
 *   round frame so checks, current and upcoming numbers sit on the same axis,
 *   with the connector running through their centers.
 * - completed — a short congratulation whose primary CTA leads INTO the product
 *   (focuses the guide's first anchor, e.g. the composer), never back into the
 *   tour; restart is demoted behind "review the steps".
 *
 * Follows the app's slide-in panel pattern (components/cluega-ai/SourcesPanel):
 * framer-motion, backdrop click + Escape to close, focus moved into the panel.
 * Steps are only marked done when the user actually walks them in the tour —
 * nothing auto-ticks on load.
 */
export function LearnDrawer() {
  const { t } = useTranslate();
  const reducedMotion = useReducedMotion();
  const { drawerGuideId, closeDrawer, guideProgress, startTour, restartGuide } =
    useLearn();
  const panelRef = useRef<HTMLElement | null>(null);
  // Completed guides can show their timeline again without restarting.
  const [reviewing, setReviewing] = useState(false);

  const guide = drawerGuideId ? LEARN_GUIDES[drawerGuideId] : null;
  const progress = drawerGuideId ? guideProgress(drawerGuideId) : null;

  const doneCount = useMemo(() => {
    if (!guide || !progress) return 0;
    return guide.steps.filter((step) => progress.doneSteps.includes(step.key))
      .length;
  }, [guide, progress]);

  const currentIndex = useMemo(() => {
    if (!guide || !progress) return 0;
    const outstanding = guide.steps.findIndex(
      (step) =>
        !progress.doneSteps.includes(step.key) &&
        !progress.skippedSteps.includes(step.key),
    );
    if (outstanding !== -1) return outstanding;
    const notDone = guide.steps.findIndex(
      (step) => !progress.doneSteps.includes(step.key),
    );
    return notDone === -1 ? guide.steps.length - 1 : notDone;
  }, [guide, progress]);

  useEffect(() => {
    setReviewing(false);
  }, [drawerGuideId]);

  // Escape closes (or backs out of review); focus moves into the panel and
  // returns to the trigger on close.
  useEffect(() => {
    if (!drawerGuideId) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reviewing) setReviewing(false);
      else closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [drawerGuideId, reviewing, closeDrawer]);

  const base = drawerGuideId ? learnGuideI18nBase(drawerGuideId) : "";
  const total = guide?.steps.length ?? 0;
  const remaining = Math.max(total - doneCount, 0);
  // Rough pacing: about half a minute per remaining step.
  const minutes = Math.max(1, Math.ceil(remaining / 2));
  const started = doneCount > 0 || (progress?.lastStepIndex ?? 0) > 0;
  const resumeIndex = Math.min(
    progress?.lastStepIndex ?? 0,
    Math.max(total - 1, 0),
  );
  const showCompleted = Boolean(progress?.completed) && !reviewing;

  const subtitle = `${t("learn.drawer.remaining").replace(
    "{count}",
    String(remaining),
  )} · ${t("learn.drawer.minutes").replace("{count}", String(minutes))}`;

  // Completed CTA: send the user into the product — scroll and focus the
  // guide's first real anchor instead of replaying the tour.
  const ctaKey = `${base}.completedCta`;
  const ctaText = t(ctaKey);
  const ctaLabel = ctaText === ctaKey ? t("learn.drawer.ctaFallback") : ctaText;
  const runCompletedCta = () => {
    if (!drawerGuideId || !guide) return;
    closeDrawer();
    const target = document.querySelector(
      learnTargetSelector(drawerGuideId, guide.steps[0].key),
    );
    if (target instanceof HTMLElement) {
      target.scrollIntoView({
        block: "center",
        behavior: reducedMotion ? "auto" : "smooth",
      });
      const focusable = target.matches("input, textarea, button, [tabindex]")
        ? target
        : target.querySelector<HTMLElement>("textarea, input, button");
      focusable?.focus();
    }
  };

  return (
    <AnimatePresence>
      {drawerGuideId && guide && progress ? (
        <>
          <motion.div
            key="learn-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={closeDrawer}
            className="fixed inset-0 z-[80] bg-neutral-900/30 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.aside
            key="learn-panel"
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, x: reducedMotion ? 0 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : 16 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={t(`${base}.title`)}
            data-slot="learn-drawer"
            // Height follows the content (steps are short) instead of stretching
            // to the viewport, so the panel never trails empty space below the
            // last step. It only scrolls once the text genuinely overflows.
            className="fixed right-3 top-14 z-[85] flex max-h-[calc(100dvh-4.5rem)] w-[min(372px,92vw)] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-[0_24px_64px_-24px_rgba(0,0,0,0.5)] outline-none"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              <ProgressRing done={doneCount} total={total} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("learn.drawer.kicker")}
                </div>
                <h2 className="truncate text-[15px] font-semibold text-foreground">
                  {t(`${base}.title`)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => (reviewing ? setReviewing(false) : closeDrawer())}
                aria-label={t("learn.drawer.close")}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>

            {showCompleted ? (
              <motion.div
                initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
                className="flex flex-col items-center px-6 pb-6 pt-8 text-center"
              >
                <span
                  className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                >
                  <Check className="size-5" strokeWidth={2.5} />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-foreground">
                  {t("learn.drawer.readyTitle")}
                </h3>
                <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-muted-foreground">
                  {t("learn.drawer.readyBody")}
                </p>
                <button
                  type="button"
                  onClick={runCompletedCta}
                  className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                >
                  {ctaLabel}
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </button>
                <div className="mt-4 flex w-full items-center justify-between text-[12px] font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setReviewing(true)}
                    className="rounded underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                  >
                    {t("learn.drawer.review").replace("{count}", String(total))}
                  </button>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="rounded underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                  >
                    {t("learn.drawer.close")}
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                <div className="px-5 pt-4">
                  <p className="text-[12px] font-medium leading-relaxed text-muted-foreground">
                    {t(`${base}.intro`)}
                  </p>
                  {progress.completed ? (
                    <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                      {t("learn.drawer.completed")}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                      {subtitle}
                    </p>
                  )}
                </div>

                <ol className="mt-3 min-h-0 shrink overflow-y-auto px-3 pb-3">
                  {guide.steps.map((step, index) => {
                    const done = progress.doneSteps.includes(step.key);
                    const isCurrent =
                      !progress.completed && index === currentIndex;
                    const stepBase = learnStepI18nBase(drawerGuideId, step.key);
                    const isLast = index === guide.steps.length - 1;
                    return (
                      <li key={step.key}>
                        <div
                          className={cn(
                            "flex gap-3 rounded-xl px-2 py-2",
                            isCurrent && "bg-muted/60",
                          )}
                        >
                          <div className="relative flex w-5 shrink-0 justify-center">
                            {isLast ? null : (
                              <span
                                className="absolute -bottom-2.5 left-1/2 top-6 w-[1.5px] -translate-x-1/2 bg-border"
                                aria-hidden
                              />
                            )}
                            <span
                              className={cn(
                                "relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                                done
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : isCurrent
                                    ? "bg-foreground text-background"
                                    : "border border-border bg-background text-muted-foreground",
                              )}
                              aria-hidden
                            >
                              {done ? (
                                <Check className="size-3" strokeWidth={3} />
                              ) : (
                                index + 1
                              )}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1 pb-1 pt-0.5">
                            <div
                              className={cn(
                                "text-[13px] font-semibold",
                                isCurrent
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {t(`${stepBase}.title`)}
                            </div>
                            {isCurrent ? (
                              <>
                                <p className="mt-1 text-[11px] font-medium leading-relaxed text-muted-foreground">
                                  {t(`${stepBase}.body`)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    startTour(drawerGuideId, index)
                                  }
                                  className="mt-2.5 flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                                >
                                  <Play className="size-3" strokeWidth={2} aria-hidden />
                                  {t("learn.drawer.showMe")}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <div className="border-t border-border/60 px-5 py-4">
                  {reviewing ? (
                    <button
                      type="button"
                      onClick={() => restartGuide(drawerGuideId)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                    >
                      <RotateCcw className="size-4" strokeWidth={2} aria-hidden />
                      {t("learn.drawer.restart")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startTour(drawerGuideId, resumeIndex)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                    >
                      <Play className="size-4" strokeWidth={2} aria-hidden />
                      {started
                        ? t("learn.drawer.continue")
                        : t("learn.drawer.start")}
                    </button>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
                    <button
                      type="button"
                      onClick={closeDrawer}
                      className="rounded underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    >
                      {t("learn.drawer.skip")}
                    </button>
                    <a
                      href={guide.helpHref}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    >
                      {t("learn.drawer.help")}
                      <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
                    </a>
                  </div>
                </div>
              </>
            )}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

// Circular progress indicator with "n/x" inside. Animation honors
// prefers-reduced-motion via the motion-reduce utility.
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 38;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;

  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="stroke-foreground transition-[stroke-dashoffset] duration-[400ms] ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
        {done}/{total}
      </span>
    </span>
  );
}
