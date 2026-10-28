import type { SocialPostNodeInput } from "@dogclaw-ad/workflow";

import type { AssetRef } from "@/lib/creative/assetRef";
import type { SocialPlatform } from "@/lib/social-posts/client";
import { SOCIAL_PLATFORMS } from "@/lib/social-posts/platforms";
import { TIKTOK_DEFAULT_SETTINGS } from "@/lib/social-posts/tiktokRules";
import type {
  SocialPostContext,
  SocialPostState,
} from "@/resources/app/pages/app/components/SocialPost/store";

import { toSocialAssetRef } from "../actions/postToSocial";
import { MAX_SAVED_POSTS } from "./constants";
import type { SavedDraft, SavedPostRef, SavedSocialPost } from "./types";

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
const platformsOf = (value: unknown) =>
  strings(value)?.filter((id): id is SocialPlatform =>
    SOCIAL_PLATFORMS.some((platform) => platform.id === id),
  );

/** `data.post` as the node saved it; anything malformed reads as absent. */
export function readSaved(raw: Record<string, unknown> | undefined): SavedSocialPost {
  const posts = Array.isArray(raw?.posts)
    ? (raw.posts as unknown[]).flatMap((item) => {
        const post = item as { id?: unknown; at?: unknown } | null;
        const id = str(post?.id);
        return id ? [{ id, at: str(post?.at) ?? "" }] : [];
      })
    : undefined;
  return {
    v: 1,
    owner: str(raw?.owner),
    platforms: platformsOf(raw?.platforms),
    caption: str(raw?.caption),
    hashtags: strings(raw?.hashtags),
    accountKeys: strings(raw?.accountKeys),
    scheduleAt: str(raw?.scheduleAt) ?? null,
    facebookLink: str(raw?.facebookLink),
    media: strings(raw?.media),
    posts,
  };
}

/** The posts this node made; a duplicate's copy of them belongs to the original node. */
export function ownPosts(saved: SavedSocialPost, nodeId: string): SavedPostRef[] {
  return saved.owner === nodeId ? (saved.posts ?? []) : [];
}

/** One comparable string per draft, the same whether it came from the store or the save. */
export function draftKey(draft: SavedDraft): string {
  return JSON.stringify([
    draft.platforms ?? [],
    draft.caption ?? null,
    draft.hashtags ?? [],
    draft.accountKeys ?? [],
    draft.scheduleAt ?? null,
    draft.facebookLink ?? "",
    draft.media ?? [],
  ]);
}

/** The draft as the form holds it; picks not yet resolvable stay saved as they were. */
export function draftOf(
  state: Pick<
    SocialPostState,
    "draft" | "selectedAssets" | "selectedAccounts" | "selectedPlatforms" | "scheduleAt"
  >,
  pendingKeys: readonly string[],
  savedMedia: readonly string[] | undefined,
): SavedDraft {
  const selectedKeys = state.selectedAccounts.map((account) => account.accountKey);
  const link = state.draft?.settings?.link;
  return {
    platforms: state.selectedPlatforms,
    // No draft yet means nothing was written: a saved caption of "" would block the seed.
    ...(state.draft
      ? { caption: state.draft.caption, hashtags: state.draft.hashtags }
      : {}),
    accountKeys: [...selectedKeys, ...pendingKeys.filter((key) => !selectedKeys.includes(key))],
    scheduleAt: state.scheduleAt,
    facebookLink: typeof link === "string" ? link : "",
    media: state.selectedAssets.length
      ? state.selectedAssets.map((asset) => asset.url)
      : [...(savedMedia ?? [])],
  };
}

/** `prev` with this draft, owned by `nodeId`; another node's posts are dropped. */
export function withDraft(
  prev: Record<string, unknown> | undefined,
  nodeId: string,
  draft: SavedDraft,
): SavedSocialPost {
  return { ...draft, v: 1, owner: nodeId, posts: ownPosts(readSaved(prev), nodeId) };
}

