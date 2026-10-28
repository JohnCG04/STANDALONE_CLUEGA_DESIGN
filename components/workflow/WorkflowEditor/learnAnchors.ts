// One module on purpose: lib/learn/guides.test.ts reads this file as text.
import { CANVAS_VIEWPORT } from './constants';

const WORKFLOW_LEARN_TARGETS = {
  projectHeader: 'workflow-canvas.project-header',
  nodesRail: 'workflow-canvas.nodes-rail',
  assetsRail: 'workflow-canvas.assets-rail',
  share: 'workflow-canvas.share',
  tools: 'workflow-canvas.tools',
  flowToolbar: 'workflow-canvas.flow-toolbar',
  policy: 'workflow-canvas.policy',
  shortcuts: 'workflow-canvas.shortcuts',
  runs: 'workflow-canvas.runs',
} as const;

function nthOfExactly(
  root: HTMLElement,
  selector: string,
  expected: number,
  index: number,
): HTMLElement | null {
  const found = root.querySelectorAll<HTMLElement>(selector);
  if (found.length !== expected) return null;
  return found[index] ?? null;
}

const RAIL_GROUP = '.cwf-rail > .cwf-rail__group';
const RAIL_GROUPS = 4;
const RAIL_GROUP_MEDIA = 0;
const RAIL_GROUP_TOOLS = 1;
const RAIL_GROUP_VIEW = 2;
const RAIL_GROUP_SUPPORT = 3;
const RAIL_ICON_BTN = '.cwf-rail__iconbtn';
const MEDIA_ITEMS = 1;
const MEDIA_ASSETS = 0;
const SUPPORT_ITEMS = 5;
const SUPPORT_SHORTCUTS = 2;
const SUPPORT_POLICY = 3;

function railGroup(root: HTMLElement, index: number): HTMLElement | null {
  return nthOfExactly(root, RAIL_GROUP, RAIL_GROUPS, index);
}

/** Each managed anchor paired with the element it belongs on right now. */
function workflowLearnTargets(
  root: HTMLElement,
): readonly (readonly [string, HTMLElement | null])[] {
  const q = (selector: string) => root.querySelector<HTMLElement>(selector);
  const media = railGroup(root, RAIL_GROUP_MEDIA);
  const support = railGroup(root, RAIL_GROUP_SUPPORT);

  return [
    [WORKFLOW_LEARN_TARGETS.projectHeader, q('.cwf-header--left')],
    [WORKFLOW_LEARN_TARGETS.share, q('.cwf-header--right')],
    [WORKFLOW_LEARN_TARGETS.nodesRail, q('.cwf-rail__primary')],
    [
      WORKFLOW_LEARN_TARGETS.assetsRail,
      media && nthOfExactly(media, RAIL_ICON_BTN, MEDIA_ITEMS, MEDIA_ASSETS),
    ],
    [WORKFLOW_LEARN_TARGETS.tools, railGroup(root, RAIL_GROUP_TOOLS)],
    [WORKFLOW_LEARN_TARGETS.flowToolbar, railGroup(root, RAIL_GROUP_VIEW)],
    [
      WORKFLOW_LEARN_TARGETS.shortcuts,
      support &&
        nthOfExactly(support, RAIL_ICON_BTN, SUPPORT_ITEMS, SUPPORT_SHORTCUTS),
    ],
    // Policy lives in the Support menu, so the step points at the rail button that opens it.
    [
      WORKFLOW_LEARN_TARGETS.policy,
      support &&
        nthOfExactly(support, RAIL_ICON_BTN, SUPPORT_ITEMS, SUPPORT_POLICY),
    ],
    [WORKFLOW_LEARN_TARGETS.runs, q('.cwf-runsdock .cwf-rail__iconbtn')],
  ];
}

/** Whether a mutation batch touched the editor chrome, not just the canvas. */
export function touchesChrome(records: MutationRecord[]): boolean {
  return records.some(
    (r) => !(r.target instanceof Element && r.target.closest(CANVAS_VIEWPORT)),
  );
}

export function annotateWorkflowLearnTargets(root: HTMLElement) {
  for (const [anchor, target] of workflowLearnTargets(root)) {
    const selector = `[data-learn="${anchor}"]`;
    if (target?.matches(selector)) continue;
    root
      .querySelectorAll<HTMLElement>(selector)
      .forEach((el) => el.removeAttribute('data-learn'));
    target?.setAttribute('data-learn', anchor);
  }
}
