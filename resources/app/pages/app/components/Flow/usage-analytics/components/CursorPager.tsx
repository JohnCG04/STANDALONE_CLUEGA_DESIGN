"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The ledger's footer: how many rows a page holds, which step of the walk is on
 * screen, and the two chevrons that move it.
 *
 * PaginationBar is not reused here because it cannot be: it renders "page N of
 * M" and a total count, and this list has neither. GET /api/v1/ai-spend is
 * keyset-paged on (created_at, job_id) — the bound a job's fan-out siblings
 * broke when it was the timestamp alone — and a keyset walk knows only whether
 * something exists on each side of the page it just served. Counting the rest
 * would mean a second full scan of the window on every step, which is the cost
 * the cursor exists to avoid.
 *
 * So the label is "Page 3" and never "Page 3 of 9": the number is the steps
 * taken from the top, which is a fact this pager owns, where the total is not.
 *
 * `hasPrev`/`hasNext` come straight from the API's two flags, so a dead end is
 * a disabled button rather than a click that returns nothing. Both steps are
 * chevrons only — with two buttons and no page list the direction is the whole
 * message — and the labels stay as their accessible names.
 */
export function CursorPager({
  page,
  hasPrev,
  hasNext,
  busy,
  pageSize,
  pageSizes,
  onPageSize,
  onPrev,
  onNext,
  labels,
}: {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  busy: boolean;
  pageSize: number;
  pageSizes: readonly number[];
  onPageSize: (size: number) => void;
  onPrev: () => void;
  onNext: () => void;
  labels: { prev: string; next: string; page: string; rowsPerPage: string };
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3 dark:border-neutral-800"
      // The pager is the one control whose own busy state matters: a step to a
      // page already in the cache answers instantly and must not flicker.
      aria-busy={busy}
    >
      <label className="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-[13px] font-medium text-neutral-900 outline-none transition-colors hover:bg-neutral-50 focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        {labels.rowsPerPage}
      </label>

      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
          {labels.page} {page}
        </span>
        <StepButton
          label={labels.prev}
          disabled={!hasPrev || busy}
          onClick={onPrev}
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </StepButton>
        <StepButton
          label={labels.next}
          disabled={!hasNext || busy}
          onClick={onNext}
          solid
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </StepButton>
      </div>
    </div>
  );
}

/**
 * One step. The forward button is FILLED while it can move: walking to older
 * rows is what this list is for, and the filled chevron is where the eye lands
 * after reading a page. A disabled step drops to the ground colour in both
 * variants rather than dimming the fill — a faded solid button still reads as
 * the primary action.
 */
function StepButton({
  label,
  disabled,
  solid = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  solid?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
        disabled
          ? "cursor-not-allowed bg-neutral-50 text-neutral-300 dark:bg-neutral-900 dark:text-neutral-700"
          : solid
            ? "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800",
      )}
    >
      {children}
    </button>
  );
}
