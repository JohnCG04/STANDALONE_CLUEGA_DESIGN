import type { IconType } from "react-icons";

import {
  FLOW_BRAND_KIT_ROUTE,
  isFlowBrandKitPath,
} from "@/lib/flow/flowBrandKitRoute";
import { HiOutlineHome } from "react-icons/hi2";
import {
  LuChartColumn,
  LuFolder,
  LuFolderOpen,
  LuLayoutGrid,
  LuPlus,
} from "react-icons/lu";

import { FLOW_HOME_ROUTE } from "@/lib/flow/flowWorkspaceTab";

export const FLOW_SIDEBAR_WIDTH_CLASS = "w-[260px]";

export type FlowMenuKey =
  | "create"
  | "designHome"
  | "brandKit"
  | "projects"
  | "usage";

export type FlowMenuItem = {
  key: FlowMenuKey;
  labelKey: string;
  icon: IconType;
  href?: string;
  action?: "create";
  children?: FlowMenuItem[];
};

export const FLOW_SIDEBAR_MENU: FlowMenuItem[] = [
  {
    key: "create",
    labelKey: "appChat.flow.sidebar.create",
    icon: LuPlus,
    action: "create",
  },
  {
    key: "designHome",
    labelKey: "appChat.flow.sidebar.designHome",
    icon: HiOutlineHome,
    href: FLOW_HOME_ROUTE,
    children: [
      {
        key: "brandKit",
        labelKey: "appChat.flow.sidebar.brandKit",
        icon: LuLayoutGrid,
        href: FLOW_BRAND_KIT_ROUTE,
      },
    ],
  },
  {
    key: "projects",
    labelKey: "appChat.nav.projects",
    icon: LuFolder,
    href: `${FLOW_HOME_ROUTE}?tab=project`,
  },
  {
    key: "usage",
    labelKey: "appChat.flow.sidebar.usage",
    icon: LuChartColumn,
    href: `${FLOW_HOME_ROUTE}?tab=usage`,
  },
];

export const SECTION_STATIC_ITEM_ICON: IconType = LuFolderOpen;

function flatten(
  items: FlowMenuItem[],
): { key: FlowMenuKey; href?: string }[] {
  return items.flatMap((item) => [
    { key: item.key, href: item.href },
    ...(item.children ? flatten(item.children) : []),
  ]);
}

const FLAT_MENU = flatten(FLOW_SIDEBAR_MENU);

function flowTabOf(href: string): string | null {
  const [path, query = ""] = href.split("?");
  if (path !== FLOW_HOME_ROUTE) return null;
  return new URLSearchParams(query).get("tab") ?? "home";
}

export function activeFlowMenuKey(
  pathname: string,
  search: string | null | undefined,
): FlowMenuKey | null {
  const query = (search ?? "").replace(/^\?/, "");
  const href = query ? `${pathname}?${query}` : pathname;

  const exact = FLAT_MENU.find((row) => row.href === href);
  if (exact) return exact.key;

  if (pathname === FLOW_HOME_ROUTE) {
    const tab = new URLSearchParams(query).get("tab") ?? "home";
    const byTab = FLAT_MENU.find(
      (row) => row.href && flowTabOf(row.href) === tab,
    );
    if (byTab) return byTab.key;
  }

  // The Brand Kit is a master→detail feature: /flow/brand-kit/<id> and the
  // pre-save /new are the same DESTINATION as the row, and a row that goes dark
  // on the page it just opened reads as "you have left the Brand Kit".
  //
  // Through the route helper rather than a prefix of its own: `startsWith`
  // would light this row on /flow/brand-kitchen too. Looked up in
  // FLAT_MENU rather than returned as a literal key, so a rename of the key
  // cannot leave this branch pointing at a row that no longer exists.
  if (isFlowBrandKitPath(pathname)) {
    return FLAT_MENU.find((row) => row.href === FLOW_BRAND_KIT_ROUTE)?.key ?? null;
  }

  const byPath = FLAT_MENU.find(
    (row) => row.href && row.href.split("?")[0] === pathname,
  );
  return byPath?.key ?? null;
}

export function flowMenuParentKey(key: FlowMenuKey): FlowMenuKey | null {
  for (const item of FLOW_SIDEBAR_MENU) {
    if (item.children?.some((child) => child.key === key)) return item.key;
  }
  return null;
}
