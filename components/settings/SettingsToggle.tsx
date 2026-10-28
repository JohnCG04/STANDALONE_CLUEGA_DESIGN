"use client";

import { cn } from "@/lib/utils";

/**
 * The switch's LOOK, with no interactivity of its own.
 *
 * Exists so a whole row can be the switch: a settings row's hit target should be
 * the row, not a 40px control at its edge, and nesting `SettingsToggle`'s button
 * inside a row button is invalid HTML. A caller that renders this must carry the
 * semantics itself (`role="switch"` + `aria-checked` on the row).
 */
export function SettingsToggleTrack({
  checked,
  disabled = false,
  busy = false,
  className,
}: {
  checked: boolean;
  disabled?: boolean;
  /** See SettingsToggle's `busy`. Full contrast, pulsing — not dimmed. */
  busy?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ease-out",
        checked ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700",
        disabled && "opacity-50",
        // No opacity here: a dimmed control reads as unavailable or failed to
        // load, which is the wrong story for one that is merely working — the
        // card learned this when a whole-card fade for "switched off" was read
        // as damage. A pulse reads as work in progress instead. Honoured only
        // where motion is welcome; the wait cursor and aria-busy carry it
        // otherwise.
        busy && "animate-pulse motion-reduce:animate-none",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ease-out",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </span>
  );
}

export function SettingsToggle({
  checked,
  onCheckedChange,
  className,
  disabled = false,
  ariaLabel,
  busy = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  /**
   * What this switch controls, for a caller whose switch has no adjacent text.
   *
   * The track is aria-hidden, so a bare switch announces as "switch, not
   * checked" with no name at all — fine in a settings row that reads its own
   * label aloud, useless in a grid of cards where every switch announces
   * identically. Optional: existing callers sit next to their own label.
   */
  ariaLabel?: string;
  /**
   * A write for this switch is in flight — it is WORKING, not unavailable.
   *
   * Kept apart from `disabled` because they say opposite things. `disabled`
   * greys the track out: "you may not use this". Busy has to say "the state you
   * see is still the true one, and an answer is coming" — so the track keeps
   * full contrast and pulses, and the cursor is a wait rather than a refusal.
   *
   * It blocks the click for a different reason than disabled does: two requests
   * for one switch could resolve out of order and settle on the earlier answer.
   */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "shrink-0",
        disabled && "cursor-not-allowed",
        busy && "cursor-wait",
        className,
      )}
    >
      <SettingsToggleTrack checked={checked} disabled={disabled} busy={busy} />
    </button>
  );
}
