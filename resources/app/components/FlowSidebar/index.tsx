"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LuPanelLeft, LuPlus, LuStar } from "react-icons/lu";

import { Skeleton } from "@/components/ui";
import { useLearn } from "@/components/learn";
import { useSettings } from "@/components/settings/context";
import { prewarmWorkflowModels } from "@/components/workflow/WorkflowEditor/hooks/useWorkflowModels";
import { useCdpUserId } from "@/hooks/useCdpUserId";
import { useTranslate } from "@/hooks/useTranslate";
import { SHOW_FLOW_SIDEBAR_EXPERIMENTAL_SECTIONS } from "@/lib/feature-flags";
import {
  canToggleFlowFavorite,
  pathForFlowProjects,
} from "@/lib/flow/flowFavorites";
import {
  FLOW_PROJECTS_QUERY_PREFIX,
  FLOW_RECENT_PROJECTS_QUERY_KEY,
} from "@/lib/flow/flowQueryKeys";
import {
  FLOW_SIDEBAR_SECTIONS,
  type FlowSidebarSectionKey,
} from "@/lib/flow/flowSidebarNav";
import {
  FLOW_HOME_ROUTE,
  flowWorkspaceTabFromParam,
} from "@/lib/flow/flowWorkspaceTab";
import { cn } from "@/lib/utils";
import {
  createProject,
  type FlowProject,
} from "@/resources/app/pages/app/components/Flow/services/flow-builder.service";
import { useMobileSidebar } from "@/resources/app/components/AppSidebarLayer";

import {
  activeFlowMenuKey,
  FLOW_SIDEBAR_WIDTH_CLASS,
  SECTION_STATIC_ITEM_ICON,
  type FlowMenuItem,
} from "./constants";
import {
  FlowMenu,
  FlowSidebarFooter,
  FlowSidebarItem,
  FlowSidebarSection,
  ProjectRow,
  WorkspaceHeader,
} from "./components";
import {
  DIVIDER,
  HOVER_FILL,
  ICON_BUTTON,
  ICON_STROKE,
  SIDEBAR_SURFACE,
} from "./styles";
import { useCreditsRemaining } from "./useCreditsRemaining";
import { useFlowFavoriteProjects } from "./useFlowFavoriteProjects";
import { useFlowFavoriteToggle } from "./useFlowFavoriteToggle";
import { useFlowRecentProjects } from "./useFlowRecentProjects";

const editorRoute = (id: string) => `/workflow/${encodeURIComponent(id)}`;

const RECENT_SKELETON_ROWS = 3;

