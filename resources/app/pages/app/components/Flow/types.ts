import type { FlowWorkspaceTab } from "@/lib/flow/flowWorkspaceTab";

import type { FlowFavoriteLabels } from "./components/FlowFavoriteStar";
import type { FlowProjectCoverType } from "./services/flow-builder.service";

export type ViewMode = "grid" | "list";

/**
 * The flow route hosts Home, the project list, the technique gallery and Usage
 * Analytics. The active workspace is mirrored in the URL as ?tab=… so it
 * survives refresh and can be linked to directly; Home is the bare route.
 *
 * The mapping itself lives in lib/flow/flowWorkspaceTab.ts, shared with the
 * Flow sidebar, so the page and the sidebar's highlight read ?tab by one rule.
 * The sidebar is the only way to switch workspaces — the page renders no tab bar.
 */
export type WorkspaceTab = FlowWorkspaceTab;

/** View-model the cards/rows render — derived from the API `FlowProject`. */
export interface WorkflowProject {
  id: string;
  name: string;
  assets: number;
  credits: number;
  thumbnailUrl?: string;
  thumbnailType?: FlowProjectCoverType;
  authorInitial: string;
  authorColor: string;
  updatedLabel: string;
  /** The creator's star (visible to the whole team). */
  favorite: boolean;
  /** Whether the signed-in user may toggle it — creator-only, else a 403. */
  canFavorite: boolean;
}

/** The translated chrome of a project's "..." menu. */
export interface MenuLabels {
  open: string;
  rename: string;
  duplicate: string;
  delete: string;
  addFavorite: string;
  removeFavorite: string;
}

/** Everything a project card and a project row both take — they share a shape. */
export interface ProjectCardProps {
  project: WorkflowProject;
  assetsLabel: string;
  creditsLabel: string;
  menuLabels: MenuLabels;
  favoriteLabels: FlowFavoriteLabels;
  renameMaxLengthError: string;
  /** "{n} characters left" template under the rename input. */
  renameCharsLeft: string;
  isRenaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}
