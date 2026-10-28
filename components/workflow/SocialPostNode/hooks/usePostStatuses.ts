"use client";

import { useQueries } from "@tanstack/react-query";

import {
  getSocialPost,
  isTerminalSocialPost,
  type SocialPostRecord,
} from "@/lib/social-posts/client";
import {
  FAST_POLL_WINDOW_MS,
  POLL_MS,
  SLOW_POLL_MS,
} from "@/resources/app/pages/app/components/SocialPost/constants";

import type { SavedPostRef } from "../types";

/** One post's record; the submit seeds it so the new row shows before the first poll. */
export const socialPostQueryKey = (id: string) => ["social-post", id] as const;

/** The node's posts as the server has them now, re-read until every target settles. */
export function usePostStatuses(posts: readonly SavedPostRef[]): SocialPostRecord[] {
  return useQueries({
    queries: posts.map((post) => ({
      queryKey: socialPostQueryKey(post.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getSocialPost(post.id, signal),
      // A deleted post 404s for good; its row just stays hidden.
      retry: false,
      refetchInterval: (query: { state: { data?: SocialPostRecord } }) => {
        const record = query.state.data;
        if (record && isTerminalSocialPost(record)) return false;
        const fresh = Date.now() - Date.parse(post.at) < FAST_POLL_WINDOW_MS;
        return fresh ? POLL_MS : SLOW_POLL_MS;
      },
    })),
    combine: (results) => results.flatMap((result) => (result.data ? [result.data] : [])),
  });
}
