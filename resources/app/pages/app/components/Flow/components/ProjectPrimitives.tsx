"use client";

import { useId, useRef, useState } from "react";
import type { Image as ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { PROJECT_NAME_MAX_LENGTH } from "../constants";
import { projectNameLength } from "../helpers";

/** A count chip over a card's thumbnail — assets, credits. */
export const Badge = ({
  icon: Icon,
  children,
}: {
  icon: typeof ImageIcon;
  children: React.ReactNode;
}) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
    <Icon className="size-3" strokeWidth={2} />
    {children}
  </span>
);

/** The creator's initial on a gradient — see `nameToColor` in helpers. */
export const Avatar = ({
  initial,
  color,
}: {
  initial: string;
  color: string;
}) => (
  <span
    className="flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
    style={{ backgroundImage: color }}
  >
    {initial}
  </span>
);

// Inline editor for a project name. Autofocuses + selects on mount; commits on
// Enter or blur, cancels (restores) on Escape.
//
// A name over `PROJECT_NAME_MAX_LENGTH` is never committed: the editor stays open
// with `maxLengthError` under it (shown as soon as the limit is crossed while
// typing, and kept on Enter/blur) until the user shortens it or presses Escape.
// No `maxLength` attribute on the input on purpose — a hard cap would silently
// drop pasted characters instead of telling the user what happened.
export const RenameInput = ({
  initialValue,
  maxLengthError,
  charsLeftLabel,
  onCommit,
  onCancel,
  className,
}: {
  initialValue: string;
  maxLengthError: string;
  /** "{n} characters left" template, shown while the name fits. */
  charsLeftLabel: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}) => {
  const [value, setValue] = useState(initialValue);
  // Guard so blur doesn't also fire a commit after Enter/Escape already ran.
  const settled = useRef(false);

  const length = projectNameLength(value);
  const tooLong = length > PROJECT_NAME_MAX_LENGTH;
  const errorId = useId();

  const commit = () => {
    if (settled.current) return;
    // Leave the editor open so the error stays readable; nothing goes to the API.
    if (tooLong) return;
    settled.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  return (
    <div className="min-w-0">
      <input
        type="text"
        value={value}
        autoFocus
        aria-invalid={tooLong || undefined}
        aria-describedby={errorId}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={cn(
          "w-full rounded-md border bg-white px-1.5 py-0.5 text-[13px] font-bold text-neutral-800 outline-none dark:bg-neutral-800 dark:text-neutral-100",
          tooLong
            ? "border-red-500 focus:border-red-500 dark:border-red-500"
            : "border-neutral-300 focus:border-neutral-500 dark:border-neutral-600",
          className,
        )}
      />
      {tooLong ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400"
        >
          {maxLengthError}
        </p>
      ) : (
        <p id={errorId} className="mt-1 text-right text-[11px] text-neutral-500 dark:text-neutral-400">
          {charsLeftLabel.replace("{n}", String(PROJECT_NAME_MAX_LENGTH - length))}
        </p>
      )}
    </div>
  );
};
