import type { AssetKind, SocialPostMedia } from "@dogclaw-ad/workflow";

import type { AssetRef } from "@/lib/creative/assetRef";

import { hostedFileIdFromUrl, isHostedFileId } from "../shared/helpers";
import { fromProxiedMediaUrl } from "../shared/mediaProxy";

/** A node's media as the social flow's AssetRef, with the hosted id recovered: without it the
 *  backend stores the url as-is, a signed link that expires before TikTok pulls the file. */
export function toSocialAssetRef(
  media: SocialPostMedia,
  kind: AssetKind,
  title?: string,
): AssetRef {
  const id =
    hostedFileIdFromUrl(media.url) ??
    (media.id && isHostedFileId(media.id) ? media.id : undefined);
  return {
    source: "generated",
    ...(id ? { id } : {}),
    url: fromProxiedMediaUrl(media.url),
    meta: { mediaType: kind, title, ...(id ? { artifactId: id } : {}) },
  };
}
