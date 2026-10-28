"use client";

import {
  createApiUsageAnalyticsSource,
  type UsageApiSource,
} from "../usage-analytics.api";

/**
 * The one API client the page's hooks share.
 *
 * Module-level and lazy: the source is stateless, so a second instance would
 * only be a second object, and building it at module load would run before the
 * config it reads.
 */
let source: UsageApiSource | null = null;

export function usageSource(): UsageApiSource {
  source ??= createApiUsageAnalyticsSource();
  return source;
}

/** Test seam: swap the API client for a stub. */
export function setUsageSource(next: UsageApiSource | null): void {
  source = next;
}
