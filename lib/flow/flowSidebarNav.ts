import { SHOW_FLOW_SIDEBAR_EXPERIMENTAL_SECTIONS } from "@/lib/feature-flags";

import { FLOW_HOME_ROUTE } from "./flowWorkspaceTab";

export type FlowSidebarSectionKey =
  | "favorites"
  | "recent"
  | "workspace"
  | "private";

export type FlowSidebarSection = {
  key: FlowSidebarSectionKey;
  labelKey: string;
  addAction?: "create";
  staticItem?: { labelKey: string; href: string };
  emptyKey?: string;
  experimental: boolean;
};

const ALL_PROJECTS_HREF = `${FLOW_HOME_ROUTE}?tab=project`;

export const buildFlowSidebarSections = (
  showExperimental: boolean,
): FlowSidebarSection[] => [
    {
      key: "favorites",
      labelKey: "appChat.flow.sidebar.favorites",
      emptyKey: "appChat.flow.sidebar.favoritesEmpty",
      experimental: false,
    },
    {
      key: "recent",
      labelKey: "appChat.flow.sidebar.recentProjects",
      addAction: "create",
      experimental: false,
    },
    {
      key: "workspace",
      labelKey: "appChat.flow.sidebar.workspace",
      addAction: "create",
      staticItem: {
        labelKey: "appChat.flow.sidebar.allWorkspace",
        href: ALL_PROJECTS_HREF,
      },
      experimental: false,
    },
    ...(showExperimental
      ? [
        {
          key: "private",
          labelKey: "appChat.flow.sidebar.private",
          addAction: "create",
          staticItem: {
            labelKey: "appChat.flow.sidebar.allPrivate",
            href: ALL_PROJECTS_HREF,
          },
          experimental: true,
        } satisfies FlowSidebarSection,
      ]
      : []),
  ];

export const FLOW_SIDEBAR_SECTIONS: FlowSidebarSection[] =
  buildFlowSidebarSections(SHOW_FLOW_SIDEBAR_EXPERIMENTAL_SECTIONS);
