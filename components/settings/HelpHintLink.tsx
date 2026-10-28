"use client";

import { CircleHelp } from "lucide-react";

import { useHelpHref } from "@/hooks/useHelpHref";
import { cn } from "@/lib/utils";

export function HelpHintLink({
  path,
  label,
  className,
}: {
  path: string;
  label: string;
  className?: string;
}) {
  const href = useHelpHref(path);

  return (
    <span className={cn("group/hint relative inline-flex", className)}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className="-m-0.5 inline-flex shrink-0 items-center rounded-full p-0.5 text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:text-neutral-200"
      >
        <CircleHelp className="size-3" strokeWidth={1.75} />
      </a>

      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[240px] rounded-md bg-neutral-900 px-2 py-1 text-left text-[11px] font-semibold leading-snug text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {label}
      </span>
    </span>
  );
}
