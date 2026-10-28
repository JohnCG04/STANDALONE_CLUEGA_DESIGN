'use client';

import { useState } from 'react';
import { ChevronDown, LayoutGrid, List, Search, Star } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover';
import { useTranslate } from '@/hooks/useTranslate';
import { cn } from '@/lib/utils';

import { SORT_KEYS } from '../constants';
import type { SortKey } from '../hooks/useFlowProjects';
import type { ViewMode } from '../types';

const ViewToggleButton = ({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={label}
    className={cn(
      'flex size-7 items-center justify-center rounded-full transition-colors',
      active
        ? 'bg-neutral-900 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900'
        : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400',
    )}
  >
    {children}
  </button>
);

/** Search, the favorites filter, the sort picker and the grid/list toggle. */
export const ProjectListToolbar = ({
  query,
  onQueryChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (next: boolean) => void;
  sort: SortKey;
  onSortChange: (key: SortKey) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) => {
  const { t } = useTranslate();
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div className="mt-6 flex items-center justify-end">
      <div
        className="flex min-w-0 items-center gap-2"
        data-learn="flow.toolbar"
      >
        <div className="relative w-[280px] min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('appChat.flow.searchPlaceholder')}
            className="h-9 w-full rounded-full border border-neutral-200 bg-white pl-9 pr-3 text-[13px] font-medium text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>

        {/* Favorites filter: `GET /projects?favorite=true`. A pressed pill, not
            a sort option — it narrows the set, it does not order it. */}
        <button
          type="button"
          aria-pressed={favoritesOnly}
          onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
            favoritesOnly
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100/70 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
          )}
        >
          <Star
            className={cn(
              'size-4',
              favoritesOnly && 'fill-amber-400 text-amber-500',
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          {t('appChat.flow.favorites.filter')}
        </button>

        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              {t(`appChat.flow.sort.${sort}`)}
              <ChevronDown
                className="size-4 text-neutral-400"
                strokeWidth={2}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-40 rounded-xl border-neutral-200 p-1 dark:border-neutral-700"
          >
            {SORT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSortChange(key);
                  setSortOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  sort === key
                    ? 'text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                {t(`appChat.flow.sort.${key}`)}
                {sort === key ? (
                  <span className="size-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                ) : null}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
          <ViewToggleButton
            active={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            label={t('appChat.flow.view.grid')}
          >
            <LayoutGrid className="size-4" strokeWidth={2} />
          </ViewToggleButton>
          <ViewToggleButton
            active={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            label={t('appChat.flow.view.list')}
          >
            <List className="size-4" strokeWidth={2} />
          </ViewToggleButton>
        </div>
      </div>
    </div>
  );
};
