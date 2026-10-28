'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { CreditCard, LogOut, Settings, Sun } from 'lucide-react';
import type {
  ProjectMenuConfig,
  WorkflowHeaderConfig,
  WorkflowPublishEdit,
  WorkflowSocialPostConfig,
  WorkflowTemplatePayload,
  WorkflowTheme,
  WorkflowToolPayload,
} from '@dogclaw-ad/workflow';

import { AgentChatPanel, type AgentSeed } from '@dogclaw-ad/workflow-agent';

import '@dogclaw-ad/workflow/styles.css';
import {
  FlowApiError,
  createProject,
  duplicateProject,
} from '@/resources/app/pages/app/components/Flow/services/flow-builder.service';
import { canAuthorPresets } from '@/resources/app/pages/app/components/Flow/services/flow-presets.service';
import { describeFlowAdminError } from '@/resources/app/pages/app/components/Flow/admin/flow-admin.service';
import { pathForFlowAdmin } from '@/lib/flow/flowPresetEdit';
import { invalidateFlowPresetCategories } from '@/resources/app/pages/app/components/Flow/hooks/useFlowPresets';
import { renameErrorMessage } from '@/resources/app/pages/app/components/Flow/helpers';
import { PROJECT_NAME_MAX_LENGTH } from '@/resources/app/pages/app/components/Flow/constants';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  clearFlowAgentParams,
  readFlowAgentParams,
} from '@/lib/flow/flowAgentPrompt';
import { pathForFlowWorkspaceTab } from '@/lib/flow/flowWorkspaceTab';
import { useThemeStore } from '@/lib/stores/useThemeStore';
import { useToastStore } from '@/lib/stores/useToastStore';
import { SignOutConfirmDialog } from '@/components/app-shell/SignOutConfirmDialog';
import { useSettings } from '@/components/settings/context';
import { PageSession } from './components/PageSession';
import { RunAllPagesDialog } from './components/RunAllPagesDialog';
import { WorkflowMissingView } from './components/WorkflowMissingView';
import { VersionHistory } from '../VersionHistory';
import { createWorkflowAgentActions } from '../agent/agentActions';
import {
  republishWorkflowTemplate,
  republishWorkflowTool,
  saveWorkflowTemplate,
  saveWorkflowTool,
  templateSeedOf,
  toolSeedOf,
} from '../shared/workflowProject';
import { useWorkflowTemplateCategories } from './hooks/useWorkflowTemplateCategories';
import { useWorkflowTemplateIndustries } from './hooks/useWorkflowTemplateIndustries';
import { useWorkflowModels } from './hooks/useWorkflowModels';
import { useWorkflowCharacters } from './hooks/useWorkflowCharacters';
import { useWorkflowAssets } from './hooks/useWorkflowAssets';
import { useWorkflowPresetCard } from './hooks/useWorkflowPresetCard';
import { useRunAllPages } from './hooks/useRunAllPages';
import { useWorkflowPages } from './hooks/useWorkflowPages';
import { useWorkflowVariables } from '../variables/hooks/useWorkflowVariables';
import { VariablePickerModal } from '../variables/VariablePickerModal';
import { useRecentProjects } from './hooks/useRecentProjects';
import { useWorkflowBootstrap } from './hooks/useWorkflowBootstrap';
import { localizeStoryboardPresets } from '../actions/storyboard';
import { WorkflowLoadingView } from '../shared/components/WorkflowLoadingView';
import { useLearn } from '@/components/learn';
import { LEARN_GUIDES } from '@/lib/learn/guides';
import { useMediaDetailDownload } from './hooks/useMediaDetailDownload';
import { useTranslate } from '@/hooks/useTranslate';
import {
  DOCUMENT_SESSION,
  EDITOR_LOCALE_BY_LANGUAGE,
  FLOW_LIST_ROUTE,
  HIDE_BUILDER_3D,
  UUID_RE,
} from './constants';
import { editorRoute, mountedSessions, runSummary, sessionKeyOf, sumRuns } from './helpers';
import { annotateWorkflowLearnTargets, touchesChrome } from './learnAnchors';
import type {
  CanvasState,
  LeftPanelKey,
  PageEditorProps,
  PageSessionHandle,
  ProposalOptions,
  WorkflowBootstrapData,
} from './types';

