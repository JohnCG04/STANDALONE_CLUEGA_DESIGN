"use client";

import { useCallback, useRef } from "react";

import { FlowPageShell } from "../../components/FlowPageShell";
import { CreditsSummaryCard } from "../components/CreditsSummaryCard";
import { CreditsUsageCard } from "../components/CreditsUsageCard";
import { GenerationsPanel } from "../components/GenerationsPanel";
import { LowCreditBanner } from "../components/LowCreditBanner";
import { ModelsUsageCard } from "../components/ModelsUsageCard";
import { StatCardsRow } from "../components/StatCardsRow";
import { UsageAnalyticsHeader } from "../components/UsageAnalyticsHeader";
import { UsageRangePicker } from "../components/UsageRangePicker";
import { UsageEmptyState } from "../components/UsageEmptyState";
import { useUsageGenerationsState } from "../hooks/useUsageUiState";
import { useUsageOverview } from "../hooks/useUsageOverview";

// The Usage Analytics workspace tab of /flow (`?tab=usage`) — the
// credit-usage dashboard (PRD "Usage Analytics", US-01 → US-06). It tracks Flow
// only, which is why it is a Flow tab reached from the Flow sidebar rather than
// an AppView of its own.
//
// This container holds NO state. Every slice of it — the range, the two filter
// sets, the ledger's cursor — lives in the SWR cache (useUsageUiState), and each
// block subscribes to the slices it actually reads. That is what keeps the
// charts still: with the state here, one keystroke in a ledger filter re-rendered
// this component and therefore every block under it, and Chart.js rebuilt two
// canvases nobody had asked to change. Now a page step re-renders the table, a
// chart facet re-renders the charts, and neither reaches the other.
//
// It is also why the blocks take (almost) no props: a prop is a subscription
// held by the parent, so passing data down would put the re-render back.
export function UsageAnalyticsPage() {
  const generationsRef = useRef<HTMLDivElement>(null);
  const { patchFilters } = useUsageGenerationsState();
  const overview = useUsageOverview();

  // US-03 → US-05: a model row opens the ledger filtered to that model. Same
  // page, so it is a cache write plus a scroll — no route round-trip. Stable
  // across renders, so ModelsUsageCard's one prop never invalidates its memo.
  const selectModel = useCallback(
    (modelId: string) => {
      patchFilters({ models: [modelId] });
      requestAnimationFrame(() => {
        generationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [patchFilters],
  );

  // Only a LOADED "nothing here" answer shows the empty state; while the
  // overview is pending the cards show skeletons, not a premature welcome.
  //
  // The flag is WINDOW-scoped (see derivedActivity), so this is "no activity in
  // the selected range" — which is why the picker stays above it: the reader's
  // next move is almost always to widen the range, and it used to be the one
  // control the empty state took away.
  const isWindowEmpty = overview.overview?.hasAnyActivity === false;

  return (
    <FlowPageShell>
      <div className="flex flex-col gap-6">
        <UsageAnalyticsHeader />
        <LowCreditBanner />

        {/* One control, left-aligned above the blocks it cuts — the presets,
            the custom range and the granularity note all live behind it. */}
        <div className="flex">
          <UsageRangePicker />
        </div>

        {isWindowEmpty ? (
          <UsageEmptyState />
        ) : (
          <>
            <StatCardsRow />
            <CreditsUsageCard />

            <div className="grid gap-4 md:grid-cols-2">
              <ModelsUsageCard onModelSelect={selectModel} />
              <CreditsSummaryCard />
            </div>

            <div ref={generationsRef} className="scroll-mt-6">
              <GenerationsPanel />
            </div>
          </>
        )}
      </div>
    </FlowPageShell>
  );
}
