export type LearnPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'auto'
  | 'center';

export type LearnStepConfig = {
  key: string;
  placement: LearnPlacement;
  helpHref: string;
  activate?: readonly string[];
  anchor?: string;
};

export type LearnGuideConfig = {
  route: string;
  helpHref: string;
  steps: readonly LearnStepConfig[];
};

export const LEARN_GUIDES = {
  'flow-home': {
    route: '/flow',
    helpHref: '/help/company/protech-chat',
    steps: [
      {
        key: 'workspace-switcher',
        placement: 'right',
        helpHref: '/help/company/about-cluega-ai#section-3',
      },
      {
        key: 'sidebar-create',
        placement: 'right',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'sidebar-main-nav',
        placement: 'right',
        helpHref: '/help/company/about-cluega-ai#section-3',
      },
      {
        key: 'sidebar-favorites',
        placement: 'right',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'sidebar-recent',
        placement: 'right',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'sidebar-workspace',
        placement: 'right',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'sidebar-footer',
        placement: 'right',
        helpHref: '/help/settings/settings-general',
      },
      {
        key: 'create-new',
        placement: 'bottom',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'techniques',
        placement: 'bottom',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'techniques-search',
        placement: 'bottom',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'view-all-techniques',
        placement: 'bottom',
        helpHref: '/help/company/protech-chat',
      },
      {
        key: 'technique-gallery',
        placement: 'right',
        helpHref: '/help/company/protech-chat',
      },
    ],
  },
  flow: {
    route: '/flow',
    helpHref: '/help/capabilities/workflow',
    steps: [
      {
        key: 'toolbar',
        placement: 'bottom',
        helpHref: '/help/capabilities/workflow#section-4',
      },
      {
        key: 'create-new',
        placement: 'auto',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'projects',
        placement: 'auto',
        helpHref: '/help/capabilities/workflow#section-4',
      },
    ],
  },
  'workflow-canvas': {
    route: '/workflow/[id]',
    helpHref: '/help/capabilities/workflow',
    steps: [
      {
        key: 'project-header',
        placement: 'bottom',
        helpHref: '/help/capabilities/workflow#section-4',
      },
      {
        key: 'nodes-rail',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'assets-rail',
        placement: 'right',
        // "Upload" is section 1 — no fragment needed.
        helpHref: '/help/artifacts/artifacts-upload',
      },
      {
        key: 'canvas',
        placement: 'center',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'tools',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'flow-toolbar',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'policy',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-5',
      },
      {
        key: 'shortcuts',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-3',
      },
      {
        key: 'runs',
        placement: 'right',
        helpHref: '/help/capabilities/workflow#section-4',
      },
      {
        key: 'share',
        placement: 'bottom',
        helpHref: '/help/capabilities/workflow#section-4',
      },
    ],
  },
} as const satisfies Record<string, LearnGuideConfig>;

export type LearnGuideId = keyof typeof LEARN_GUIDES;

export function isLearnGuideId(value: string): value is LearnGuideId {
  return value in LEARN_GUIDES;
}

// Value for the `data-learn` attribute on a step's target element.
export function learnAnchor(guideId: LearnGuideId, stepKey: string): string {
  return `${guideId}.${stepKey}`;
}

// CSS selector matching a step's target element.
export function learnTargetSelector(
  guideId: LearnGuideId,
  stepKey: string,
): string {
  return `[data-learn="${learnAnchor(guideId, stepKey)}"]`;
}

// Help article for a step, falling back to the guide-level article. Typed via
// LearnGuideConfig so optional `helpHref` reads cleanly off the literal registry.
// May carry a `#section-N` fragment — see the header note.
export function learnStepHelpHref(
  guideId: LearnGuideId,
  stepIndex: number,
): string {
  const guide: LearnGuideConfig = LEARN_GUIDES[guideId];
  return guide.steps[stepIndex]?.helpHref ?? guide.helpHref;
}

export function learnStepSelector(
  guideId: LearnGuideId,
  stepIndex: number,
): string {
  const guide: LearnGuideConfig = LEARN_GUIDES[guideId];
  const step = guide.steps[stepIndex];
  if (!step) return '';
  return step.anchor
    ? `[data-learn="${step.anchor}"]`
    : learnTargetSelector(guideId, step.key);
}

export function learnStepActivateKeys(
  guideId: LearnGuideId,
  stepIndex: number,
): readonly string[] {
  const guide: LearnGuideConfig = LEARN_GUIDES[guideId];
  return guide.steps[stepIndex]?.activate ?? [];
}

// i18n path helpers so every consumer builds keys the same way.
export function learnGuideI18nBase(guideId: LearnGuideId): string {
  return `learn.guides.${guideId}`;
}

export function learnStepI18nBase(
  guideId: LearnGuideId,
  stepKey: string,
): string {
  return `learn.guides.${guideId}.steps.${stepKey}`;
}
