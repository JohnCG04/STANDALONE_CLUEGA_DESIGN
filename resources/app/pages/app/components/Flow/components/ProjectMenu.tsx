"use client";

import { useState } from "react";
import {
  Copy,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

import type { MenuLabels } from "../types";

const MenuItem = ({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-semibold transition-colors",
      destructive
        ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800",
    )}
  >
    {children}
  </button>
);

/** The "..." actions of one project, on a card and on a row alike. */
export const ProjectMenu = ({
  labels,
  favorite,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}: {
  labels: MenuLabels;
  favorite: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Absent for a non-creator: the star is not theirs to change (403). */
  onToggleFavorite?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label="Project actions"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
        >
          <MoreHorizontal className="size-4" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        className="w-40 rounded-xl border-neutral-200 p-1 dark:border-neutral-700"
      >
        <MenuItem onClick={() => run(onOpen)}>
          <ImageIcon className="size-3.5" strokeWidth={1.75} />
          {labels.open}
        </MenuItem>
        <MenuItem onClick={() => run(onRename)}>
          <Pencil className="size-3.5" strokeWidth={1.75} />
          {labels.rename}
        </MenuItem>
        {onToggleFavorite ? (
          <MenuItem onClick={() => run(onToggleFavorite)}>
            <Star
              className={cn("size-3.5", favorite && "fill-amber-400 text-amber-500")}
              strokeWidth={1.75}
            />
            {favorite ? labels.removeFavorite : labels.addFavorite}
          </MenuItem>
        ) : null}
        <MenuItem onClick={() => run(onDuplicate)}>
          <Copy className="size-3.5" strokeWidth={1.75} />
          {labels.duplicate}
        </MenuItem>
        <MenuItem onClick={() => run(onDelete)} destructive>
          <Trash2 className="size-3.5" strokeWidth={1.75} />
          {labels.delete}
        </MenuItem>
      </PopoverContent>
    </Popover>
  );
};
