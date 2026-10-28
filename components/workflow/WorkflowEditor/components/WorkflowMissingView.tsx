'use client';

import { useRouter } from 'next/navigation';
import { FileQuestion } from 'lucide-react';

import { useTranslate } from '@/hooks/useTranslate';
import { FLOW_LIST_ROUTE } from '../constants';

/** A workflow or page that would not load: say so and offer the way back to the list. */
export function WorkflowMissingView() {
  const router = useRouter();
  const { t } = useTranslate();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <FileQuestion className="size-8 text-neutral-300" aria-hidden="true" />
      <div className="text-[15px] font-semibold text-neutral-900">
        {t('appChat.flow.missing.title')}
      </div>
      <p className="max-w-sm text-[13px] text-neutral-500">
        {t('appChat.flow.missing.description')}
      </p>
      <button
        type="button"
        onClick={() => router.push(FLOW_LIST_ROUTE)}
        className="mt-1 inline-flex h-9 items-center rounded-full bg-neutral-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
      >
        {t('appChat.flow.missing.backToList')}
      </button>
    </div>
  );
}
