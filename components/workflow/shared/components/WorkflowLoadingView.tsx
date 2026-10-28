'use client';

import { useTranslate } from '@/hooks/useTranslate';

/** Its own module on purpose: imported via the editor, it would drag the editor into /flow. */
export function WorkflowLoadingView() {
  const { t } = useTranslate();

  return (
    <div
      // Paints its own background: it stands in for a whole route, and /flow's shell is dark.
      className="flex h-full w-full items-center justify-center bg-white px-6 dark:bg-neutral-950"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-5">
        <img
          // A file, not inlined: its SMIL plays in an <img>, and its ids would clash with ours.
          src="/images/ai-sphere.svg"
          alt=""
          aria-hidden="true"
          className="size-12 shrink-0 select-none"
          draggable={false}
        />
        <div className="flex flex-col gap-1">
          <div className="text-[20px] font-medium leading-tight text-neutral-900 dark:text-neutral-50">
            {t('appChat.flow.loading.title')}
          </div>
          <p className="text-[13px] leading-tight text-neutral-400 dark:text-neutral-500">
            {t('appChat.flow.loading.description')}
          </p>
        </div>
      </div>
    </div>
  );
}
