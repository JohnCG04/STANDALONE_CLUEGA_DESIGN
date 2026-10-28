"use client";

import { Image as ImageIcon, Sparkles } from "lucide-react";

import { CARD_STAR_CLASS } from "../constants";
import type { ProjectCardProps } from "../types";
import { FlowFavoriteStar } from "./FlowFavoriteStar";
import { Avatar, Badge, RenameInput } from "./ProjectPrimitives";
import { ProjectMenu } from "./ProjectMenu";
import { WorkflowThumbnail } from "./WorkflowThumbnail";

/** One project as a grid tile: thumbnail, counts, name, creator, actions. */
export const ProjectCard = ({
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
  <div className="group flex flex-col">
    {/* The star is a SIBLING of the thumbnail button, positioned over it — a
        button inside a button is invalid HTML. Hidden until hover unless set. */}
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 text-left transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] dark:border-neutral-800"
      >
        <WorkflowThumbnail
          src={project.thumbnailUrl}
          type={project.thumbnailType}
          alt={project.name}
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
          <Badge icon={ImageIcon}>
            {project.assets} {assetsLabel}
          </Badge>
          <Badge icon={Sparkles}>
            {project.credits} {creditsLabel}
          </Badge>
        </div>
      </button>
      <FlowFavoriteStar
        favorite={project.favorite}
        canToggle={project.canFavorite}
        onToggle={onToggleFavorite}
        labels={favoriteLabels}
        revealOnHover
        className={CARD_STAR_CLASS}
      />
    </div>
    <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
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
          // `title` so a name the card had to truncate can still be read in full
          // on hover.
          <p
            title={project.name}
            className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-100"
          >
            {project.name}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          <Avatar initial={project.authorInitial} color={project.authorColor} />
          <span className="truncate">
            {project.updatedLabel}
          </span>
        </div>
      </div>
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
  </div>
);