/** React Flow is DOM-only (`ssr: false`) and measures its parent, so its container is sized. */
const WorkflowEditor = dynamic(
  () => import('@dogclaw-ad/workflow').then((mod) => mod.WorkflowEditor),
  {
    ssr: false,
    loading: () => <WorkflowLoadingView />,
  },
);

/** The Post to social node's form; split out, since most workflows never add one. */
const SocialPostNodeBody = dynamic(
  () => import('../SocialPostNode').then((mod) => mod.SocialPostNodeBody),
  { ssr: false },
);
const SOCIAL_POST_NODE: WorkflowSocialPostConfig = { Body: SocialPostNodeBody };

export interface WorkflowEditorClientProps {
  /** `?isActiveParams=true`: a Flow Home prompt waits in sessionStorage, sent exactly once. */
  agentParamsActive?: boolean;
  /** The card the Flow admin's Edit workflow sent us to; its form opens beside the graph. */
  presetEditId?: string;
  /** The tool the Flow admin's Edit tool sent us to; a separate wizard from Edit workflow. */
  toolEditId?: string;
  id?: string;
}

export function WorkflowEditorClient({
  id,
  agentParamsActive,
  presetEditId,
  toolEditId,
}: WorkflowEditorClientProps) {
  const router = useRouter();
  const [editorShell, setEditorShell] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState('');

  const currentUser = useCurrentUser();
  const { t, lang } = useTranslate();

  // Only the preset-author account gets Save Template; for others the button never mounts.
  const canSaveTemplate = canAuthorPresets(currentUser.email);
  // Fetched only for the author account, since no one else sees the dialog.
  const templateCategories = useWorkflowTemplateCategories(canSaveTemplate);
  // Empty without an industry taxonomy, which also means the field is not sent at all.
  const templateIndustries = useWorkflowTemplateIndustries(canSaveTemplate);

  // Edit mode: the Flow admin sent one catalog row (`?preset=` card or `?tool=`) to edit here.
  const editKind: 'template' | 'tool' | null = presetEditId
    ? 'template'
    : toolEditId
      ? 'tool'
      : null;
  const presetCard = useWorkflowPresetCard(
    presetEditId ?? toolEditId,
    canSaveTemplate,
  );
  const pushToast = useToastStore((state) => state.push);

  const locale = EDITOR_LOCALE_BY_LANGUAGE[lang] ?? 'en';

  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const initTheme = useThemeStore((s) => s.init);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    initTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [initTheme]);

  const theme: WorkflowTheme =
    mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(Boolean(agentParamsActive));
  // Seeded after mount: StrictMode's remount aborts a mount-time send. State keeps it stable.
  const [agentSeed, setAgentSeed] = useState<AgentSeed | undefined>(undefined);
  // Reading empties the bag, so read once or StrictMode's second pass overwrites the first.
  const readAgentParams = useRef(false);
  useEffect(() => {
    if (!agentParamsActive || readAgentParams.current) return;
    readAgentParams.current = true;
    const params = readFlowAgentParams();
    // Cleared on read, or a refresh of this same URL would send the prompt again.
    clearFlowAgentParams();
    if (params) setAgentSeed({ prompt: params.prompt });
  }, [agentParamsActive]);
  const { openSettings } = useSettings();

  const { guideProgress, openDrawer, startTour } = useLearn();
  function openWorkflowGuide() {
    const progress = guideProgress('workflow-canvas');
    const total = LEARN_GUIDES['workflow-canvas'].steps.length;

    if (progress.completed) {
      openDrawer('workflow-canvas');
      return;
    }
    startTour('workflow-canvas', Math.min(progress.lastStepIndex, Math.max(total - 1, 0)));
  }

  const validId = id && UUID_RE.test(id) ? id : null;

  useMediaDetailDownload();

  // One gated load for everything the editor opens with; nothing below fetches it again.
  const bootstrap = useWorkflowBootstrap(validId ?? undefined);
  const boot = bootstrap.status === 'ready' ? bootstrap.data : undefined;

  const recentProjects = useRecentProjects(boot?.recentProjects);

  const { models, videoModels, textModels, audioModels } = useWorkflowModels();
  const characters = useWorkflowCharacters();

  const assetLabels = useMemo(
    () => ({
      tabs: {
        creation: t('appChat.flow.assetsPanel.tabs.creation'),
        upload: t('appChat.flow.assetsPanel.tabs.upload'),
        characters: t('appChat.flow.assetsPanel.tabs.characters'),
      },
      empty: t('appChat.flow.assetsPanel.empty'),
      emptyDescription: t('appChat.flow.assetsPanel.emptyDescription'),
      error: t('appChat.flow.assetsPanel.error'),
      errorDescription: t('appChat.flow.assetsPanel.errorDescription'),
    }),
    [t],
  );
  // Localizes the tile labels only; the ids are wire values.
  const storyboardPresets = useMemo(() => localizeStoryboardPresets(t), [t]);

  const { config: assets } = useWorkflowAssets({
    labels: assetLabels,
    // What the "This project" tab narrows to; "All assets" lists the tenant.
    workflowId: validId ?? undefined,
    // `undefined` while the bootstrap loads (no duplicate query); `null` if it failed.
    initialAssets: boot ? (boot.assets ?? null) : undefined,
  });

  const onPageRenameError = useCallback(
    (err: unknown) => pushToast(renameErrorMessage(err, t), 'error'),
    [pushToast, t],
  );
  // The hook owns the Pages list and writes; the canvas swap is ours (the loader and `key`).
  const pages = useWorkflowPages(validId ?? undefined, {
    pages: boot?.pages,
    emptyLabel: t('appChat.flow.pagesPanel.empty'),
    onRenameError: onPageRenameError,
  });
  const { activePageId } = pages;
  const activeKey = sessionKeyOf(activePageId);
  const {
    config: variables,
    pickerOpen: variablePickerOpen,
    closePicker: closeVariablePicker,
    create: saveVariable,
  } = useWorkflowVariables(validId ?? undefined);

  // Every mounted page registers here; the agent, history and Run bar talk to the open one.
  const sessions = useRef(new Map<string, PageSessionHandle>());
  const activeKeyRef = useRef(activeKey);
  useEffect(() => {
    activeKeyRef.current = activeKey;
  });
  const activeSession = useCallback(() => sessions.current.get(activeKeyRef.current), []);
  const registerSession = useCallback((key: string, handle: PageSessionHandle) => {
    sessions.current.set(key, handle);
    return () => {
      if (sessions.current.get(key) === handle) sessions.current.delete(key);
    };
  }, []);

  // A page with a run in flight stays mounted, off screen once the user moves to another one.
  const [busyPages, setBusyPages] = useState<ReadonlySet<string>>(new Set());
  const onBusyChange = useCallback((key: string, busy: boolean) => {
    setBusyPages((prev) => {
      if (prev.has(key) === busy) return prev;
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const [statuses, setStatuses] = useState<Record<string, CanvasState['status']>>({});
  const onStatusChange = useCallback((key: string, status: CanvasState['status']) => {
    setStatuses((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);
  const visibleStatus = statuses[activeKey] ?? 'loading';

  useEffect(() => {
    const root = editorShell;
    if (!root) return;
    let frame = 0;
    const sync = () => annotateWorkflowLearnTargets(root);
    sync();
    const observer = new MutationObserver((records) => {
      // Pan/zoom churns canvas nodes every frame; only chrome changes can move an anchor.
      if (frame || !touchesChrome(records)) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [editorShell, visibleStatus, theme]);

  // Held outside the remounted editor, so a page switch doesn't slam the open drawer shut.
  const [leftPanel, setLeftPanel] = useState<LeftPanelKey | null>(null);

  const runAll = useRunAllPages({ projectId: validId ?? undefined, sessions, activeKey });
  const pageOrder = useMemo(
    () => (pages.config.items ?? []).map((page: { id: string }) => page.id),
    [pages.config.items],
  );
  const mounted = mountedSessions(pageOrder, [activeKey, ...busyPages, runAll.progress?.pageId]);

  const runPage = useCallback(() => {
    const session = activeSession();
    if (!session) return;
    void session.run().then(
      (result) => {
        const toast = runSummary(sumRuns([result]), t);
        if (toast) pushToast(toast.message, toast.tone);
      },
      () => pushToast(t('appChat.flow.run.runFailed'), 'error'),
    );
  }, [activeSession, pushToast, t]);
  const stopPage = useCallback(() => activeSession()?.stop(), [activeSession]);

  // Read at call time, so the agent always works on the page that is on screen.
  const agentActions = useMemo(
    () =>
      createWorkflowAgentActions(
        {
          get current() {
            return activeSession()?.graphApi.current ?? null;
          },
        },
        validId ?? undefined,
        {
          get current() {
            return activeSession()?.run ?? null;
          },
        },
        {
          get current() {
            return activeSession()?.lastProposal.current ?? [];
          },
        },
        locale,
      ),
    [activeSession, validId, locale],
  );
  const onWorkflowProposed = useCallback(
    (document: unknown, opts: ProposalOptions) => activeSession()?.propose(document, opts),
    [activeSession],
  );

  const [historyOpen, setHistoryOpen] = useState(false);

  const restoreVersion = useCallback(
    (version: number) => {
      setHistoryOpen(false);
      void activeSession()?.restore(version);
    },
    [activeSession],
  );

  /** Leave edit mode: back to the admin tab the row was opened from. */
  const exitEditMode = useCallback(() => {
    router.push(pathForFlowAdmin(editKind === 'tool' ? 'tools' : 'presets'));
  }, [router, editKind]);

  // Saving republishes the row by id (status/sort order kept), then adopts the server's reply.
  const { preset: editPreset, replace: adoptEditPreset } = presetCard;
  const hasIndustries = templateIndustries.length > 0;
  const publishEdit = useMemo<WorkflowPublishEdit | undefined>(() => {
    if (!editPreset || !validId) return undefined;
    // The drawer shows the thrown message: the API's as a sentence, the rest as is.
    const readable = (cause: unknown) =>
      cause instanceof FlowApiError ? new Error(describeFlowAdminError(cause, t)) : cause;
    if (editKind === 'template' && !editPreset.is_tool) {
      return {
        kind: 'template',
        seed: templateSeedOf(editPreset),
        onSave: async (template: WorkflowTemplatePayload) => {
          try {
            adoptEditPreset(
              await republishWorkflowTemplate(editPreset, template, validId, hasIndustries),
            );
          } catch (cause) {
            throw readable(cause);
          }
          invalidateFlowPresetCategories();
          pushToast(t('appChat.flowAdmin.presets.saved'), 'info');
        },
        onExit: exitEditMode,
      };
    }
    if (editKind === 'tool' && editPreset.is_tool) {
      return {
        kind: 'tool',
        seed: toolSeedOf(editPreset),
        onSave: async (tool: WorkflowToolPayload) => {
          try {
            adoptEditPreset(await republishWorkflowTool(editPreset, tool, validId));
          } catch (cause) {
            throw readable(cause);
          }
          pushToast(t('appChat.flowAdmin.tools.saved'), 'info');
        },
        onExit: exitEditMode,
      };
    }
    return undefined;
  }, [editPreset, editKind, validId, hasIndustries, adoptEditPreset, exitEditMode, pushToast, t]);

  // Read once per load, not per page switch, which would clobber a title renamed since.
  useEffect(() => {
    if (!boot) return;
    setTitle(boot.project.name);
  }, [boot]);

  // The bootstrap's graph is good for its page's first open; after a switch, pages re-read.
  const [spentBoot, setSpentBoot] = useState<WorkflowBootstrapData | null>(null);
  if (boot && spentBoot !== boot && activePageId && activePageId !== boot.activePageId) {
    setSpentBoot(boot);
  }
  const bootSeed =
    boot && spentBoot !== boot ? { document: boot.document, jobs: boot.jobs } : undefined;

  // No id or a non-UUID id can't be a workflow — redirect, don't fetch.
  useEffect(() => {
    if (!validId) router.replace(FLOW_LIST_ROUTE);
  }, [validId, router]);

  if (bootstrap.status === 'missing') {
    return (
      <main className="h-screen w-full">
        <WorkflowMissingView />
      </main>
    );
  }

  // While loading, hold on the spinner; a paged project waits for its open page too.
  if (!validId || !boot || (boot.pages?.length && !activePageId)) {
    return (
      <main className="h-screen w-full">
        <WorkflowLoadingView />
      </main>
    );
  }

  const projectMenu: ProjectMenuConfig = {
    onBackToHome: () => router.push(pathForFlowWorkspaceTab('project')),
    onNewProject: async () => {
      const project = await createProject('Untitled');
      router.push(editorRoute(project.id));
    },
    // The package fires `onLoadMoreProjects` near the flyout's end while `hasMoreProjects`.
    openProjectItems: recentProjects.items.map((project) => ({
      key: project.id,
      label: project.name,
      onSelect: () => router.push(editorRoute(project.id)),
    })),
    onLoadMoreProjects: recentProjects.loadMore,
    hasMoreProjects: recentProjects.hasMore,
    onDuplicateProject: async () => {
      if (!validId) return;
      const copy = await duplicateProject(validId);
      router.push(editorRoute(copy.id));
    },
    onVersionHistory: () => setHistoryOpen(true),
  };

  const header: WorkflowHeaderConfig = {
    saveState: 'saved',
    titleMaxLength: PROJECT_NAME_MAX_LENGTH,
    logo: (
      <img
        src="/images/cluega-logo/help-center-logo.svg"
        alt=""
        draggable={false}
        className="dark:invert"
      />
    ),
    upgradeBadge: '-50%',
    user: {
      name: currentUser.displayName,
      email: currentUser.email,
    },
    onSettings: () => openSettings(),
    onProfile: () => openSettings('profile'),
    // Usage Analytics is a Flow workspace tab (it only tracks Flow), so this deep-links there.
    onUsageAnalytics: () => router.push(pathForFlowWorkspaceTab('usage')),
    menuItems: [
      {
        key: 'theme',
        label: t('appChat.flow.userMenu.theme'),
        icon: <Sun className="size-4" aria-hidden="true" />,
        onSelect: () => setMode(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        key: 'billing',
        label: t('appChat.flow.userMenu.billing'),
        icon: <CreditCard className="size-4" aria-hidden="true" />,
        onSelect: () => openSettings('billing'),
      },
      {
        key: 'settings',
        label: t('appChat.flow.userMenu.settings'),
        icon: <Settings className="size-4" aria-hidden="true" />,
        onSelect: () => openSettings(),
      },
      {
        key: 'logout',
        label: t('appChat.flow.userMenu.logout'),
        icon: <LogOut className="size-4" aria-hidden="true" />,
        danger: true,
        onSelect: () => setSignOutOpen(true),
      },
    ],
    footerLinks: [
      { label: t('policy.links.termsAndPolicy'), href: '/policy' },
    ],
  };

  // The shared half of the editor's props; each page session adds its graph, actions and runs.
  const renderEditor = ({ editorKey, ...page }: PageEditorProps) => (
    <WorkflowEditor
      key={editorKey}
      {...page}
      assets={assets}
      variables={variables}
      characters={characters}
      className="h-full w-full"
      theme={theme}
      locale={locale}
      header={header}
      projectMenu={projectMenu}
      models={models}
      videoModels={videoModels}
      textModels={textModels}
      audioModels={audioModels}
      storyboardPresets={storyboardPresets}
      socialPost={SOCIAL_POST_NODE}
      title={title}
      onTitleChange={setTitle}
      // The backend has no viewport-only route, so pan/zoom rides the document.
      autosaveViewport
      // Off from the first frame in edit mode, before `publishEdit` takes over.
      isActiveSaveTemplate={canSaveTemplate && editKind === null}
      templateCategories={templateCategories}
      templateIndustries={templateIndustries}
      onHandleSaveTemplate={async (template: WorkflowTemplatePayload) => {
        await saveWorkflowTemplate(
          template,
          validId,
          templateIndustries.length > 0,
        );
        invalidateFlowPresetCategories();
      }}
      // Same gate as templates: POST /flow-presets re-checks it, so a wider one would only 403.
      isActiveSaveTool={canSaveTemplate && editKind === null}
      onHandleSaveTool={async (tool: WorkflowToolPayload) => {
        await saveWorkflowTool(tool, validId);
      }}
      publishEdit={publishEdit}
      videoDuration={{
        min: 4,
        max: 20,
      }}
      isActiveMultiplePages={pages.enabled}
      pages={pages.config}
      defaultLeftPanel={leftPanel}
      onLeftPanelChange={setLeftPanel}
      onOpenOnboarding={openWorkflowGuide}
      // Opens only: the orb hides while the drawer is out, so closing is the drawer's own ✕.
      onOpenAiChat={() => setChatOpen(true)}
      onOpenPolicy={() => window.open('/policy', '_blank', 'noopener,noreferrer')}
      onOpenSettings={() => openSettings()}
      onOpenHelp={() =>
        window.open(
          'https://dev.cluega.com/help/cluega-design',
          '_blank',
          'noopener,noreferrer',
        )
      }
      maxUploadBytes={524_288_000 /* 500 MB */}
      // On the rail: the host owns the graph walk, the editor only shows the commands.
      runCommands={{
        onRunPage: runPage,
        onStopPage: stopPage,
        pageRunning: busyPages.has(activeKey),
        onRunAllPages:
          pages.enabled && pageOrder.length > 1 ? () => void runAll.openDialog() : undefined,
        onStopAllPages: runAll.stop,
        allPages: runAll.progress,
      }}
    />
  );

  return (
    // A flex row: the chat drawer is a sibling that shrinks the canvas, not a sheet over it.
    <main
      ref={setEditorShell}
      // This screen IS the viewport: the collapsed drawer must never scroll the document.
      className="relative flex h-screen w-full overflow-hidden"
      data-learn="workflow-canvas.canvas"
      // globals.css folds the editor's own chat launcher away while this drawer is out.
      data-agent-chat-open={chatOpen}
      data-hide-builder-3d={HIDE_BUILDER_3D}
    >
      {/* `relative` anchors the host upload control over the canvas. */}
      <div className="relative h-full min-w-0 flex-1">
        {mounted.map((key) => {
          const pageId = key === DOCUMENT_SESSION ? null : key;
          return (
            <PageSession
              key={key}
              sessionKey={key}
              projectId={validId}
              pageId={pageId}
              visible={key === activeKey}
              seed={pageId === boot.activePageId ? bootSeed : undefined}
              renderEditor={renderEditor}
              onRegister={registerSession}
              onBusyChange={onBusyChange}
              onStatusChange={onStatusChange}
            />
          );
        })}

        {historyOpen && validId ? (
          <VersionHistory
            projectId={validId}
            pageId={activePageId ?? undefined}
            theme={theme}
            locale={locale}
            storyboardPresets={storyboardPresets}
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreVersion}
          />
        ) : null}
      </div>

      {/* Mounted with the open page's canvas; the seed arrives a render later (see `agentSeed`). */}
      {visibleStatus === 'ready' ? (
        <AgentChatPanel
          actions={agentActions}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          seed={agentSeed}
          theme={theme}
          locale={locale}
          // A static file: ~18KB of SMIL is better cached, and the package doesn't export it.
          brandMark={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/images/ai-chat-orb.svg" alt="" width={40} height={40} />
          }
          // The package's own cool palette: the app's warm tokens suit the canvas, not the chat.
          palette="own"
          onWorkflowProposed={onWorkflowProposed}
        />
      ) : null}

      <SignOutConfirmDialog open={signOutOpen} onOpenChange={setSignOutOpen} />

      <RunAllPagesDialog {...runAll.dialog} onConfirm={() => void runAll.confirm()} />

      {variablePickerOpen && (
        <VariablePickerModal
          projectId={validId ?? undefined}
          onClose={closeVariablePicker}
          onSave={saveVariable}
        />
      )}

    </main>
  );
}
