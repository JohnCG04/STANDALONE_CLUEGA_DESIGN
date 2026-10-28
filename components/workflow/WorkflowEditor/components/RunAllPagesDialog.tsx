'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/Button';
import { useTranslate } from '@/hooks/useTranslate';
import type { RunAllPageRow } from '../types';

export interface RunAllPagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` while the counts load; empty after a failed read. */
  rows: RunAllPageRow[] | null;
  failed: boolean;
  onConfirm: () => void;
}

/** What Run all pages will touch, in run order, before it spends anything. */
export function RunAllPagesDialog({ open, onOpenChange, rows, failed, onConfirm }: RunAllPagesDialogProps) {
  const { t } = useTranslate();
  const nodes = (n: number) =>
    n === 1 ? t('appChat.flow.run.pageNodesOne') : t('appChat.flow.run.pageNodes').replace('{n}', String(n));
  const total = rows?.reduce((sum, row) => sum + row.nodeCount, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] p-6">
        <DialogTitle>{t('appChat.flow.run.allPagesTitle')}</DialogTitle>
        <DialogDescription className="mt-1">{t('appChat.flow.run.allPagesBody')}</DialogDescription>
        {rows === null ? (
          <p className="mt-4 text-sm text-neutral-500">{t('appChat.flow.run.allPagesLoading')}</p>
        ) : failed ? (
          <p className="mt-4 text-sm text-red-600">{t('appChat.flow.run.allPagesLoadFailed')}</p>
        ) : (
          <>
            <ol className="mt-4 max-h-64 space-y-1 overflow-y-auto text-sm">
              {rows.map((row, index) => (
                <li key={row.id} className="flex justify-between gap-4">
                  <span className="truncate">
                    {index + 1}. {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">{nodes(row.nodeCount)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t pt-3 text-sm font-medium">
              {t('appChat.flow.run.allPagesTotal')
                .replace('{pages}', String(rows.length))
                .replace('{nodes}', String(total))}
            </p>
          </>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            {t('settings.common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!rows?.length || failed}>
            {t('appChat.flow.run.runAllPages')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
