import type { SquareSlash } from "lucide-react";

// Shared placeholder for the flow workspace: the project list uses it for
// no-results / no-projects / load-error, the template gallery for no-matches.
export const FlowEmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof SquareSlash;
  title: string;
  description: string;
  /** Omit both to render a state with nothing to act on (e.g. an empty catalog). */
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 py-28 text-center">
    <Icon
      className="size-12 text-neutral-300 dark:text-neutral-600"
      strokeWidth={1.25}
    />
    <div>
      <p className="text-[16px] font-bold text-neutral-800 dark:text-neutral-100">
        {title}
      </p>
      <p className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {actionLabel}
      </button>
    ) : null}
  </div>
);
