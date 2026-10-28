/**
 * What an attached asset is FOR (PRD: Multimodal Creative Asset Attachment).
 *
 * Distinct from `AttachmentKind`, which says what the file IS. A TikTok trend
 * reference is an *image* (its cover frame) playing the *referenceVideo* role —
 * the corpus exposes no downloadable video — so a role derived from the MIME
 * type or the extension is structurally unable to express it. Roles are stored,
 * never inferred.
 */

import type { AttachmentKind } from "@/lib/stores/useComposerAttachmentStore";
import type { CreativeTab } from "@/lib/stores/useCreativeComposerStore";
import { MAX_REFERENCE_VIDEOS, MAX_STYLE_REFERENCES } from "./uploadRules";

export type AttachmentRole =
  | "product"
  | "referenceVideo"
  | "referenceAudio"
  /** A published ad whose LOOK this render borrows (PRD IMG-03). Distinct from
   *  `product` because it is the opposite instruction — keep its composition,
   *  lighting, grade and mood, and keep nothing of what it shows — and distinct
   *  from `referenceVideo` because a still has no motion to imitate. */
  | "styleReference";

export const ATTACHMENT_ROLES: readonly AttachmentRole[] = [
  "product",
  "referenceVideo",
  "referenceAudio",
  "styleReference",
];

/** How many of each role a surface accepts. A missing entry means "no limit of
 *  its own" and falls back to the surface-wide cap. */
export type RoleCaps = Partial<Record<AttachmentRole, number>>;

/** PRD: ≤9 product images + the request's reference-video budget (+1 audio in
 *  Video mode). The video number comes from `uploadRules` so the UI cannot offer
 *  more than the backend accepts. */
export const CREATIVE_ROLE_CAPS: Record<CreativeTab, RoleCaps> = {
  agent: {
    product: 9,
    referenceVideo: MAX_REFERENCE_VIDEOS,
    referenceAudio: 1,
    styleReference: MAX_STYLE_REFERENCES,
  },
  video: { product: 9, referenceVideo: MAX_REFERENCE_VIDEOS, referenceAudio: 1 },
  // The Image tab generates a still: a motion reference has nothing to say to it.
  // Its product budget is the PRD's full 9, same as the other generating tabs —
  // media-ai caps a request at 9 product images (`materials.max_product_images`,
  // a 10th is a 422) and the default image model reads 14 references, so a
  // smaller number here was the UI refusing what the backend already accepts.
  // The Image tab takes a style reference and still refuses a motion one: an ad
  // to imitate is exactly what a still can borrow, its pacing is not.
  image: {
    product: 9,
    referenceVideo: 0,
    referenceAudio: 0,
    styleReference: MAX_STYLE_REFERENCES,
  },
};

/** Roles that hold exactly one asset when no explicit budget says otherwise —
 *  used only by the surfaces with `roleCaps: null` (chat, canvas, workflow). */
export const SINGLE_SLOT_ROLES: readonly AttachmentRole[] = [
  "referenceVideo",
  "referenceAudio",
  "styleReference",
];

export const isSingleSlotRole = (role: AttachmentRole): boolean =>
  SINGLE_SLOT_ROLES.includes(role);

/**
 * Whether a new pick REPLACES the held asset instead of being rejected.
 *
 * Replace-on-pick is what makes a one-slot role feel right: choosing a different
 * trend IS the gesture for changing it, and rejecting the second pick would look
 * broken. But it only makes sense while the budget really is one — with room for
 * three, silently evicting the first is data loss. So the budget decides, and
 * `isSingleSlotRole` remains the answer for a surface that publishes no budget.
 */
export const roleReplacesOnFull = (
  role: AttachmentRole,
  roleCaps: RoleCaps | null,
): boolean => (roleCaps ? roleCaps[role] === 1 : isSingleSlotRole(role));

/**
 * Surface-wide cap implied by a role budget: the sum of its entries.
 *
 * Admission checks the role cap first and the surface cap second
 * (`attachmentAdmission.ts`), so a hand-written surface cap BELOW the role sum
 * silently steals slots from whichever role the user fills last: with 9 product
 * images attached and a surface cap of 9, the reference video was rejected even
 * though its own budget was free. Deriving the number is what makes "9 products
 * AND a reference video" mean what it says.
 *
 * An absent role counts as 0, so this is only meaningful for a budget that names
 * every role — which the creative tabs do, and chat (`roleCaps: null`) does not
 * use at all.
 */
export function surfaceCapFor(roleCaps: RoleCaps): number {
  return ATTACHMENT_ROLES.reduce(
    (total, role) => total + (roleCaps[role] ?? 0),
    0,
  );
}

/**
 * Default role for a file picked without an explicit one.
 *
 * Only a fallback, for surfaces (chat, canvas) that have no notion of roles: a
 * video file becomes the style reference, audio the audio reference, anything
 * else a product image.
 */
export function roleFromKind(kind: AttachmentKind): AttachmentRole {
  if (kind === "video") return "referenceVideo";
  if (kind === "audio") return "referenceAudio";
  return "product";
}

const MENTION_PREFIX: Record<AttachmentRole, string> = {
  product: "product",
  referenceVideo: "trend",
  referenceAudio: "audio",
  styleReference: "style",
};

/**
 * The `@` token for an asset: role prefix + 1-based ordinal within the role.
 *
 * Also the label rendered on the attachment chip, so the token a user types and
 * the thumbnail they see are literally the same string. The backend expands it
 * (`app/materials/mentions.py`) and falls back to positional order, so an
 * ordinal that matches the send order is what makes that fallback correct.
 */
export function mintMentionName(role: AttachmentRole, ordinal: number): string {
  return `${MENTION_PREFIX[role]}-${Math.max(1, ordinal)}`;
}

/** Role each mention prefix belongs to — the inverse of `mintMentionName`. */
export function roleFromMentionName(name: string): AttachmentRole | null {
  const prefix = name.split("-")[0]?.toLowerCase() ?? "";
  const found = ATTACHMENT_ROLES.find(
    (role) => MENTION_PREFIX[role] === prefix,
  );
  return found ?? null;
}
