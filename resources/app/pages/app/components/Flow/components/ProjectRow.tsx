"use client";

import { Image as ImageIcon, Sparkles } from "lucide-react";

import type { ProjectCardProps } from "../types";
import { FlowFavoriteStar } from "./FlowFavoriteStar";
import { Avatar, RenameInput } from "./ProjectPrimitives";
import { ProjectMenu } from "./ProjectMenu";
import { WorkflowThumbnail } from "./WorkflowThumbnail";

/** The same project as a dense list row — the list view of the grid card. */
export const ProjectRow = ({
  project,
  assetsLabel,
  creditsLabel,
  menuLabels,
  favoriteLabels,
  renameMaxLengthError,
  renameCharsLeft,
  isRenaming,
  onOpen,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: ProjectCardProps) => (
  <div
    onClick={isRenaming ? undefined : onOpen}
    className="group flex cursor-pointer items-center gap-4 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/60"
  >
    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800">
      <WorkflowThumbnail
        src={project.thumbnailUrl}
        type={project.thumbnailType}
        alt={project.name}
      />
    </div>
    <div className="min-w-0 flex-1">
      {isRenaming ? (
        <RenameInput
          initialValue={project.name}
          maxLengthError={renameMaxLengthError}
          charsLeftLabel={renameCharsLeft}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : (
        <p
          title={project.name}
          className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-100"
        >
          {project.name}
        </p>
      )}
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
        <Avatar initial={project.authorInitial} color={project.authorColor} />
        <span className="truncate">
          {project.updatedLabel}
        </span>
      </div>
    </div>
    <div className="hidden items-center gap-3 text-[11px] font-semibold text-neutral-500 sm:flex">
      <span className="inline-flex items-center gap-1">
        <ImageIcon className="size-3.5" strokeWidth={1.75} />
        {project.assets} {assetsLabel}
      </span>
      <span className="inline-flex items-center gap-1">
        <Sparkles className="size-3.5" strokeWidth={1.75} />
        {project.credits} {creditsLabel}
      </span>
    </div>
    <FlowFavoriteStar
      favorite={project.favorite}
      canToggle={project.canFavorite}
      onToggle={onToggleFavorite}
      labels={favoriteLabels}
      revealOnHover
    />
    <ProjectMenu
      labels={menuLabels}
      favorite={project.favorite}
      onOpen={onOpen}
      onRename={onStartRename}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onToggleFavorite={project.canFavorite ? onToggleFavorite : undefined}
    />
  </div>
);
