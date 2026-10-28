import { useCallback, useEffect, useMemo, useState } from "react";

import { CdpApiError } from "@/lib/cdp";
import { getTikTokCreatorInfo } from "@/lib/integrations/client";
import type { TikTokCreatorInfo } from "@/lib/social-posts/tiktokRules";
import type { CreatorState } from "../types";

// TikTok's "not now" answers: the account works, it just may not post at this moment.
const CANNOT_POST_CODES: ReadonlySet<string> = new Set([
  "tiktok_creator_cannot_post",
  "rate_limited",
]);

/** One selected account's live read, keyed by the id creator-info is addressed
 *  by. */
export type CreatorReads = Record<string, CreatorState>;

export type TikTokCreatorsState = {
  /** The combined verdict the shared settings are rendered from. */
  creator: CreatorState;
  /** Per account, so the account list can mark which one failed. */
  byAccount: CreatorReads;
  /** The accounts that came back ready, in selection order — what the compose
   *  step names as "posting to". */
  ready: { accountId: string; info: TikTokCreatorInfo }[];
  retry: () => void;
};

/**
 * The creator-info read TikTok requires immediately before the compose UI, for
 * EVERY selected account — and forbids caching, so this is one live request per
 * account each time the step mounts.
 *
 * Why it must be per account rather than once: the privacy options, the
 * interaction switches and the duration cap are that creator's CURRENT
 * settings. A private account offers `FOLLOWER_OF_CREATOR` where a public one
 * offers `PUBLIC_TO_EVERYONE`, so a level read from one account and posted to
 * another is exactly the rejection TikTok's guidelines exist to prevent.
 *
 * `accountIds` must be a stable array (memoize it upstream) — a fresh array
 * every render would re-fire the reads.
 */
export function useTikTokCreators(
  enabled: boolean,
  accountIds: readonly string[],
): TikTokCreatorsState {
  const [reads, setReads] = useState<CreatorReads>({});
  const [reloadKey, setReloadKey] = useState(0);
  const key = accountIds.join(",");

  useEffect(() => {
    if (!enabled || accountIds.length === 0) return;
    const controller = new AbortController();
    setReads(
      Object.fromEntries(
        accountIds.map((id) => [id, { status: "loading" } as CreatorState]),
      ),
    );
    for (const accountId of accountIds) {
      void getTikTokCreatorInfo(accountId, controller.signal)
        .then((info) => {
          if (controller.signal.aborted) return;
          setReads((prev) => ({ ...prev, [accountId]: { status: "ready", info } }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          // 410: the connection is no longer active. 401: TikTok rejected the
          // token and the row was flipped to expired. Both mean "connect
          // again", which is a different instruction from "try again".
          const status = error instanceof CdpApiError ? error.status : 0;
          const cannotPost =
            error instanceof CdpApiError && CANNOT_POST_CODES.has(error.code);
          setReads((prev) => ({
            ...prev,
            [accountId]: {
              status: "error",
              reconnect: status === 401 || status === 410,
              ...(cannotPost ? { cannotPost: true, message: error.message } : {}),
            },
          }));
        });
    }
    return () => controller.abort();
    // `key` stands in for the id array: a new array with the same ids must not
    // re-fire TikTok's uncacheable reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const byAccount = useMemo<CreatorReads>(() => {
    if (!enabled) return {};
    return Object.fromEntries(
      accountIds.map((id) => [id, reads[id] ?? { status: "loading" }]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, reads]);

  const ready = useMemo(
    () =>
      accountIds
        .map((accountId) => ({ accountId, read: byAccount[accountId] }))
        .filter(
          (entry): entry is { accountId: string; read: { status: "ready"; info: TikTokCreatorInfo } } =>
            entry.read?.status === "ready",
        )
        .map((entry) => ({ accountId: entry.accountId, info: entry.read.info })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, byAccount],
  );

  const creator = useMemo<CreatorState>(
    () => combineCreatorReads(accountIds, byAccount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, byAccount],
  );

  return { creator, byAccount, ready, retry };
}

/**
 * Fold the per-account reads into the one verdict the SHARED settings are
 * rendered from.
 *
 * The combination is deliberately the strictest reading, because one caption
 * and one set of settings go to every selected account:
 *
 *   - privacy options are INTERSECTED, so the level offered is one that every
 *     account allows. Without this, picking "Public" with a public and a
 *     private account selected would fail the private one at publish — after
 *     the post was already spent on the other.
 *   - a disabled interaction on ANY account disables it for all: the setting
 *     is shared, and TikTok rejects a post that enables what the creator
 *     switched off.
 *   - the duration cap is the SMALLEST of the caps, for the same reason.
 *
 * Identity (username, nickname, avatar) comes from the first ready account —
 * the phone preview shows one handle, and it is the first one the user picked.
 */
export function combineCreatorReads(
  accountIds: readonly string[],
  byAccount: CreatorReads,
): CreatorState {
  if (accountIds.length === 0) return { status: "idle" };
  const reads = accountIds.map((id) => byAccount[id] ?? { status: "loading" });

  // An error anywhere blocks the post: the settings on screen would not apply
  // to the account that failed, and posting to "the ones that worked" is a
  // decision for the user to make by deselecting, not for this fold to make
  // silently.
  const errors = reads.filter(
    (read): read is Extract<CreatorState, { status: "error" }> => read.status === "error",
  );
  if (errors.length > 0) {
    const cannotPost = errors.find((read) => read.cannotPost);
    return {
      status: "error",
      reconnect: errors.some((read) => read.reconnect),
      ...(cannotPost ? { cannotPost: true, message: cannotPost.message } : {}),
    };
  }
  if (reads.some((read) => read.status !== "ready")) return { status: "loading" };

  const infos = reads
    .filter((read): read is { status: "ready"; info: TikTokCreatorInfo } => read.status === "ready")
    .map((read) => read.info);
  const first = infos[0];
  if (!first) return { status: "loading" };

  const privacyLevelOptions = infos.reduce<string[]>(
    (shared, info) => shared.filter((level) => info.privacyLevelOptions.includes(level)),
    [...first.privacyLevelOptions],
  );
  const caps = infos
    .map((info) => info.maxVideoPostDurationSec)
    .filter((seconds) => seconds > 0);

  return {
    status: "ready",
    info: {
      username: first.username,
      nickname: first.nickname,
      ...(first.avatarUrl ? { avatarUrl: first.avatarUrl } : {}),
      privacyLevelOptions,
      commentDisabled: infos.some((info) => info.commentDisabled),
      duetDisabled: infos.some((info) => info.duetDisabled),
      stitchDisabled: infos.some((info) => info.stitchDisabled),
      maxVideoPostDurationSec: caps.length > 0 ? Math.min(...caps) : 0,
      unaudited: infos.some((info) => info.unaudited),
      // A deployment-wide fact, so any account's answer is everyone's.
      ...(first.publishMode ? { publishMode: first.publishMode } : {}),
    },
  };
}
