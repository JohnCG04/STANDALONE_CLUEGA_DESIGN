import type { SocialPlatform } from "@/lib/social-posts/client";

/** One post this node created; the node polls its status by `id`. */
export interface SavedPostRef {
  id: string;
  /** When it was created (ISO): how fresh it is decides how often it is re-read. */
  at: string;
}

/** The node's `data.post`. TikTok's audience, interaction and label picks are never kept. */
export type SavedSocialPost = {
  v: 1;
  /** The node that wrote it: a duplicate or paste keeps the draft, not the posts. */
  owner?: string;
  /** Step 1's answer; with one saved, the node reopens on the compose step. */
  platforms?: SocialPlatform[];
  caption?: string;
  hashtags?: string[];
  accountKeys?: string[];
  /** `datetime-local` value, as the schedule field holds it; null posts now. */
  scheduleAt?: string | null;
  facebookLink?: string;
  /** Selected media urls, in carousel order. */
  media?: string[];
  posts?: SavedPostRef[];
};

/** The part of `SavedSocialPost` the form writes back as the user edits. */
export type SavedDraft = Omit<SavedSocialPost, "v" | "owner" | "posts">;
