"use client";

import { Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslate } from "@/hooks/useTranslate";
import type { CompanyMember } from "@/lib/cdp/directoryClient";
import { preciseUpdatedAt, relativeUpdatedAt } from "@/lib/skills/updatedAt";
import { cn } from "@/lib/utils";

import { AvatarFacetSelect } from "../../../AvatarStudio/shared/AvatarFacetSelect";
import { FlowEmptyState } from "../../components/FlowEmptyState";

import {
  GENERATION_OUTCOMES,
  GENERATIONS_PAGE_SIZES,
  STATUS_TONE,
} from "../constants";
import { useGenerations } from "../hooks/useGenerations";
import { useUsageFacets } from "../hooks/useUsageFacets";
import { useUsageMembers } from "../hooks/useUsageMembers";
import { useUsageGenerationsState } from "../hooks/useUsageUiState";
import { CursorPager } from "./CursorPager";
import { LedgerTabs } from "./LedgerTabs";
import { MemberCell, memberDisplay } from "./MemberCell";
import type { UsageGenerationsFilters, UsageTab } from "../types";
import type {
  Generation,
  GenerationCreditOutcome,
  GenerationPlatform,
  UsageFacetOption,
} from "../usage-analytics.service";

// US-05: the job ledger. The tab strip keeps the mockup's Generations | Team |
// Credits shape, with the two deferred tabs visible-but-disabled (Community's
// treatment) so nothing dead-ends while US-07 waits.
//
// The rows carry no selection column: nothing bulk-acts on a generation, and a
// tick that leads nowhere is furniture. It was removed rather than disabled.


function toOptions(list: UsageFacetOption[] | undefined) {
  return (list ?? []).map((option) => ({ value: option.id, label: option.name }));
}

/**
 * The member facet, named from the roster.
 *
 * The facet endpoint answers in ids, like the ledger does — so the picker was
 * offering the same UUIDs the column was printing. The VALUE stays the id
 * (it is what the API takes as `user_id`); only the label is resolved, and an
 * id the roster does not know keeps the elided form the row shows, so the
 * picker and the column never disagree about who a row belongs to.
 */
function toMemberOptions(
  list: UsageFacetOption[] | undefined,
  members: Map<string, CompanyMember>,
) {
  return (list ?? []).map((option) => ({
    value: option.id,
    label: memberDisplay(option.id, members).label,
  }));
}

function CreditsCell({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-neutral-400 tabular-nums dark:text-neutral-500">0</span>;
  }
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()}
    </span>
  );
}

/**
 * The status, as plain text in the row's own rhythm rather than a badge.
 *
 * The design draws it unfilled — the column is read down, and seven tinted
 * capsules in a row pull the eye off the figures beside them. The TONE stays:
 * a failure and a still-running job are the two states a reader is scanning
 * for, so they keep their colour where a success takes the table's ink.
 */
function StatusText({ status, label }: { status: Generation["status"]; label: string }) {
  return <span className={cn("text-[13px] font-medium", STATUS_TONE[status])}>{label}</span>;
}

/** The shared cell rhythm: the design's roomy rows, set once. The side padding
 *  matches the card header's, so the first column starts under the title. */
const CELL = "px-4 py-3.5 text-[13px]";
/** The gutters the table keeps against the card's edges. */
const FIRST_CELL = "pl-5";
const LAST_CELL = "pr-5";

