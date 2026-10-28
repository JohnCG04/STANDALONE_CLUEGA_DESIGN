import { queryOptions } from "@tanstack/react-query";

import { getUserOnboardingStatus } from "./client";

/** Invalidate this after anything that changes the user's onboarding answers. */
export const USER_ONBOARDING_STATUS_QUERY_KEY = ["user-onboarding", "status"] as const;

/**
 * The current user's onboarding answers, as a shared query.
 *
 * `staleTime: 0` on purpose, against the provider's Infinity default: the
 * answers can be changed from outside Settings (the personalization page, an
 * approved profile proposal), and a remount of the reader is the cheap moment to
 * pick that up. The cached copy still renders first, so nothing flickers.
 * `retry: false` so a failed read settles into its error state at once.
 */
export const userOnboardingStatusQuery = queryOptions({
  queryKey: USER_ONBOARDING_STATUS_QUERY_KEY,
  queryFn: getUserOnboardingStatus,
  staleTime: 0,
  retry: false,
});
