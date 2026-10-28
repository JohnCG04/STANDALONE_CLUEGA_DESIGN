"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

import { ADD_TILE_CLASS } from "../constants";

type AddTileProps = ComponentPropsWithoutRef<"button"> & {
  label: string;
  icon: typeof Plus;
};

/**
 * The dashed "Add new" square the Colors, Logo and Photography grids open with.
 *
 * `forwardRef`, and every other prop forwarded: in Colors this tile IS a Radix
 * `PopoverTrigger asChild`, which positions the popover against the trigger's
 * ref. A plain function component swallows it — which is why "Add new" opened
 * nothing while the swatches, wrapped in a `div`, worked.
 */
export const AddTile = forwardRef<HTMLButtonElement, AddTileProps>(
  ({ label, icon: Icon, disabled = false, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        ADD_TILE_CLASS,
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...rest}
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="px-2 text-center leading-tight">{label}</span>
    </button>
  ),
);
AddTile.displayName = "AddTile";
