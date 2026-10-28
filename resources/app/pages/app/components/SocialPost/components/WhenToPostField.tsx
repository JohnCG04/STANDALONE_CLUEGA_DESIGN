"use client";

import { useTranslate } from "@/hooks/useTranslate";
import { Input } from "@/components/ui/input";
import { SCHEDULE_SEED_OFFSET_MS } from "../constants";
import { toDatetimeLocalValue } from "../helpers";

/**
 * Post now, or at a time. Native radios sharing one `name` so the arrow keys
 * work without pulling a RadioGroup primitive in for two options; `accent-*`
 * matches the blue the checkboxes select with.
 *
 * The input holds a zoneless local string — the submit stamps the user's zone
 * on it. There is no timezone picker because there is nothing to send one to.
 */
export function WhenToPostField({
  error,
  onChange,
  scheduleAt,
}: {
  /** Why the chosen time cannot be used (a platform's scheduling window). */
  error?: string | null;
  onChange: (value: string | null) => void;
  scheduleAt: string | null;
}) {
  const { t } = useTranslate();

  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-foreground">
        {t("appChat.socialPost.scheduleTimeLabel")}
      </div>
      <div
        role="radiogroup"
        aria-label={t("appChat.socialPost.scheduleTimeLabel")}
        className="flex flex-wrap items-center gap-4"
      >
        <label className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="radio"
            name="social-post-when"
            className="size-4 accent-blue-500"
            checked={scheduleAt === null}
            onChange={() => onChange(null)}
          />
          {t("appChat.socialPost.postNow")}
        </label>
        <label className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="radio"
            name="social-post-when"
            className="size-4 accent-blue-500"
            checked={scheduleAt !== null}
            onChange={() =>
              onChange(
                toDatetimeLocalValue(new Date(Date.now() + SCHEDULE_SEED_OFFSET_MS)),
              )
            }
          />
          {t("appChat.socialPost.schedule")}
        </label>
      </div>
      {scheduleAt !== null ? (
        <Input
          type="datetime-local"
          value={scheduleAt}
          aria-label={t("appChat.socialPost.scheduleTimeInputLabel")}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="mt-2 w-auto text-[13px]"
        />
      ) : null}
      {scheduleAt !== null && error ? (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
