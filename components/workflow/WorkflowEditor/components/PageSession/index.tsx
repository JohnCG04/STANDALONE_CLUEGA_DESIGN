'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { WorkflowGraphApi, WorkflowRun, WorkflowRunsConfig } from '@dogclaw-ad/workflow';

import {
  getDocument,
  getPageDocument,
  listPageJobs,
  savePageDocument,
  type FlowDocument,
  type FlowJob,
} from '@/resources/app/pages/app/components/Flow/services/flow-builder.service';
import { renameErrorMessage } from '@/resources/app/pages/app/components/Flow/helpers';
import { cancelMediaJob } from '@/lib/ai-agent/mediaJobPolling';
import { cancelJobGroup } from '@/resources/app/pages/app/components/Conversation/apis/video.api';
import { useToastStore } from '@/lib/stores/useToastStore';
import { useTranslate } from '@/hooks/useTranslate';
import { cn } from '@/lib/utils';
import { createWorkflowHostActions } from '../../../actions/hostActions';
import { mergeEdges, planToGraph } from '../../../agent/planToGraph';
import { createLiveJobs } from '../../../executor/liveJobs';
import { nextFrame } from '../../../executor/runGraph';
import { trackSubmits } from '../../../executor/trackLiveJobs';
import type { ActiveRun, RunOptions } from '../../../executor/types';
import { useRunGraph } from '../../../executor/hooks/useRunGraph';
import { applyJobsToDocument, jobsForExistingNodes } from '../../../jobs/applyJobsToGraph';
import { useFlowJobs } from '../../../jobs/hooks/useFlowJobs';
import { useFlowJobWatcher } from '../../../jobs/hooks/useFlowJobWatcher';
import { STOP_CANCEL } from '../../../shared/constants';
import { WorkflowLoadingView } from '../../../shared/components/WorkflowLoadingView';
import { restoreDocumentVersion } from '../../../VersionHistory/restoreVersion';
import {
  APPLY_BRAND_KIT,
  APPLY_GLOW_MIN_MS,
  RUN_SAVE_ATTEMPTS,
  RUN_SAVE_RETRY_MS,
  RUN_WAIT_FRAMES,
  SESSION_POLL_MS,
  SESSION_READY_TIMEOUT_MS,
} from '../../constants';
import { runSummary, sumRuns, toCanvas, wait } from '../../helpers';
import type {
  CanvasState,
  PageEditorProps,
  PageSessionHandle,
  ProposalOptions,
} from '../../types';
import { WorkflowMissingView } from '../WorkflowMissingView';

export interface PageSessionProps {
  sessionKey: string;
  projectId: string;
  /** `null` for a project with no pages: its legacy single document. */
  pageId: string | null;
  /** Off screen (a page still running after a switch) when false. */
  visible: boolean;
  /** The bootstrap's graph for this page; read on mount only, later visits re-read the page. */
  seed?: { document: FlowDocument; jobs?: FlowJob[] };
  /** The shared editor props plus this page's own; the screen owns the editor import. */
  renderEditor: (page: PageEditorProps) => ReactNode;
  /** Returns the unregister; keep it stable. */
  onRegister: (key: string, handle: PageSessionHandle) => () => void;
  onBusyChange: (key: string, busy: boolean) => void;
  onStatusChange: (key: string, status: CanvasState['status']) => void;
}

