"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Page numbers to render: always first + last, plus a window around the current
// page, with "…" standing in for the gaps. Keeps the pager one line wide no
// matter how many pages the backend reports.
const PAGE_GAP = "gap" as const;
type PageSlot = number | typeof PAGE_GAP;

function pageSlots(current: number, total: number): PageSlot[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const around = [current - 1, current, current + 1].filter(
    (page) => page > 1 && page < total,
  );
  const pages = [1, ...around, total];

  const slots: PageSlot[] = [];
  let previous = 0;
  for (const page of pages) {
    if (page - previous > 1) slots.push(PAGE_GAP);
    slots.push(page);
    previous = page;
  }
  return slots;
}

/** The Flow area's shared page-select pager — the projects list and the admin
 *  catalog. `labels.projects` names the counted noun ("projects", "workflows"). */
export const PaginationBar = ({
  pageNo,
  totalPages,
  totalItems,
  busy,
  onSelect,
  labels,
}: {
  pageNo: number;
  totalPages: number;
  totalItems: number;
  busy: boolean;
  onSelect: (page: number) => void;
  labels: { prev: string; next: string; page: string; projects: string };
}) => (
  <nav
    aria-label={labels.page}
    className="mt-8 flex flex-wrap items-center justify-between gap-3"
  >
    <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
      {totalItems} {labels.projects}
    </p>

    <div className="flex items-center gap-1">
      <PageButton
        label={labels.prev}
        disabled={busy || pageNo <= 1}
        onClick={() => onSelect(pageNo - 1)}
      >
        <ChevronDown className="size-4 rotate-90" strokeWidth={2} />
      </PageButton>

      {pageSlots(pageNo, totalPages).map((slot, index) =>
        slot === PAGE_GAP ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="px-1 text-[13px] font-medium text-neutral-400"
          >
            …
          </span>
        ) : (
          <PageButton
            key={slot}
            label={`${labels.page} ${slot}`}
            active={slot === pageNo}
            disabled={busy && slot !== pageNo}
            onClick={() => onSelect(slot)}
          >
            {slot}
          </PageButton>
        ),
      )}

      <PageButton
        label={labels.next}
        disabled={busy || pageNo >= totalPages}
        onClick={() => onSelect(pageNo + 1)}
      >
        <ChevronDown className="size-4 -rotate-90" strokeWidth={2} />
      </PageButton>
    </div>
  </nav>
);

const PageButton = ({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-current={active ? "page" : undefined}
    className={cn(
      "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[13px] font-bold transition-colors",
      active
        ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
      disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
    )}
  >
    {children}
  </button>
);
