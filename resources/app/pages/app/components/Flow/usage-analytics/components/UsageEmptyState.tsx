"use client";

import { ChartColumn } from "lucide-react";
import { useRouter } from "next/navigation";

import { useTranslate } from "@/hooks/useTranslate";
import { FLOW_HOME_ROUTE } from "@/lib/flow/flowWorkspaceTab";

import { FlowEmptyState } from "../../components/FlowEmptyState";
import { useUsageRange } from "../hooks/useUsageUiState";

// US-01's third criterion: an account with nothing to show sees an invitation,
// not a grid of zeros that reads like a broken dashboard.
//
// Which invitation depends on the RANGE, because the flag behind this state is
// window-scoped (derivedActivity): over "All time" a blank answer really does
// mean the account has never generated anything, so the CTA is the shortest
// path to the first design. Over any bounded window it means only that this
// window is quiet — the account may have been busy last month — so the copy
// points at the pill above instead of inviting a first design that already
// happened. It reads the range itself rather than taking it as a prop, so the
// page container keeps subscribing to nothing but the overview.
export function UsageEmptyState() {
  const { t } = useTranslate();
  const router = useRouter();
  const { rangeKey } = useUsageRange();

  if (rangeKey !== "all_time") {
    return (
      <FlowEmptyState
        icon={ChartColumn}
        title={t("usageAnalytics.empty.rangeTitle")}
        description={t("usageAnalytics.empty.rangeBody")}
      />
    );
  }

  return (
    <FlowEmptyState
      icon={ChartColumn}
      title={t("usageAnalytics.empty.title")}
      description={t("usageAnalytics.empty.body")}
      actionLabel={t("usageAnalytics.empty.cta")}
      onAction={() => router.push(FLOW_HOME_ROUTE)}
    />
  );
}
