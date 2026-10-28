"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { LEARN_GUIDES, type LearnGuideId } from "@/lib/learn/guides";
import {
  EMPTY_GUIDE_PROGRESS,
  LEARN_PROGRESS_CHANGED_EVENT,
  type LearnGuideProgress,
  type LearnProgressMap,
  readLearnProgress,
  writeGuideProgress,
} from "@/lib/learn/progress";

export type LearnTourState = {
  guideId: LearnGuideId;
  stepIndex: number;
};

type LearnContextValue = {
  progress: LearnProgressMap;
  guideProgress: (guideId: LearnGuideId) => LearnGuideProgress;
  drawerGuideId: LearnGuideId | null;
  openDrawer: (guideId: LearnGuideId) => void;
  closeDrawer: () => void;
  tour: LearnTourState | null;
  startTour: (guideId: LearnGuideId, stepIndex?: number) => void;
  goToStep: (stepIndex: number) => void;
  markStepDone: (guideId: LearnGuideId, stepKey: string) => void;
  markStepSkipped: (guideId: LearnGuideId, stepKey: string) => void;
  stopTour: (options?: { completed?: boolean; pauseAtIndex?: number }) => void;
  restartGuide: (guideId: LearnGuideId) => void;
};

const LearnContext = createContext<LearnContextValue | null>(null);

export function useLearn(): LearnContextValue {
  const context = useContext(LearnContext);
  if (!context) {
    throw new Error("useLearn must be used within LearnProvider");
  }
  return context;
}

export function useOptionalLearn(): LearnContextValue | null {
  return useContext(LearnContext);
}

export function LearnStateProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearnProgressMap>({});
  const [drawerGuideId, setDrawerGuideId] = useState<LearnGuideId | null>(null);
  const [tour, setTour] = useState<LearnTourState | null>(null);

  useEffect(() => {
    setProgress(readLearnProgress());
    const refresh = () => setProgress(readLearnProgress());
    window.addEventListener(LEARN_PROGRESS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LEARN_PROGRESS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const guideProgress = useCallback(
    (guideId: LearnGuideId): LearnGuideProgress =>
      progress[guideId] ?? EMPTY_GUIDE_PROGRESS,
    [progress],
  );

  const update = useCallback(
    (guideId: LearnGuideId, patch: Partial<LearnGuideProgress>) => {
      setProgress((current) => {
        const next = {
          ...(current[guideId] ?? EMPTY_GUIDE_PROGRESS),
          ...patch,
        };
        return writeGuideProgress(guideId, next);
      });
    },
    [],
  );

  const openDrawer = useCallback(
    (guideId: LearnGuideId) => {
      setDrawerGuideId(guideId);
      update(guideId, { opened: true });
    },
    [update],
  );

  const closeDrawer = useCallback(() => setDrawerGuideId(null), []);

  const startTour = useCallback(
    (guideId: LearnGuideId, stepIndex = 0) => {
      const total = LEARN_GUIDES[guideId].steps.length;
      const index = Math.min(Math.max(stepIndex, 0), Math.max(total - 1, 0));
      setDrawerGuideId(null);
      setTour({ guideId, stepIndex: index });
      update(guideId, { lastStepIndex: index, opened: true });
    },
    [update],
  );

  const goToStep = useCallback(
    (stepIndex: number) => {
      setTour((current) => {
        if (!current) return current;
        update(current.guideId, { lastStepIndex: stepIndex });
        return { ...current, stepIndex };
      });
    },
    [update],
  );

  const markStepDone = useCallback((guideId: LearnGuideId, stepKey: string) => {
    setProgress((current) => {
      const entry = current[guideId] ?? EMPTY_GUIDE_PROGRESS;
      const wasSkipped = entry.skippedSteps.includes(stepKey);
      if (entry.doneSteps.includes(stepKey) && !wasSkipped) return current;
      return writeGuideProgress(guideId, {
        ...entry,
        doneSteps: entry.doneSteps.includes(stepKey)
          ? entry.doneSteps
          : [...entry.doneSteps, stepKey],
        skippedSteps: wasSkipped
          ? entry.skippedSteps.filter((key) => key !== stepKey)
          : entry.skippedSteps,
      });
    });
  }, []);

  const markStepSkipped = useCallback(
    (guideId: LearnGuideId, stepKey: string) => {
      setProgress((current) => {
        const entry = current[guideId] ?? EMPTY_GUIDE_PROGRESS;
        if (
          entry.skippedSteps.includes(stepKey) ||
          entry.doneSteps.includes(stepKey)
        ) {
          return current;
        }
        return writeGuideProgress(guideId, {
          ...entry,
          skippedSteps: [...entry.skippedSteps, stepKey],
        });
      });
    },
    [],
  );

  const stopTour = useCallback(
    (options?: { completed?: boolean; pauseAtIndex?: number }) => {
      setTour((current) => {
        if (current) {
          if (options?.completed) {
            const guide = LEARN_GUIDES[current.guideId];
            update(current.guideId, {
              completed: true,
              lastStepIndex: 0,
              doneSteps: guide.steps.map((step) => step.key),
            });
            setDrawerGuideId(current.guideId);
          } else if (typeof options?.pauseAtIndex === "number") {
            update(current.guideId, { lastStepIndex: options.pauseAtIndex });
            if (options.pauseAtIndex > 0) {
              setDrawerGuideId(current.guideId);
            }
          }
        }
        return null;
      });
    },
    [update],
  );

  const restartGuide = useCallback(
    (guideId: LearnGuideId) => {
      update(guideId, {
        completed: false,
        doneSteps: [],
        skippedSteps: [],
        lastStepIndex: 0,
      });
      startTour(guideId, 0);
    },
    [startTour, update],
  );

  const value = useMemo<LearnContextValue>(
    () => ({
      progress,
      guideProgress,
      drawerGuideId,
      openDrawer,
      closeDrawer,
      tour,
      startTour,
      goToStep,
      markStepDone,
      markStepSkipped,
      stopTour,
      restartGuide,
    }),
    [
      progress,
      guideProgress,
      drawerGuideId,
      openDrawer,
      closeDrawer,
      tour,
      startTour,
      goToStep,
      markStepDone,
      markStepSkipped,
      stopTour,
      restartGuide,
    ],
  );

  return (
    <LearnContext.Provider value={value}>{children}</LearnContext.Provider>
  );
}
