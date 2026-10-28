/**
 * The generation request the creative composer sends.
 *
 * One contract for both entrypoints (`POST /jobs` and
 * `POST /video-projects/{id}/plan`): every `input_files` entry carries its ROLE,
 * plus one top-level `generation_method`. Roles used to be flattened away here,
 * leaving the backend to re-derive them from the URL extension — which cannot
 * classify an artifact ref (`art_ab12`, no extension) and cannot express a
 * TikTok cover image standing in for a video.
 *
 * Sending no roles and no method is still valid and still means exactly the old
 * behaviour, so nothing outside the creative module has to change.
 */

import type { ComposerAttachment } from "@/lib/stores/useComposerAttachmentStore";
import type { VideoMethod } from "@/lib/stores/useCreativeComposerStore";
import { isHttpUrl, trendWatchUrl } from "@/lib/trends/trendDetail";
import type { AttachmentRole } from "./attachmentRoles";
import { rulesFor, type WireGenerationMethod } from "./videoMethod";

/** Wire spelling of a role (snake_case, as media-ai declares it). */
export type WireRole =
  | "product_image"
  | "reference_video"
  | "reference_audio"
  | "style_reference";

const WIRE_ROLE: Record<AttachmentRole, WireRole> = {
  product: "product_image",
  referenceVideo: "reference_video",
  referenceAudio: "reference_audio",
  styleReference: "style_reference",
};

export type WireAsset = {
  source: string;
  id?: string;
  url: string;
  meta?: Record<string, unknown>;
};

export type WireInputFile = {
  url: string;
  role: WireRole;
  /** The `@name` a prompt can point at — same string as the chip's label. */
  name: string;
  asset?: WireAsset;
};

/**
 * Links the user pasted, sent alongside the materials.
 *
 * The URL, never the resolved page: the backend reads the page itself. The chip
 * preview exists so the user can SEE what was found, not so the client can tell
 * the planner what a product is.
 *
 * `page_image_urls` is empty unless the user deselected one of the page's
 * photos, in which case it lists exactly the ones that survived.
 */
export type CreativeLinks = {
  reference_urls?: string[];
  page_image_urls?: string[];
};

/** Role-typed materials with no method attached — what an image job sends. */
export type CreativeInputFiles = CreativeLinks & {
  input_files: WireInputFile[];
};

export type CreativeGenerationPayload = CreativeInputFiles & {
  generation_method: WireGenerationMethod;
  /** True when the method was CHOSEN (dropdown touched, or a chip/peek armed
   *  it) rather than the composer's untouched default. Sent to the wire as
   *  `generation_method_explicit`; while false the backend's prompt-lane
   *  classifier may override the default. */
  method_explicit?: boolean;
};

export type BuildPayloadArgs = {
  attachments: ComposerAttachment[];
  method: VideoMethod;
  /** See CreativeGenerationPayload.method_explicit. Defaults to false. */
  methodExplicit?: boolean;
  /** Page links on this turn (see `useComposerLinkStore`). */
  referenceUrls?: string[];
  /** The page photos the user kept. Empty = let the backend rank and pick. */
  pageImageUrls?: string[];
};

const isUsable = (item: ComposerAttachment): boolean =>
  item.status !== "error" && Boolean(item.url);

/**
 * Attachments this method actually reads, in the order the user added them.
 *
 * Excluded assets are NOT removed from the composer — the user switched a
 * dropdown, they did not delete a file — they are simply left out of the request
 * and greyed in the strip.
 */
export function usableAttachments(
  attachments: ComposerAttachment[],
  method: VideoMethod,
): ComposerAttachment[] {
  const { uses } = rulesFor(method);
  return attachments.filter(
    (item) => isUsable(item) && uses.includes(item.role),
  );
}

/**
 * What the bytes ARE, for the backend's benefit.
 *
 * Distinct from the role, which is what they are FOR: a TikTok trend's cover is
 * an image playing the reference-video role, and the picker sets `mediaType:
 * "image"` on purpose — so an existing hint always wins over the chip's kind.
 *
 * Without this the backend has nothing to go on for a locally uploaded file: our
 * storage URLs carry no extension (`/media/artifact-files/<id>`), so an MP4
 * would be inferred as a product image and handed to the model as a still.
 */
function assetMeta(item: ComposerAttachment): Record<string, unknown> {
  const existing = (item.assetRef?.meta ?? {}) as Record<string, unknown>;
  if (existing.mediaType || existing.media_type) return existing;
  return { ...existing, mediaType: item.kind };
}

