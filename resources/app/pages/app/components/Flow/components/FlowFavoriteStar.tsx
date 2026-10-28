"use client";

import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** The three strings the star needs; resolved with t() by the host. */
export type FlowFavoriteLabels = {
  /** Button label while unstarred. */
  add: string;
  /** Button label while starred. */
  remove: string;
  /** Tooltip of the read-only star a non-creator sees. */
  favorited: string;
};

/**
 * The star on a Flow project — the card, the list row and the sidebar rows all
 * render this one, so the gesture looks and reads the same everywhere.
 *
 * Three states from two inputs (see lib/flow/flowFavorites.ts):
 * - the creator (`canToggle`): a real toggle button, `aria-pressed` so a screen
 *   reader gets the state and not just the action;
 * - anyone else, project starred: a read-only indicator — the flag is the
 *   creator's, but the whole team sees it;
 * - anyone else, not starred: nothing at all.
 *
 * It swallows the click: every host opens the editor on click, and starring a
 * project must not also open it. Rendered as a SIBLING of the host's click
 * target, never inside it — a button inside a button is invalid HTML.
 *
 * `revealOnHover` hides an unstarred star until the host's `group` is hovered
 * (or the star itself is focused, for keyboard users); a starred one is always
 * visible, since it carries information.
 */
export const FlowFavoriteStar = ({
  favorite,
  canToggle,
  onToggle,
  labels,
  size = "sm",
  revealOnHover = false,
  className,
}: {
  favorite: boolean;
  canToggle: boolean;
  onToggle: () => void;
  labels: FlowFavoriteLabels;
  /** `xs` for the 32px sidebar rows, `sm` for the cards and list rows. */
  size?: "xs" | "sm";
  revealOnHover?: boolean;
  className?: string;
}) => {
  const box = size === "xs" ? "size-6 rounded-md" : "size-7 rounded-lg";
  const icon = size === "xs" ? "size-3.5" : "size-4";
  const hidden =
    revealOnHover && !favorite
      ? "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      : undefined;

  if (!canToggle) {
    if (!favorite) return null;
    return (
      <span
        role="img"
        aria-label={labels.favorited}
        title={labels.favorited}
        className={cn(
          "inline-flex shrink-0 items-center justify-center text-amber-500",
          box,
          className,
        )}
      >
        <Star className={cn(icon, "fill-amber-400")} strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }

  const label = favorite ? labels.remove : labels.add;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={favorite}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-[color,background-color,opacity]",
        "hover:bg-neutral-900/[0.06] hover:text-amber-500 dark:hover:bg-white/[0.08]",
        box,
        favorite
          ? "text-amber-500"
          : "text-neutral-400 dark:text-neutral-500",
        hidden,
        className,
      )}
    >
      <Star
        className={cn(icon, favorite && "fill-amber-400")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  );
};
