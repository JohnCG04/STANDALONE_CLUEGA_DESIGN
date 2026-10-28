"use client";

import { cn } from "@/lib/utils";
import {
  FlowFavoriteStar,
  type FlowFavoriteLabels,
} from "@/resources/app/pages/app/components/Flow/components/FlowFavoriteStar";

import { ROW_IDLE } from "../../styles";

export const ProjectRow = ({
  name,
  onOpen,
  favorite,
  canToggleFavorite,
  onToggleFavorite,
  favoriteLabels,
}: {
  name: string;
  onOpen: () => void;
  favorite: boolean;
  canToggleFavorite: boolean;
  onToggleFavorite: () => void;
  favoriteLabels: FlowFavoriteLabels;
}) => (
  <div
    className={cn(
      "group flex h-8 w-full min-w-0 items-center rounded-lg pr-1 transition-colors",
      ROW_IDLE,
    )}
  >
    <button
      type="button"
      onClick={onOpen}
      title={name}
      className="flex h-8 min-w-0 flex-1 items-center p-2 text-left text-[13px] font-medium leading-none"
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>
    <FlowFavoriteStar
      size="xs"
      favorite={favorite}
      canToggle={canToggleFavorite}
      onToggle={onToggleFavorite}
      labels={favoriteLabels}
      revealOnHover
    />
  </div>
);