export const FlowSidebar = () => {
  const { t } = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { openSettings } = useSettings();
  const { openDrawer } = useLearn();

  const query = searchParams?.toString() ?? "";
  const currentHref = query ? `${pathname}?${query}` : pathname;
  const activeKey = activeFlowMenuKey(pathname, query);

  const recent = useFlowRecentProjects();
  const favorites = useFlowFavoriteProjects();
  const toggleFavorite = useFlowFavoriteToggle();
  const currentUserId = useCdpUserId();
  const credits = useCreditsRemaining();

  const [collapsed, setCollapsed] = useState<
    Partial<Record<FlowSidebarSectionKey, boolean>>
  >({});
  const toggleSection = (key: FlowSidebarSectionKey) =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  const [isCreating, setIsCreating] = useState(false);

  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  // On a phone the rail already floats over the page, so there is nothing for a
  // 64px version of it to win back: the same key closes the drawer instead, and
  // a collapse chosen on a desktop is ignored while the layout is a drawer.
  const mobile = useMobileSidebar();
  const isCollapsed = isRailCollapsed && !mobile.isMobile;
  const toggleRail = () =>
    mobile.isMobile
      ? mobile.close()
      : setIsRailCollapsed((current) => !current);

  const openEditor = (id: string) => {
    void prewarmWorkflowModels(queryClient);
    router.push(editorRoute(id));
  };

  const openHref = (href: string) => {
    if (href === currentHref) return;
    const path = href.split("?")[0];

    if (path === FLOW_HOME_ROUTE) {
      if (pathname === FLOW_HOME_ROUTE) router.replace(href, { scroll: false });
      else router.push(href);
      return;
    }

    router.push(href);
  };

  const createAndOpen = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const project = await createProject(t("appChat.flow.untitled"));
      queryClient.removeQueries({ queryKey: FLOW_PROJECTS_QUERY_PREFIX });
      void queryClient.invalidateQueries({
        queryKey: FLOW_RECENT_PROJECTS_QUERY_KEY,
        refetchType: "none",
      });
      openEditor(project.id);
    } catch (err) {
      console.error("[flow-sidebar] create project failed", err);
    } finally {
      setIsCreating(false);
    }
  };

  const selectMenuItem = (item: FlowMenuItem) => {
    if (item.action === "create") {
      void createAndOpen();
      return;
    }
    if (item.href) openHref(item.href);
  };

  const workspaceTab = flowWorkspaceTabFromParam(searchParams?.get("tab") ?? null);
  const helpGuide =
    workspaceTab === "home" ? "flow-home" : "flow";

  const collapseLabelKey = isCollapsed
    ? "appChat.flow.sidebar.expandSidebar"
    : "appChat.flow.sidebar.collapseSidebar";

  const hint = (key: string) => (
    <p className="px-2 py-1.5 text-[11px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
      {t(key)}
    </p>
  );

  const createAction = {
    icon: LuPlus,
    label: t("appChat.flow.createNew"),
    onClick: () => void createAndOpen(),
    disabled: isCreating,
  };

  const favoriteLabels = {
    add: t("appChat.flow.favorites.add"),
    remove: t("appChat.flow.favorites.remove"),
    favorited: t("appChat.flow.favorites.favorited"),
  };

  const renderProjectRow = (project: FlowProject) => (
    <ProjectRow
      key={project.id}
      name={project.name}
      onOpen={() => openEditor(project.id)}
      favorite={project.favorite}
      canToggleFavorite={canToggleFlowFavorite(project, currentUserId)}
      onToggleFavorite={() => void toggleFavorite(project)}
      favoriteLabels={favoriteLabels}
    />
  );

  const skeletonRows = (count: number) => (
    <div className="flex flex-col gap-px" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-full rounded-lg" />
      ))}
    </div>
  );

  return (
    <aside
      aria-label={t("appChat.nav.cluegaDesign")}
      className={cn(
        "sidebar-shell",
        SIDEBAR_SURFACE,
        isCollapsed ? "w-16" : FLOW_SIDEBAR_WIDTH_CLASS,
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col pt-3",
          isCollapsed ? "px-2 pb-3" : "px-3 pb-3",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center",
            isCollapsed ? "justify-center" : "justify-between",
          )}
        >
          {isCollapsed ? null : (
            <button
              type="button"
              onClick={() => openHref(FLOW_HOME_ROUTE)}
              aria-label={t("appChat.flow.sidebar.home")}
              title={t("appChat.flow.sidebar.home")}
              className={cn(
                "ml-1 flex shrink-0 items-center rounded-lg p-0.5 transition-colors",
                HOVER_FILL,
              )}
            >
              <img loading="lazy" decoding="async"
                src="/images/cluega-logo/full-text-logo.svg"
                alt="Cluega"
                className="h-5 shrink-0 object-contain dark:invert"
              />
            </button>
          )}
          <button
            type="button"
            onClick={toggleRail}
            aria-label={t(collapseLabelKey)}
            aria-pressed={isCollapsed}
            title={t(collapseLabelKey)}
            className={ICON_BUTTON}
          >
            <LuPanelLeft
              aria-hidden="true"
              className={cn("size-4", ICON_STROKE, isCollapsed && "rotate-180")}
            />
          </button>
        </div>

        <div className="mt-1 shrink-0">
          <WorkspaceHeader collapsed={isCollapsed} />
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <FlowMenu
            activeKey={activeKey}
            isCreating={isCreating}
            collapsed={isCollapsed}
            onSelect={selectMenuItem}
          />

        {isCollapsed ? null : (
        <>
        <div role="separator" className={DIVIDER} />

        <div className="flex flex-col gap-0.5">
            {FLOW_SIDEBAR_SECTIONS.map((section) => {
              const sectionId = `flow-sidebar-${section.key}`;
              const action = section.addAction ? createAction : undefined;
              const sectionLearnAnchor =
                section.key === "favorites"
                  ? "flow-home.sidebar-favorites"
                  : section.key === "recent"
                    ? "flow-home.sidebar-recent"
                    : section.key === "workspace"
                      ? "flow-home.sidebar-workspace"
                      : undefined;

              if (section.key === "favorites") {
                return (
                  <div key={section.key} data-learn={sectionLearnAnchor}>
                    <FlowSidebarSection
                      id={sectionId}
                      title={t(section.labelKey)}
                      collapsed={Boolean(collapsed[section.key])}
                      onToggle={() => toggleSection(section.key)}
                      action={action}
                    >
                      {favorites.isLoading ? (
                        skeletonRows(RECENT_SKELETON_ROWS)
                      ) : favorites.failed ? (
                        hint("appChat.flow.sidebar.favoritesFailed")
                      ) : favorites.projects.length === 0 ? (
                        section.emptyKey ? hint(section.emptyKey) : null
                      ) : (
                        <>
                          {favorites.projects.map(renderProjectRow)}
                          {favorites.totalItems > favorites.projects.length ? (
                            <FlowSidebarItem
                              icon={LuStar}
                              label={t("appChat.flow.sidebar.favoritesViewAll")}
                              onClick={() =>
                                router.replace(pathForFlowProjects(true), {
                                  scroll: false,
                                })
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </FlowSidebarSection>
                  </div>
                );
              }

              if (section.key === "recent") {
                if (!recent.isLoading && recent.projects.length === 0) {
                  return null;
                }
                return (
                  <div key={section.key} data-learn={sectionLearnAnchor}>
                    <FlowSidebarSection
                      id={sectionId}
                      title={t(section.labelKey)}
                      collapsed={Boolean(collapsed[section.key])}
                      onToggle={() => toggleSection(section.key)}
                      action={action}
                    >
                      {recent.isLoading
                        ? skeletonRows(RECENT_SKELETON_ROWS)
                        : recent.projects.map(renderProjectRow)}
                    </FlowSidebarSection>
                  </div>
                );
              }

              return (
                <div key={section.key} data-learn={sectionLearnAnchor}>
                  <FlowSidebarSection
                    id={sectionId}
                    title={t(section.labelKey)}
                    collapsed={Boolean(collapsed[section.key])}
                    onToggle={() => toggleSection(section.key)}
                    action={action}
                  >
                    {section.staticItem ? (
                      <FlowSidebarItem
                        icon={SECTION_STATIC_ITEM_ICON}
                        label={t(section.staticItem.labelKey)}
                        badge={
                          section.experimental
                            ? t("appChat.flow.sidebar.comingSoon")
                            : undefined
                        }
                        onClick={() => openHref(section.staticItem!.href)}
                      />
                    ) : null}
                  </FlowSidebarSection>
                </div>
              );
            })}
        </div>
        </>
        )}
        </div>

        <div className="shrink-0" data-learn="flow-home.sidebar-footer">
          <FlowSidebarFooter
            remaining={credits}
            collapsed={isCollapsed}
            showTrash={SHOW_FLOW_SIDEBAR_EXPERIMENTAL_SECTIONS}
            onUpgrade={() => openSettings("billing")}
            onOpenSettings={() => openSettings()}
            onOpenHelp={() => openDrawer(helpGuide)}
            labels={{
              credits: {
                left: t("appChat.flow.sidebar.creditsLeft"),
                tokens: t("appChat.flow.sidebar.creditsTokens"),
                unknown: t("appChat.flow.sidebar.creditsUnknown"),
                upgrade: t("appChat.flow.sidebar.upgrade"),
              },
              trash: t("appChat.flow.sidebar.trash"),
              comingSoon: t("appChat.flow.sidebar.comingSoon"),
              settings: t("appSettings.title"),
              help: t("appChat.flow.sidebar.help"),
            }}
          />
        </div>
      </div>
    </aside>
  );
};
