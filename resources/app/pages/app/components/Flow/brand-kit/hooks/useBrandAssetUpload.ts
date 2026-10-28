"use client";

import { useCallback, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import { useToastStore } from "@/lib/stores/useToastStore";
import { uploadArtifactFile } from "@/resources/app/pages/app/components/Conversation/components/MediaAddonPanel/components/ImageCanvasEditor/mediaImageClient";

export type UploadedBrandAsset = {
  /** What the kit stores, and what the tile renders — see below. */
  url: string;
  /** The hosted file's own id, kept for anything that addresses storage. */
  artifactId: string;
  fileName: string;
};

/**
 * Upload images for the Logo and Photography sections, through the same
 * `POST /artifacts` (`type_upload=user_upload`) the composer and Face Swap use.
 *
 * STORES THE URL, NOT THE ID. §7.3 accepts a bare storage id, so the write
 * succeeded — but the tile renders the same value as an `<img src>`, and a ULID
 * is not a src. `uploadArtifactFile` resolves a url beside the id, and §7.3
 * takes a public url just as readily, downloading it once.
 *
 * TAKES `File[]`, NOT THE EVENT'S `FileList`. A FileList is a live view of
 * `input.files`, and both call sites reset the input right after reading it —
 * which emptied the list before this saw it, silently.
 */
export function useBrandAssetUpload(max: number) {
  const { t } = useTranslate();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (
      picked: readonly File[],
      currentCount: number,
    ): Promise<UploadedBrandAsset[]> => {
      if (picked.length === 0 || uploading) return [];

      const images = picked.filter((file) => file.type.startsWith("image/"));
      if (images.length !== picked.length) {
        useToastStore.getState().push(t("appChat.brandKit.error.wrongKind"));
      }

      const room = Math.max(0, max - currentCount);
      if (room === 0) {
        useToastStore
          .getState()
          .push(t("appChat.brandKit.photography.full").replace("{max}", String(max)));
        return [];
      }

      setUploading(true);
      const uploaded: UploadedBrandAsset[] = [];
      try {
        for (const file of images.slice(0, room)) {
          // Null is an unset media base url; a rejected file throws instead.
          const result = await uploadArtifactFile(file, "user_upload");
          if (!result) continue;
          uploaded.push({
            url: result.url,
            artifactId: result.artifactId,
            fileName: file.name,
          });
        }
      } catch {
        useToastStore.getState().push(t("appChat.brandKit.error.uploadFailed"));
      } finally {
        setUploading(false);
      }

      if (uploaded.length === 0 && images.length > 0) {
        useToastStore.getState().push(t("appChat.brandKit.error.uploadFailed"));
      }
      return uploaded;
    },
    [max, t, uploading],
  );

  return { upload, uploading };
}
