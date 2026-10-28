"use client";

import { useTranslate } from "@/hooks/useTranslate";
import type { VirtualCharacterQuota } from "@/lib/virtualCharacters/types";

/** "x / 5 images used": every image (not every character) holds one BytePlus slot. */
export const QuotaMeter = ({ quota }: { quota: VirtualCharacterQuota }) => {
  const { t } = useTranslate();
  const pct = quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 100;
  return (
    <div className="w-full">
      <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
        {t("appChat.characters.quota")
          .replace("{used}", String(quota.used))
          .replace("{limit}", String(quota.limit))}
      </p>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
      >
        <div className="h-full rounded-full bg-neutral-900 transition-[width] duration-500 ease-out dark:bg-neutral-100" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