/** `prev` with a new post on top, keeping the newest `MAX_SAVED_POSTS`. */
export function withPost(
  prev: Record<string, unknown> | undefined,
  nodeId: string,
  post: SavedPostRef,
): SavedSocialPost {
  const saved = readSaved(prev);
  const rest = ownPosts(saved, nodeId).filter((item) => item.id !== post.id);
  return { ...saved, owner: nodeId, posts: [post, ...rest].slice(0, MAX_SAVED_POSTS) };
}

/** The ready inputs as the flow's media pool, wire by wire; null while none is ready. */
export function contextOf(inputs: readonly SocialPostNodeInput[]): SocialPostContext | null {
  const ready = inputs.filter((input) => input.status === "ready" && input.media);
  const first = ready[0];
  if (!first?.media) return null;
  const candidates: AssetRef[] = [];
  const seen = new Set<string>();
  for (const input of ready) {
    for (const media of input.candidates) {
      const ref = toSocialAssetRef(media, input.kind, input.sourceLabel);
      if (seen.has(ref.url)) continue;
      seen.add(ref.url);
      candidates.push(ref);
    }
  }
  return {
    assetRef: toSocialAssetRef(first.media, first.kind, first.sourceLabel),
    candidates,
    ...(first.prompt ? { sourcePrompt: first.prompt } : {}),
  };
}

/** The picks still on offer, in order; else the first input's media alone. */
export function reconcileSelection(
  context: SocialPostContext | null,
  picked: readonly string[] | undefined,
): AssetRef[] {
  if (!context) return [];
  const pool = context.candidates ?? [context.assetRef];
  const kept = (picked ?? []).flatMap((url) => pool.filter((asset) => asset.url === url));
  return kept.length ? kept : [context.assetRef];
}

/** A saved schedule still ahead of `now`; a passed one falls back to posting now. */
function upcoming(scheduleAt: string | null | undefined, now: Date): string | null {
  if (!scheduleAt) return null;
  const at = Date.parse(scheduleAt);
  return Number.isNaN(at) || at <= now.getTime() ? null : scheduleAt;
}

/** The node's own flow from what it saved: step 1 until platforms are picked, then compose. */
export function seedState(
  saved: SavedSocialPost,
  context: SocialPostContext | null,
  now: Date,
): Partial<SocialPostState> {
  const link = saved.facebookLink ? { link: saved.facebookLink } : {};
  const platforms = saved.platforms ?? [];
  return {
    isOpen: true,
    step: platforms.length ? "compose" : "platform",
    context,
    selectedAssets: reconcileSelection(context, saved.media),
    selectedPlatforms: platforms,
    // Saved accounts come back once their rows can be ticked (`useRestoreAccounts`).
    selectedAccounts: [],
    // TikTok's settings always restart from the defaults: privacy is the creator's pick each time.
    draft:
      saved.caption === undefined
        ? null
        : {
            caption: saved.caption,
            hashtags: saved.hashtags ?? [],
            settings: { ...TIKTOK_DEFAULT_SETTINGS, ...link },
          },
    scheduleAt: upcoming(saved.scheduleAt, now),
  };
}

/** The saved draft laid over the live store, for an undo or redo of the node's data. */
export function restoredDraft(
  state: Pick<SocialPostState, "draft" | "context" | "step">,
  saved: SavedSocialPost,
  now: Date,
): Pick<
  SocialPostState,
  "draft" | "selectedAssets" | "selectedPlatforms" | "scheduleAt" | "step"
> {
  const seeded = seedState(saved, state.context, now);
  const draft =
    seeded.draft && state.draft
      ? {
          ...seeded.draft,
          settings: { ...state.draft.settings, link: saved.facebookLink ?? "" },
        }
      : (seeded.draft ?? state.draft);
  return {
    draft,
    selectedAssets: seeded.selectedAssets ?? [],
    selectedPlatforms: seeded.selectedPlatforms ?? [],
    scheduleAt: seeded.scheduleAt ?? null,
    // Compose renders the chosen platforms' accounts; with none left there is nothing to show.
    step: seeded.selectedPlatforms?.length ? state.step : "platform",
  };
}