/**
 * The url this attachment should travel under.
 *
 * Last line of defence for the one field nothing downstream validates: a
 * reference whose url is not a url (the trend listing has sent a display label
 * as `video_url`) resolves to nothing server-side, and the render silently
 * proceeds from the prompt alone. Every picker funnels through here, so the
 * repair covers `/jobs` and `/video-projects/{id}/plan` alike.
 */
function wireUrl(item: ComposerAttachment): string {
  const url = item.url ?? "";
  if (!url || isHttpUrl(url)) return url;
  const meta = (item.assetRef?.meta ?? {}) as Record<string, unknown>;
  const provider = String(meta.provider ?? "").toLowerCase();
  if (provider && provider !== "tiktok") return url;
  if (!provider && item.assetRef?.source !== "trend") return url;
  return (
    trendWatchUrl({
      handle_name: String(meta.handleName ?? meta.handle_name ?? ""),
      video_id: String(meta.videoId ?? meta.video_id ?? ""),
    }) || url
  );
}

function toWireFile(item: ComposerAttachment): WireInputFile {
  const asset: WireAsset = item.assetRef
    ? {
        source: item.assetRef.source,
        id: item.assetRef.id ?? item.artifactId,
        url: item.assetRef.url || item.url || "",
        meta: assetMeta(item),
      }
    : {
        // A local upload has neither an assetRef nor a source, and used to send
        // no `asset` at all — taking its media kind with it.
        source: item.source ?? "",
        id: item.artifactId,
        url: item.url ?? "",
        meta: assetMeta(item),
      };
  return {
    url: wireUrl(item),
    role: WIRE_ROLE[item.role],
    name: item.mentionName,
    asset,
  };
}

function linkFields({
  referenceUrls,
  pageImageUrls,
}: Pick<BuildPayloadArgs, "referenceUrls" | "pageImageUrls">): CreativeLinks {
  // Omitted rather than empty: an absent key leaves the backend's own defaults
  // (and its prompt-text URL extraction) exactly as they are.
  const out: CreativeLinks = {};
  if (referenceUrls?.length) out.reference_urls = referenceUrls;
  if (pageImageUrls?.length) out.page_image_urls = pageImageUrls;
  return out;
}

export function buildCreativePayload({
  attachments,
  method,
  methodExplicit = false,
  referenceUrls,
  pageImageUrls,
}: BuildPayloadArgs): CreativeGenerationPayload {
  const rules = rulesFor(method);
  return {
    generation_method: rules.wire,
    method_explicit: methodExplicit,
    input_files: usableAttachments(attachments, method).map(toWireFile),
    ...linkFields({ referenceUrls, pageImageUrls }),
  };
}

/**
 * The materials an IMAGE job sends: product images, role-tagged, in pick order.
 *
 * `product` and `styleReference` are usable. A motion or audio reference is not:
 * media-ai never rejects a video url in an image job's `input_files`, it base64s
 * the mp4 into an `image_url` part, so including one would silently corrupt the
 * request rather than fail it.
 *
 * Deliberately carries NO `generation_method`. The image vocabulary does not
 * exist in `WireGenerationMethod`, and media-ai's `parse_method` maps anything it
 * does not know to the legacy passthrough — so inventing a value here would send
 * a string that changes nothing. The roles are the payload; the method can be
 * added once the backend has one to honour.
 */
export function buildImageCreativePayload(
  attachments: ComposerAttachment[],
  links?: Pick<BuildPayloadArgs, "referenceUrls" | "pageImageUrls">,
): CreativeInputFiles {
  return {
    input_files: attachments
      .filter(
        (item) =>
          isUsable(item) &&
          // A style reference rides along with the products (PRD IMG-03): it is
          // the one non-product material an image job has a consumer for, and
          // media-ai turns it into the keep/replace block. Motion and audio are
          // still dropped for the reason above.
          (item.role === "product" || item.role === "styleReference"),
      )
      .map(toWireFile),
    ...linkFields(links ?? {}),
  };
}

/** The plain-ref list the legacy `input_files` field carried.
 *
 *  Kept for callers still on the untyped shape (and for the storyboard driver's
 *  own bookkeeping); the typed payload is what the request sends. */
export const payloadRefs = (payload: CreativeGenerationPayload): string[] =>
  payload.input_files.map((file) => file.url);

/** Roles the method wants but the user has not attached — drives an inline hint,
 *  never a submit block. */
export function missingRoles(
  attachments: ComposerAttachment[],
  method: VideoMethod,
): AttachmentRole[] {
  const present = new Set(
    attachments.filter(isUsable).map((item) => item.role),
  );
  return rulesFor(method).wants.filter((role) => !present.has(role));
}