/** One page's canvas with its own jobs, runs and saves, so it can keep running off screen. */
export function PageSession({
  sessionKey,
  projectId,
  pageId,
  visible,
  seed,
  renderEditor,
  onRegister,
  onBusyChange,
  onStatusChange,
}: PageSessionProps) {
  const { t } = useTranslate();
  const pushToast = useToastStore((state) => state.push);
  const [canvas, setCanvas] = useState<CanvasState>({ status: 'loading' });
  // Latched: a remount (the user came back) must re-read the page, not reuse the bootstrap.
  const [seedOnMount] = useState(seed);

  // The whole-graph run in flight; the ledger stamps its id on every job the run submits.
  const activeRunRef = useRef<ActiveRun | null>(null);
  const ledger = useFlowJobs({ projectId, pageId, activeRun: activeRunRef });

  // The editor's write handle for rehydrated results; `null` around a remount.
  const graphApiRef = useRef<WorkflowGraphApi | null>(null);
  // A ref write is not a render; the epoch lets effects wait for the remounted editor.
  const [graphApiEpoch, setGraphApiEpoch] = useState(0);
  const onGraphApiReady = useCallback((api: WorkflowGraphApi | null) => {
    graphApiRef.current = api;
    if (api) setGraphApiEpoch((n) => n + 1);
  }, []);

  // Jobs still rendering at open keep polling, so results land without a reload.
  const watcher = useFlowJobWatcher({
    ledger,
    graphApi: graphApiRef,
    scope: `${projectId}:${pageId ?? ''}`,
  });

  // Rehydrated rows plus Stop for resumed jobs; the row closes now, not on the next poll.
  const { runsConfig, resumable, markStopped } = ledger;
  const runs = useMemo<WorkflowRunsConfig | undefined>(
    () =>
      runsConfig && {
        ...runsConfig,
        onStopRun: (run: WorkflowRun) => {
          const row = resumable.find((job) => job.job_id === run.id);
          void cancelJobGroup(row?.group_id ?? run.id, STOP_CANCEL).catch((err) =>
            console.error('[workflow] cancelling a resumed job failed', err),
          );
          watcher.stop(run.id);
          markStopped([run.id]);
        },
      },
    [runsConfig, resumable, markStopped, watcher],
  );

  // Catches the in-flight jobs no paused node cancels itself, so Stop cancels them upstream.
  const liveJobs = useMemo(
    () => createLiveJobs((jobId) => cancelMediaJob(jobId, STOP_CANCEL)),
    [],
  );

  // Stable ledger methods only, so `actions` doesn't churn; wrapped to record each job id.
  const { beginSubmit, completeSubmit, stopSubmit } = ledger;
  const jobSubmitter = useMemo(
    () => trackSubmits({ beginSubmit, completeSubmit, stopSubmit }, liveJobs),
    [beginSubmit, completeSubmit, stopSubmit, liveJobs],
  );

  // Per page, so it rides the document's `globalConfig`; jobs read it via a ref at submit.
  const applyBrandKit =
    canvas.status === 'ready' && canvas.globalConfig?.[APPLY_BRAND_KIT] === true;
  const applyBrandKitRef = useRef(applyBrandKit);
  useEffect(() => {
    applyBrandKitRef.current = applyBrandKit;
  });
  const toggleBrandKit = useCallback((enabled: boolean) => {
    setCanvas((prev) =>
      prev.status !== 'ready'
        ? prev
        : {
            ...prev,
            globalConfig: { ...prev.globalConfig, [APPLY_BRAND_KIT]: enabled },
          },
    );
  }, []);

  // A version restore waits on this: a save still in flight would land over the restored graph.
  const lastSaveRef = useRef<Promise<unknown>>(Promise.resolve());

  // Autosave targets this page's document, or the project's own when it has no pages.
  const actions = useMemo(() => {
    const host = createWorkflowHostActions(
      projectId,
      pageId ?? undefined,
      jobSubmitter,
      () => applyBrandKitRef.current,
    );
    const save = host.onAutoSave;
    const rename = host.renameWorkflow;
    if (!save) return host;
    return {
      ...host,
      onAutoSave: (...args: Parameters<typeof save>) => {
        const saving = save(...args);
        lastSaveRef.current = Promise.resolve(saving).catch(() => undefined);
        return saving;
      },
      // The editor only rolls its title back; saying why is the host's job.
      renameWorkflow:
        rename &&
        ((title: string) =>
          Promise.resolve(rename(title)).catch((err: unknown) => {
            pushToast(renameErrorMessage(err, t), 'error');
            throw err;
          })),
    };
  }, [projectId, pageId, jobSubmitter, pushToast, t]);

  // The host walks the graph (the order belongs to the document) through each node's own run.
  const { run: runGraph, stop: stopGraph } = useRunGraph({
    graphApi: graphApiRef,
    liveJobs,
    activeRun: activeRunRef,
  });

  const canvasRef = useRef(canvas);
  useEffect(() => {
    canvasRef.current = canvas;
  });

  // Run all pages calls in before this page has loaded; wait for its cards to be on the canvas.
  const untilReady = useCallback(async () => {
    const deadline = Date.now() + SESSION_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = canvasRef.current;
      if (current.status === 'missing') break;
      const api = graphApiRef.current;
      if (current.status === 'ready' && api && api.getNodes().length >= current.nodes.length) {
        return;
      }
      await wait(SESSION_POLL_MS);
    }
    throw new Error(t('appChat.flow.run.pageNotReady'));
  }, [t]);

  // A page leaves the screen only once its results are saved; the editor's timers die with it.
  const saveResults = useCallback(async () => {
    // Two renders: a run's last writes (and their input stamps) land after they are queued.
    await nextFrame();
    await nextFrame();
    for (let attempt = 0; attempt < RUN_SAVE_ATTEMPTS; attempt += 1) {
      const api = graphApiRef.current;
      if (!api?.flushSave || (await api.flushSave())) return;
      await wait(RUN_SAVE_RETRY_MS);
    }
    console.error('[workflow] a finished run could not be saved');
  }, []);

  // A count, not a flag: an agent auto-run may overlap a pressed one.
  const [runCount, setRunCount] = useState(0);
  const busy = runCount > 0;
  const run = useCallback(
    async (opts?: RunOptions) => {
      setRunCount((n) => n + 1);
      try {
        await untilReady();
        const result = await runGraph(opts);
        await saveResults();
        return result;
      } finally {
        setRunCount((n) => n - 1);
      }
    },
    [untilReady, runGraph, saveResults],
  );

  // Only the picked cards; a failure is already drawn on its card, the toast says how it ended.
  const onRunNodes = useCallback(
    (nodeIds: string[]) => {
      void run({ only: nodeIds }).then(
        (result) => {
          const toast = runSummary(sumRuns([result]), t);
          if (toast) pushToast(toast.message, toast.tone);
        },
        () => pushToast(t('appChat.flow.run.runFailed'), 'error'),
      );
    },
    [run, pushToast, t],
  );

  // A ref, not state: clearing state re-ran the effect, whose cleanup cancelled the wait.
  const runWhenReady = useRef<{
    /** The api epoch at proposal time; the remount must take us past it. */
    after: number;
    /** The ids that must be on the canvas before the run means anything. */
    ids: string[];
    /** False for Compose: armed anyway, since this wait also ends the apply glow. */
    run: boolean;
  } | null>(null);

  // Applying is otherwise silent; the glow ties the agent's answer to the canvas.
  const [applying, setApplying] = useState(false);
  // When the current apply started, for `APPLY_GLOW_MIN_MS`.
  const appliedAt = useRef(0);

  // Read at run time: a new `run` identity mid-wait would re-run the effect and cancel it.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // For the panel's Run button: `runWhenReady` is consumed on auto-run and Compose never fires.
  const lastProposal = useRef<readonly string[]>([]);

  // Bumped only by a newer proposal or unmount; dev remounts bump the epoch twice.
  const runToken = useRef(0);
  useEffect(
    () => () => {
      runToken.current += 1;
    },
    [],
  );
  const [graphEpoch, setGraphEpoch] = useState(0);

  /** Put a saved version back as this page's document and remount the editor on it. */
  const restore = useCallback(
    async (version: number) => {
      // Unmount first: the editor's pending autosave timers die with it.
      setCanvas({ status: 'loading' });
      // Then wait out a save in flight, and any conflict retry it chains after itself.
      let pending: Promise<unknown>;
      do {
        pending = lastSaveRef.current;
        await pending;
      } while (pending !== lastSaveRef.current);
      try {
        setCanvas(toCanvas(await restoreDocumentVersion(projectId, pageId ?? undefined, version)));
        pushToast(
          t('appChat.flow.versions.restored').replace('{version}', String(version)),
          'info',
        );
      } catch (err) {
        console.error('[workflow] restoring a version failed', err);
        pushToast(t('appChat.flow.versions.restoreFailed'), 'error');
        const current = await (
          pageId ? getPageDocument(projectId, pageId) : getDocument(projectId)
        ).catch(() => null);
        setCanvas(current ? toCanvas(current) : { status: 'missing' });
      }
      setGraphEpoch((n) => n + 1);
    },
    [projectId, pageId, pushToast, t],
  );

  useEffect(() => {
    const want = runWhenReady.current;
    if (!want) return;

    // Until a newer api epoch, this is the OLD editor, which does not hold the proposal.
    if (graphApiEpoch <= want.after) {
      return;
    }

    // Consumed now, not after the wait, so a give-up can't stay armed for a later remount.
    runWhenReady.current = null;

    const token = (runToken.current += 1);
    const stale = () => runToken.current !== token;
    void (async () => {
      // The handle arrives before React Flow seeds its store, so poll for the nodes.
      let ready = false;
      for (let frame = 0; frame < RUN_WAIT_FRAMES; frame += 1) {
        if (stale()) return;
        const api = graphApiRef.current;
        if (api && want.ids.every((id) => api.getNode(id))) {
          ready = true;
          break;
        }
        await nextFrame();
      }
      if (stale()) return;
      if (!ready) {
        // The canvas never took it: nothing will run, so drop the glow.
        setApplying(false);
        return;
      }

      // One more frame: a `loading` status written while seeding is overwritten by the seed.
      await nextFrame();
      if (stale()) return;

      // Glow held to its floor, dropped before the run; when stale, a newer apply owns it.
      const held = Date.now() - appliedAt.current;
      if (held < APPLY_GLOW_MIN_MS) await wait(APPLY_GLOW_MIN_MS - held);
      if (stale()) return;
      setApplying(false);
      if (!want.run) return;
      // Only what this turn made or changed; failures are already drawn on their nodes.
      await runRef.current({ only: want.ids }).catch(() => {});
    })();
    // `graphApiEpoch` alone and no cancelling cleanup: either would kill the pending run.
  }, [graphApiEpoch]);

  // Appended, never replacing: `planToGraph` renames colliding ids and offsets the new block.
  const propose = useCallback(
    (document: unknown, { runMode, planMode }: ProposalOptions) => {
      const api = graphApiRef.current;
      if (!api) return;

      // The COMMITTED graph, not the mounted document: the user may have edited it since.
      const existing = api.getNodes() as unknown as Node[];
      const { nodes, edges, patches } = planToGraph(
        document as Parameters<typeof planToGraph>[0],
        existing,
      );

      // Nothing changed, so keep the viewport; edges count, since a plan can be wires only.
      if (!nodes.length && !patches.length && !edges.length) return;

      // After the bail: a proposal that changes nothing must not light the canvas up.
      appliedAt.current = Date.now();
      setApplying(true);

      const existingEdges = api.getEdges() as unknown as Edge[];
      const byId = new Map(patches.map((p) => [p.id, p]));

      // Patched into the remount's state: a store-only `updateNodeData` is lost on remount.
      const patched = existing.map((node) => {
        const patch = byId.get(node.id);
        if (!patch) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...patch.data,
            // The executor skips nodes holding a result, so clear it or the change never re-runs.
            result: null,
            status: "idle",
            error: undefined,
          },
        };
      });

      // Separate writes, pure updater: React may run an updater twice; the epoch bumps once.
      setCanvas((prev) =>
        prev.status !== 'ready'
          ? prev
          : {
              ...prev,
              nodes: [...patched, ...nodes],
              // Layered: a wire into a port the proposal also wires replaces it (`mergeEdges`).
              edges: mergeEdges(existingEdges, edges),
            },
      );
      setGraphEpoch((n) => n + 1);
      // Auto-runs only for Auto Generate outside plan mode; Compose leaves the nodes to Run page.
      lastProposal.current = [
        ...nodes.map((n) => n.id),
        ...patches.map((p) => p.id),
      ];
      runWhenReady.current = {
        after: graphApiEpoch,
        ids: [...nodes.map((n) => n.id), ...patches.map((p) => p.id)],
        run: runMode === "autogen" && planMode !== "plan",
      };
    },
    [graphApiEpoch],
  );

  // The handle is registered once; its methods read the latest callbacks at call time.
  const latest = useRef({ stop: stopGraph, propose, restore });
  useEffect(() => {
    latest.current = { stop: stopGraph, propose, restore };
  });
  const handle = useMemo<PageSessionHandle>(
    () => ({
      graphApi: graphApiRef,
      lastProposal,
      run: (opts) => runRef.current(opts),
      stop: () => latest.current.stop(),
      propose: (document, opts) => latest.current.propose(document, opts),
      restore: (version) => latest.current.restore(version),
    }),
    [],
  );
  useEffect(() => onRegister(sessionKey, handle), [onRegister, sessionKey, handle]);

  useEffect(() => {
    onBusyChange(sessionKey, busy);
  }, [onBusyChange, sessionKey, busy]);
  useEffect(() => () => onBusyChange(sessionKey, false), [onBusyChange, sessionKey]);

  useEffect(() => {
    onStatusChange(sessionKey, canvas.status);
  }, [onStatusChange, sessionKey, canvas.status]);
  // A later visit mounts a fresh session, which must not inherit this one's `ready`.
  useEffect(() => () => onStatusChange(sessionKey, 'loading'), [onStatusChange, sessionKey]);

  const { adopt: adoptJobs, markApplied: markJobsApplied } = ledger;

  useEffect(() => {
    let cancelled = false;

    // Fold in finished-but-undrawn jobs, persisted before `applied_at` closes; mount regardless.
    const openCanvas = async (document: FlowDocument, jobs?: FlowJob[]) => {
      const activeJobs = jobs ? jobsForExistingNodes(document, jobs) : [];
      adoptJobs(activeJobs);

      let doc = document;
      const { document: merged, appliedJobIds } = applyJobsToDocument(
        document,
        activeJobs,
      );
      if (appliedJobIds.length > 0 && pageId) {
        doc = merged;
        try {
          const saved = await savePageDocument(
            projectId,
            pageId,
            {
              nodes: merged.nodes ?? [],
              edges: merged.edges ?? [],
              groups: merged.groups ?? [],
              viewport: merged.viewport,
              global_config: merged.global_config,
            },
            merged.version,
          );
          if (cancelled) return;
          doc = { ...merged, version: saved.version };
          markJobsApplied(appliedJobIds);
        } catch (err) {
          // Render anyway: with applied_at left open the next visit re-folds them.
          console.error('[workflow] persisting rehydrated job results failed', err);
        }
      }

      if (!cancelled) setCanvas(toCanvas(doc));
    };

    // The bootstrap's page is already in hand; only a later visit costs a request.
    if (seedOnMount) {
      void openCanvas(seedOnMount.document, seedOnMount.jobs);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const [document, jobs] = await Promise.all([
          pageId ? getPageDocument(projectId, pageId) : getDocument(projectId),
          // Best-effort like the bootstrap: a page opens fine without its ledger.
          pageId
            ? listPageJobs(projectId, pageId).catch((err) => {
                console.error('[workflow] page jobs read failed', err);
                return undefined;
              })
            : Promise.resolve(undefined),
        ]);
        if (!cancelled) await openCanvas(document, jobs);
      } catch {
        // Say so and offer the way back, instead of replacing the route silently.
        if (!cancelled) setCanvas({ status: 'missing' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, pageId, seedOnMount, adoptJobs, markJobsApplied]);

  return (
    // Hidden, not unmounted: `invisible` keeps the size React Flow measures, `inert` the input.
    <div className={cn('absolute inset-0', !visible && 'invisible')} inert={!visible}>
      {canvas.status === 'ready' ? (
        <>
          {renderEditor({
            editorKey: String(graphEpoch),
            actions,
            defaultNodes: canvas.nodes,
            defaultEdges: canvas.edges,
            defaultViewport: canvas.viewport,
            documentVersion: canvas.version,
            globalConfig: canvas.globalConfig,
            brandKit: { enabled: applyBrandKit, onToggle: toggleBrandKit },
            onGraphApiReady,
            runs,
            background: !visible,
            onRunNodes,
          })}
          {/* A ring, not a veil: it must not hide the change it announces; pointers pass through. */}
          {applying ? <div aria-hidden className="workflow-apply-glow" /> : null}
        </>
      ) : canvas.status === 'missing' ? (
        <WorkflowMissingView />
      ) : (
        <WorkflowLoadingView />
      )}
    </div>
  );
}
