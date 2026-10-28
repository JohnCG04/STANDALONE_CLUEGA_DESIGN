import {
  User,
  Settings as SettingsIcon,
  CreditCard,
  Users,
  CalendarClock,
  Bot,
  Mail,
  Database,
  Monitor,
  FolderOpen,
  Cloud,
  Sparkles,
  Cable,
  Puzzle,
  MonitorSmartphone,
  ShieldCheck,
  BadgeCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { SettingsTab } from "@/lib/settings/types";

export const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  profile: User,
  general: SettingsIcon,
  billing: CreditCard,
  sessions: MonitorSmartphone,
  team: Users,
  permissions: ShieldCheck,
  autonomy: SlidersHorizontal,
  publishApprovals: BadgeCheck,
  "managed-tasks": CalendarClock,
  "model-selection": Bot,
  mail: Mail,
  "data-control": Database,
  "my-computer": Monitor,
  "local-folders": FolderOpen,
  "cloud-browse": Cloud,
  skills: Sparkles,
  connectors: Cable,
  integrations: Puzzle,
};

export const ACCOUNT_TAB_ORDER: SettingsTab[] = [
  "profile",
  "general",
  "billing",
  "team",
];

/**
 * Tabs that stay listed in the sidebar but cannot be selected.
 *
 * Listed rather than removed from the tab order on purpose: the entries
 * remain visible so the features read as present-but-off instead of missing.
 * SettingsContent also renders no panel for these, so a tab set from elsewhere
 * (e.g. the cdp-open-settings window event) cannot reach a panel either.
 *
 * To re-enable one: drop it here, then uncomment its case + import in
 * SettingsContent.
 */
export const DISABLED_TABS: ReadonlySet<SettingsTab> = new Set([
  "mail",
  "my-computer",
]);

export const TAB_I18N_KEY: Record<SettingsTab, string> = {
  profile: "profile",
  general: "general",
  billing: "billing",
  sessions: "sessions",
  team: "team",
  permissions: "permissions",
  autonomy: "autonomy",
  publishApprovals: "publishApprovals",
  "managed-tasks": "managedTasks",
  "model-selection": "modelSelection",
  mail: "mail",
  "data-control": "dataControl",
  "my-computer": "myComputer",
  "local-folders": "localFolders",
  "cloud-browse": "cloudBrowse",
  skills: "skills",
  connectors: "connectors",
  integrations: "integrations",
};
