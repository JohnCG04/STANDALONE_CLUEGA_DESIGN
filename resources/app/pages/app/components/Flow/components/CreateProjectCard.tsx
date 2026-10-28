"use client";

import { Plus } from "lucide-react";

/** The "New workflow" tile that opens the grid. */
export const CreateProjectCard = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex min-h-[172px] flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white transition-all hover:border-neutral-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:border-neutral-800 dark:bg-neutral-900"
    data-learn="flow.create-new"
  >
    <span className="flex size-12 items-center justify-center rounded-full bg-neutral-900 text-white transition-transform group-hover:scale-105 dark:bg-neutral-100 dark:text-neutral-900">
      <Plus className="size-5" strokeWidth={2.25} />
    </span>
    <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">
      {label}
    </span>
  </button>
);

/** The same action as a row, for the list view. */
export const CreateProjectRow = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    data-learn="flow.create-new"
  >
    <span className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
      <Plus className="size-4" strokeWidth={2.25} />
    </span>
    <span className="text-[13px] font-bold text-neutral-800 dark:text-neutral-100">
      {label}
    </span>
  </button>
);
