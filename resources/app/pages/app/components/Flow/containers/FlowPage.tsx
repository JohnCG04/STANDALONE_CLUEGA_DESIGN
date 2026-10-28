'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FolderPlus, SquareSlash, Star } from 'lucide-react';
import type { AgentDraft } from '@dogclaw-ad/workflow-agent';

import { LearnButton } from '@/components/learn';
import { useCdpUserId } from '@/hooks/useCdpUserId';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTranslate } from '@/hooks/useTranslate';
import { prewarmWorkflowModels } from '@/components/workflow/WorkflowEditor/hooks/useWorkflowModels';
import {
  pathForWorkflowEditor,
  type FlowAgentParams,
} from '@/lib/flow/flowAgentPrompt';
import {
  FLOW_FAVORITES_PARAM,
  flowFavoritesOnlyFromParam,
  pathForFlowProjects,
} from '@/lib/flow/flowFavorites';
import { presetText } from '@/lib/flow/presetText';
import {
  flowWorkspaceTabFromParam,
  pathForFlowWorkspaceTab,
} from '@/lib/flow/flowWorkspaceTab';
import { useToastStore } from '@/lib/stores/useToastStore';
import { cn } from '@/lib/utils';

import {
  CreateProjectCard,
  CreateProjectRow,
} from '../components/CreateProjectCard';
import { DeleteFlowProjectDialog } from '../components/DeleteFlowProjectDialog';
import { FlowEmptyState } from '../components/FlowEmptyState';
import { FlowPageShell } from '../components/FlowPageShell';
import type { FlowFavoriteLabels } from '../components/FlowFavoriteStar';
import { PaginationBar } from '../components/PaginationBar';
import { ProjectCard } from '../components/ProjectCard';
import { ProjectGridSkeleton } from '../components/ProjectGridSkeleton';
import { ProjectListToolbar } from '../components/ProjectListToolbar';
import { ProjectRow } from '../components/ProjectRow';
import { PROJECT_GRID_CLASS, PROJECT_NAME_MAX_LENGTH } from '../constants';
import { isValidProjectName, renameErrorMessage, toViewModel } from '../helpers';
import { FlowHome } from '../home';
import { useFlowProjects } from '../hooks/useFlowProjects';
import { useProjectViewMode } from '../hooks/useProjectViewMode';
import type { FlowApiError } from '../services/flow-builder.service';
import type { PresetLocalizedText } from '../services/flow-presets.service';
import type { MenuLabels, WorkflowProject, WorkspaceTab } from '../types';
import { FlowSWRProvider } from '../providers/FlowSWRProvider';
import { UsageAnalyticsPage } from '../usage-analytics';

/**
 * A workflow with a published template/tool refuses to delete
 * (`409 flow_project_in_use`, `details.presets: [{name, is_tool}]`) — name the
 * linked entries so the user knows what to remove first, mirroring Products'
 * `describeError` for `product_in_use`. Falls back to a generic message for
 * every other failure (network, 500, …), which the dialog already shows.
 */
function describeFlowProjectDeleteError(
  err: FlowApiError | null,
  lang: Parameters<typeof presetText>[1],
  t: (key: string) => string,
): string | undefined {
  if (!err || err.code !== 'flow_project_in_use') return undefined;
  const details = err.details as
    | { presets?: { name?: PresetLocalizedText | string; is_tool?: boolean }[] }
    | undefined;
  const names = (details?.presets ?? [])
    .map((preset) => presetText(preset.name, lang))
    .filter((name): name is string => Boolean(name));
  if (names.length > 0) {
    return t('appChat.flow.deleteDialog.linkedWarning').replace(
      '{presets}',
      names.join(', '),
    );
  }
  return t('appChat.flow.deleteDialog.linkedWarningUnnamed');
}

/**
 * The Flow workspace. Wrapped by the exported FlowPage below, which is where
 * this subtree's SWR cache is mounted.
 */