function GenerationRow({
  row,
  members,
}: {
  row: Generation;
  members: Map<string, CompanyMember>;
}) {
  const { t, lang } = useTranslate();
  const relative = relativeUpdatedAt(row.completedAt, lang);
  const precise = preciseUpdatedAt(row.completedAt, lang);

  return (
    <TableRow className="border-neutral-100 hover:bg-neutral-50/70 dark:border-neutral-800 dark:hover:bg-neutral-800/40">
      <TableCell
        className={cn(CELL, FIRST_CELL, "whitespace-nowrap text-neutral-600 dark:text-neutral-400")}
      >
        <span title={precise ?? undefined}>{relative ?? "—"}</span>
      </TableCell>
      <TableCell className={cn(CELL, "font-medium text-neutral-900 dark:text-neutral-100")}>
        {/* The label drops the router and the release channel; the raw id the
            charge was booked against stays reachable as the tooltip. */}
        <span title={row.modelId || undefined}>{row.modelName || "—"}</span>
      </TableCell>
      <TableCell className={cn(CELL, "text-neutral-600 dark:text-neutral-400")}>
        {/* The wire verb ("image.generate") is normalized to a sentence in the
            api layer; the raw value the facet filters on stays on the title. */}
        <span title={row.featureId || undefined}>{row.featureName || "—"}</span>
      </TableCell>
      <TableCell className={CELL}>
        <div className="flex flex-col items-start gap-1">
          <StatusText status={row.status} label={t(`usageAnalytics.status.${row.status}`)} />
          {/* A failed job says what happened to its credits — the acceptance
              criterion that keeps "was I charged for that?" out of support. */}
          {row.status === "failed" ? (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {t(`usageAnalytics.status.${row.creditOutcome}`)}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className={cn(CELL, "text-neutral-600 dark:text-neutral-400")}>
        {/* `userName` is the id the cost book stored — the roster is what turns
            it into a person. */}
        <MemberCell id={row.userId} members={members} fallbackName={row.userName} />
      </TableCell>
      <TableCell className={cn(CELL, "text-right")}>
        <CreditsCell value={row.credits} />
      </TableCell>
      <TableCell className={cn(CELL, LAST_CELL, "text-neutral-600 dark:text-neutral-400")}>
        {t(`usageAnalytics.platform.${row.platform}`)}
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <TableRow key={index} aria-busy="true" className="border-neutral-100 dark:border-neutral-800">
          {Array.from({ length: 7 }, (_, cell) => (
            <TableCell
              key={cell}
              className={cn(CELL, cell === 0 && FIRST_CELL, cell === 6 && LAST_CELL)}
            >
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function GenerationsPanel() {
  const { t } = useTranslate();
  const { facets } = useUsageFacets();
  const { members } = useUsageMembers();
  const { filters, limit, patchFilters: onFiltersChange, setLimit } =
    useUsageGenerationsState();
  const {
    page: result,
    pageNumber,
    isLoading,
    isFetching,
    failed,
    retry,
    goNext,
    goPrev,
  } = useGenerations();

  const tabs = [
    { value: "generations", label: t("usageAnalytics.tabs.generations") },
    { value: "team", label: t("usageAnalytics.tabs.team"), disabled: true },
    { value: "credits", label: t("usageAnalytics.tabs.credits"), disabled: true },
  ] satisfies { value: UsageTab; label: string; disabled?: boolean }[];

  const hasFilters =
    filters.users.length +
      filters.features.length +
      filters.models.length +
      filters.platforms.length +
      filters.outcomes.length >
    0;

  // Column order is the design's. Credits sits between User and Platform and
  // stays right-aligned: it is the only numeric column, and figures compare by
  // their last digit, not their first.
  const columns = [
    { label: t("usageAnalytics.table.completed"), numeric: false },
    { label: t("usageAnalytics.table.model"), numeric: false },
    { label: t("usageAnalytics.table.feature"), numeric: false },
    { label: t("usageAnalytics.table.status"), numeric: false },
    { label: t("usageAnalytics.table.user"), numeric: false },
    { label: t("usageAnalytics.table.credits"), numeric: true },
    { label: t("usageAnalytics.table.platform"), numeric: false },
  ];

  const rows = result?.items ?? [];

  const clearFilters = () =>
    onFiltersChange({ users: [], features: [], models: [], platforms: [], outcomes: [] });

  const filterRow = (
    <div className="flex flex-wrap items-center gap-2">
      <AvatarFacetSelect
        label={t("usageAnalytics.filters.users")}
        values={filters.users}
        options={toMemberOptions(facets?.users, members)}
        onChange={(users) => onFiltersChange({ users })}
      />
      <AvatarFacetSelect
        label={t("usageAnalytics.filters.credits")}
        values={filters.outcomes}
        options={GENERATION_OUTCOMES.map((outcome) => ({
          value: outcome,
          label: t(`usageAnalytics.status.${outcome}`),
        }))}
        onChange={(outcomes) =>
          onFiltersChange({ outcomes: outcomes as GenerationCreditOutcome[] })
        }
      />
      <AvatarFacetSelect
        label={t("usageAnalytics.filters.models")}
        values={filters.models}
        options={toOptions(facets?.models)}
        onChange={(models) => onFiltersChange({ models })}
      />
      <AvatarFacetSelect
        label={t("usageAnalytics.filters.features")}
        values={filters.features}
        options={toOptions(facets?.features)}
        onChange={(features) => onFiltersChange({ features })}
      />
      <AvatarFacetSelect
        label={t("usageAnalytics.filters.platform")}
        values={filters.platforms}
        options={(facets?.platforms ?? []).map((platform) => ({
          value: platform,
          label: t(`usageAnalytics.platform.${platform}`),
        }))}
        onChange={(platforms) =>
          onFiltersChange({ platforms: platforms as GenerationPlatform[] })
        }
      />
      {hasFilters ? (
        <button
          type="button"
          onClick={clearFilters}
          className="h-9 rounded-lg px-3 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("usageAnalytics.filters.clear")}
        </button>
      ) : null}
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <LedgerTabs
        tabs={tabs}
        value="generations"
        onChange={() => {}}
        label={t("usageAnalytics.tabs.generations")}
      />

      {/* One card holds the title, the filters, the rows and the pager. The
          states below swap only the BODY: a failed or empty answer must leave
          the filters on screen, or the selection that emptied the list is the
          one thing the reader can no longer undo. */}
      <div
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        data-busy={isFetching ? "true" : undefined}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h3 className="text-[17px] font-semibold text-neutral-900 dark:text-neutral-100">
            {t("usageAnalytics.tabs.generations")}
          </h3>
          {filterRow}
        </header>

        {failed ? (
          <FlowEmptyState
            icon={Inbox}
            title={t("dashboard.state.error")}
            description={t("dashboard.state.retryHint")}
            actionLabel={t("dashboard.state.retry")}
            onAction={() => void retry()}
          />
        ) : !isLoading && result && rows.length === 0 ? (
          <FlowEmptyState
            icon={Inbox}
            title={t("usageAnalytics.tableEmpty.title")}
            description={t("usageAnalytics.tableEmpty.body")}
            actionLabel={hasFilters ? t("usageAnalytics.filters.clear") : undefined}
            onAction={hasFilters ? clearFilters : undefined}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-100 hover:bg-transparent dark:border-neutral-800">
                  {columns.map((column, index) => (
                    <TableHead
                      key={column.label}
                      className={cn(
                        // Small caps at caption size: the design's header is a
                        // label row for the columns, not a row of the table.
                        "px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500",
                        index === 0 && FIRST_CELL,
                        index === columns.length - 1 && LAST_CELL,
                        column.numeric && "text-right",
                      )}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && "opacity-60 transition-opacity")}>
                {isLoading ? (
                  <SkeletonRows />
                ) : (
                  rows.map((row) => (
                    <GenerationRow key={row.id} row={row} members={members} />
                  ))
                )}
              </TableBody>
            </Table>

            {result && rows.length > 0 ? (
              <CursorPager
                page={pageNumber}
                hasPrev={result.hasPrev}
                hasNext={result.hasNext}
                busy={isFetching}
                pageSize={limit}
                pageSizes={GENERATIONS_PAGE_SIZES}
                onPageSize={setLimit}
                onPrev={goPrev}
                onNext={goNext}
                labels={{
                  prev: t("usageAnalytics.pager.prev"),
                  next: t("usageAnalytics.pager.next"),
                  page: t("usageAnalytics.pager.page"),
                  rowsPerPage: t("usageAnalytics.pager.rowsPerPage"),
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