const FlowWorkspace = () => {
  const { t, lang } = useTranslate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  // The creator-only star needs the user's ID, which the profile does not carry.
  const currentUserId = useCdpUserId();
  const urlTab = flowWorkspaceTabFromParam(searchParams?.get('tab') ?? null);
  // Like the tab, the favorites filter lives in the URL (`?favorites=1`) so the
  // sidebar's "View all favorites" can link to it and a refresh keeps it.
  const favoritesOnly = flowFavoritesOnlyFromParam(
    searchParams?.get(FLOW_FAVORITES_PARAM) ?? null,
  );

  const {
    projects,
    pagination,
    isLoading,
    isRefetching,
    error,
    query,
    setQuery,
    sort,
    setSort,
    pageNo,
    setPageNo,
    refresh,
    create,
    duplicate,
    rename,
    remove,
    removeError,
    setFavorite,
  } = useFlowProjects({
    favoritesOnly,
    active: urlTab === 'project',
  });

  const [viewMode, pickViewMode] = useProjectViewMode();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Delete asks first. The card the user picked from the "..." menu (null = no
  // dialog), whether its DELETE is in flight, and whether the last attempt
  // failed — kept so the dialog can say so instead of the card just reappearing.
  const [deleteTarget, setDeleteTarget] = useState<WorkflowProject | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const justNow = t('appChat.flow.justNow');
  const author = useMemo(
    () => ({
      initials: currentUser.initials,
      displayName: currentUser.displayName,
    }),
    [currentUser.initials, currentUser.displayName],
  );
  const visibleProjects = useMemo(
    () =>
      projects.map((project) =>
        toViewModel(project, lang, justNow, author, currentUserId),
      ),
    [projects, lang, justNow, author, currentUserId],
  );

  const isSearching = query.trim().length > 0;
  const isFiltering = isSearching || favoritesOnly;
  const hasResults = visibleProjects.length > 0;

  const favoriteLabels: FlowFavoriteLabels = {
    add: t('appChat.flow.favorites.add'),
    remove: t('appChat.flow.favorites.remove'),
    favorited: t('appChat.flow.favorites.favorited'),
  };
  const menuLabels: MenuLabels = {
    open: t('appChat.flow.menu.open'),
    rename: t('appChat.flow.menu.rename'),
    duplicate: t('appChat.flow.menu.duplicate'),
    delete: t('appChat.flow.menu.delete'),
    addFavorite: favoriteLabels.add,
    removeFavorite: favoriteLabels.remove,
  };
  const totalPages = pagination?.total_pages ?? 1;

  // The list is one page of a server-paginated result set; without this the UI
  // could only ever show the first `limit` projects. Paging keeps the reading
  // position at the top, since the pager sits under the last card.
  const scrollRef = useRef<HTMLElement | null>(null);
  const goToPage = (next: number) => {
    if (next < 1 || next > totalPages || next === pageNo) return;
    setPageNo(next);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load the workflow detail by id: navigate to the editor route for the
  // project, which fetches GET /projects/:id/document to hydrate the canvas.
  // `agentParams` is what the Flow Home launcher collected; passing it parks the
  // bag in sessionStorage and raises the URL's flag, which is how the chat
  // drawer inside the editor opens on it (lib/flow/flowAgentPrompt.ts).
  const openEditor = (id: string, agentParams?: FlowAgentParams) => {
    // Safety net in case the mount prewarm hasn't finished (or failed a catalog):
    // ensure the fetch is in flight before we land on the editor route.
    void prewarmWorkflowModels(queryClient);
    router.push(pathForWorkflowEditor(id, agentParams));
  };

  // The favorites filter is URL state (see `favoritesOnly`), so it is switched
  // the way the tabs are: a `replace`, no new history entry, no scroll jump.
  const setFavoritesOnly = (next: boolean) => {
    if (next === favoritesOnly) return;
    router.replace(pathForFlowProjects(next), { scroll: false });
  };

  const clearFilters = () => {
    setQuery('');
    setSort('recent');
    setFavoritesOnly(false);
  };

  const handleToggleFavorite = (project: WorkflowProject) => {
    void setFavorite(project.id, !project.favorite);
  };

  const handleCreate = async () => {
    const project = await create(t('appChat.flow.untitled'));
    if (project) openEditor(project.id);
  };

  // Flow Home's agent launcher: the outside surface collects a prompt, and the
  // host is what turns it into somewhere to work — mint the project, then open
  // it with the launcher's parameters handed over through sessionStorage.
  // Throwing (rather than returning) on failure is the contract `AgentLanding`
  // reads to restore the typed prompt and say so; `create` reports failure as
  // null and has already surfaced its own error.
  const handleStartWithAgent = async (draft: AgentDraft) => {
    const project = await create(t('appChat.flow.untitled'));
    if (!project) throw new Error("flow: creating the agent's project failed");
    openEditor(project.id, { prompt: draft.prompt });
  };

  const handleDuplicate = (id: string) => {
    void duplicate(id);
  };

  // "Delete" in the card menu only opens the confirm dialog; the request goes
  // out from `confirmDelete`. The project is a hard delete with no restore, so
  // one click on a 140px-wide menu item must not be enough.
  const handleDelete = (project: WorkflowProject) => {
    setDeleteFailed(false);
    setDeleteTarget(project);
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteFailed(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteFailed(false);
    try {
      // `remove` is optimistic and rolls the card back itself on failure; it
      // reports the outcome as a boolean rather than throwing.
      const deleted = await remove(deleteTarget.id);
      if (deleted) setDeleteTarget(null);
      else setDeleteFailed(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const selectWorkspaceTab = (tab: WorkspaceTab) => {
    if (tab === urlTab) return;
    router.replace(pathForFlowWorkspaceTab(tab), { scroll: false });
  };

  // `RenameInput` already refuses to commit an invalid name; the guard here is a
  // backstop so nothing over the limit can reach the backend from this screen.
  const handleCommitRename = (id: string, name: string) => {
    setRenamingId(null);
    const project = projects.find((item) => item.id === id);
    // Only hit the API when the name actually changed.
    if (project && isValidProjectName(name) && name.trim() !== project.name) {
      void rename(id, name).catch((err: unknown) =>
        useToastStore.getState().push(renameErrorMessage(err, t)),
      );
    }
  };

  const renameMaxLengthError = t('appChat.flow.rename.maxLength').replace(
    '{max}',
    String(PROJECT_NAME_MAX_LENGTH),
  );

  // Every card and row takes the same props — the only difference is the shape
  // it renders in, so the two views hand the exact same object to either one.
  const cardPropsFor = (project: WorkflowProject) => ({
    project,
    assetsLabel: t('appChat.flow.assets'),
    creditsLabel: t('appChat.flow.credits'),
    menuLabels,
    favoriteLabels,
    renameMaxLengthError,
    renameCharsLeft: t('appChat.flow.rename.charsLeft'),
    isRenaming: renamingId === project.id,
    onOpen: () => openEditor(project.id),
    onStartRename: () => setRenamingId(project.id),
    onCommitRename: (name: string) => handleCommitRename(project.id, name),
    onCancelRename: () => setRenamingId(null),
    onDuplicate: () => handleDuplicate(project.id),
    onDelete: () => handleDelete(project),
    onToggleFavorite: () => handleToggleFavorite(project),
  });

  // Usage Analytics owns its whole page (header, time window, blocks) — the
  // tab just mounts it; it renders inside FlowPageShell like the others.
  if (urlTab === 'usage') {
    return <UsageAnalyticsPage />;
  }

  if (urlTab === 'home') {
    return (
      <FlowHome
        onCreate={() => void handleCreate()}
        onOpenProject={openEditor}
        onSeeAllProjects={() => selectWorkspaceTab('project')}
        onStartWithAgent={handleStartWithAgent}
      />
    );
  }

  return (
    <FlowPageShell scrollRef={scrollRef}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight text-neutral-900 dark:text-neutral-50">
            {t('appChat.flow.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {t('appChat.flow.description')}
          </p>
        </div>
        <LearnButton guideId="flow" className="rounded-full" />
      </header>

      <ProjectListToolbar
        query={query}
        onQueryChange={setQuery}
        favoritesOnly={favoritesOnly}
        onFavoritesOnlyChange={setFavoritesOnly}
        sort={sort}
        onSortChange={setSort}
        viewMode={viewMode}
        onViewModeChange={pickViewMode}
      />

      <>
        {isLoading ? (
          <ProjectGridSkeleton />
        ) : error && !hasResults ? (
          <FlowEmptyState
            icon={SquareSlash}
            title={t('appChat.flow.empty.error.title')}
            description={t('appChat.flow.empty.error.description')}
            actionLabel={t('appChat.flow.empty.error.action')}
            onAction={refresh}
          />
        ) : !hasResults ? (
          favoritesOnly && !isSearching ? (
            // No starred projects at all (a search that finds none of them is
            // the ordinary "no results" below): say what the star does, and
            // offer the way back to the full list.
            <FlowEmptyState
              icon={Star}
              title={t('appChat.flow.favorites.empty.title')}
              description={t('appChat.flow.favorites.empty.description')}
              actionLabel={t('appChat.flow.favorites.empty.action')}
              onAction={() => setFavoritesOnly(false)}
            />
          ) : isFiltering ? (
            <FlowEmptyState
              icon={SquareSlash}
              title={t('appChat.flow.empty.noResults.title')}
              description={t('appChat.flow.empty.noResults.description')}
              actionLabel={t('appChat.flow.empty.noResults.action')}
              onAction={clearFilters}
            />
          ) : (
            <div data-learn="flow.create-new">
              <FlowEmptyState
                icon={FolderPlus}
                title={t('appChat.flow.empty.noProjects.title')}
                description={t('appChat.flow.empty.noProjects.description')}
                actionLabel={t('appChat.flow.createNew')}
                onAction={handleCreate}
              />
            </div>
          )
        ) : viewMode === 'grid' ? (
          <div
            className={cn(
              PROJECT_GRID_CLASS,
              'transition-opacity',
              isRefetching && 'pointer-events-none opacity-60',
            )}
          >
            <CreateProjectCard
              label={t('appChat.flow.createNew')}
              onClick={handleCreate}
            />
            {visibleProjects.map((project, index) => (
              <div
                key={project.id}
                data-learn={index === 0 ? 'flow.projects' : undefined}
              >
                <ProjectCard {...cardPropsFor(project)} />
              </div>
            ))}
          </div>
        ) : (
          <div
            className={cn(
              'mt-6 flex flex-col gap-2 transition-opacity',
              isRefetching && 'pointer-events-none opacity-60',
            )}
          >
            <CreateProjectRow
              label={t('appChat.flow.createNew')}
              onClick={handleCreate}
            />
            {visibleProjects.map((project, index) => (
              <div
                key={project.id}
                data-learn={index === 0 ? 'flow.projects' : undefined}
              >
                <ProjectRow {...cardPropsFor(project)} />
              </div>
            ))}
          </div>
        )}
      </>

      {/* Rendered even when the current page came back empty, so a page that
          was emptied (or a stale deep link) still offers a way back. */}
      {pagination && totalPages > 1 ? (
        <PaginationBar
          pageNo={pageNo}
          totalPages={totalPages}
          totalItems={pagination.total_items}
          busy={isRefetching}
          onSelect={goToPage}
          labels={{
            prev: t('appChat.flow.pagination.prev'),
            next: t('appChat.flow.pagination.next'),
            page: t('appChat.flow.pagination.page'),
            projects: t('appChat.flow.pagination.projects'),
          }}
        />
      ) : null}

      {/* Mounted at page level, not inside the card: the dialog portals to body
          but React events still bubble through the tree, and a card/row's own
          onClick opens the editor. */}
      <DeleteFlowProjectDialog
        project={deleteTarget}
        pending={isDeleting}
        failed={deleteFailed}
        failedMessage={
          deleteFailed
            ? describeFlowProjectDeleteError(removeError, lang, t)
            : undefined
        }
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </FlowPageShell>
  );
};

/**
 * FlowPage is the Flow container, and the ONE place this app mounts an SWR
 * cache.
 *
 * Scoped here on purpose: the rest of `/app` runs on TanStack Query
 * (QueryProvider in app/app/layout.tsx) and keeps doing so, so "which library
 * owns this data" has a one-line answer — inside Flow the usage-analytics
 * blocks read SWR, everything else reads react-query. A provider around the
 * whole app would make that a question you answer per hook.
 */
export const FlowPage = () => (
  <FlowSWRProvider>
    <FlowWorkspace />
  </FlowSWRProvider>
);
