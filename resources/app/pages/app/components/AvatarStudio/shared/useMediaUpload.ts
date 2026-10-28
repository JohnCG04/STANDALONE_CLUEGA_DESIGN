"use client";

import { useCallback, useRef, useState } from "react";

import { useTranslate } from "@/hooks/useTranslate";
import {
  resolveUploadMessage,
  UploadRejectedError,
  type UploadRejection,
} from "@/lib/uploads/limits";
import { uploadArtifactFile } from "@/resources/app/pages/app/components/Conversation/components/MediaAddonPanel/components/ImageCanvasEditor/mediaImageClient";

/**
 * One upload slot: pick a file, get an artifact id back.
 *
 * Generalised out of the stylize tab's selfie hook so the narration track, the
 * product image, the dub source video and the enrollment clip all share one
 * implementation — and, more importantly, one stale-pick guard.
 *
 * **The stale-pick guard is the point.** A user who picks a second file before
 * the first upload answers must end up with the SECOND one, whichever request
 * settles last. Without it the slot silently shows a file the user replaced, and
 * the render uses that.
 *
 * `validate` runs before the upload starts, so a clip that is too short or too
 * long never leaves the machine. It is async because reading a video's duration
 * requires the DOM to load its metadata.
 */

export type UploadedMedia = {
  artifactId: string;
  /** Loadable url from the upload response. */
  url: string;
  fileName: string;
  /** Bytes, for copy that quotes the file's size. */
  size: number;
  /** Seconds, when the validator measured a duration. */
  durationSeconds?: number;
};

export type MediaUpload = {
  media: UploadedMedia | null;
  uploading: boolean;
  error: string | null;
  /**
   * Returns the accepted upload, or null when it was refused or superseded.
   * Returning it matters: a caller cannot read `media` straight after awaiting —
   * that closure still holds the previous render's value.
   */
  upload: (file: File | undefined) => Promise<UploadedMedia | null>;
  clear: () => void;
};

export type MediaUploadOptions = {
  /** `type_upload` classification stored with the artifact. */
  typeUpload: string;
  /** Translation key for a failure the server did not explain. */
  failedMessageKey?: string;
  /**
   * Runs before the upload. Return a rejection to refuse the file, or an object
   * with `durationSeconds` to attach a measurement to the accepted upload.
   */
  validate?: (
    file: File,
  ) => Promise<UploadRejection | { durationSeconds?: number } | null>;
};

export function useMediaUpload({
  typeUpload,
  failedMessageKey = "appChat.avatarModal.createNew.uploadFailed",
  validate,
}: MediaUploadOptions): MediaUpload {
  const { t } = useTranslate();
  const pickRef = useRef(0);
  const [media, setMedia] = useState<UploadedMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File | undefined): Promise<UploadedMedia | null> => {
      if (!file) return null;
      const pick = pickRef.current + 1;
      pickRef.current = pick;

      setUploading(true);
      setError(null);
      try {
        let durationSeconds: number | undefined;
        if (validate) {
          const verdict = await validate(file);
          if (pickRef.current !== pick) return null;
          if (verdict && "code" in verdict) {
            setError(resolveUploadMessage(t, verdict));
            return null;
          }
          durationSeconds = verdict?.durationSeconds;
        }
        const uploaded = await uploadArtifactFile(file, typeUpload);
        if (pickRef.current !== pick) return null;
        if (!uploaded) throw new Error("upload_failed");
        const accepted: UploadedMedia = {
          artifactId: uploaded.artifactId,
          url: uploaded.url,
          fileName: file.name,
          size: file.size,
          ...(durationSeconds != null ? { durationSeconds } : {}),
        };
        setMedia(accepted);
        return accepted;
      } catch (err) {
        if (pickRef.current !== pick) return null;
        setError(
          err instanceof UploadRejectedError
            ? resolveUploadMessage(t, err.copy)
            : t(failedMessageKey),
        );
        return null;
      } finally {
        if (pickRef.current === pick) setUploading(false);
      }
    },
    [failedMessageKey, t, typeUpload, validate],
  );

  const clear = useCallback(() => {
    // Bumping the pick id is what makes an in-flight upload land nowhere.
    pickRef.current += 1;
    setMedia(null);
    setError(null);
    setUploading(false);
  }, []);

  return { media, uploading, error, upload, clear };
}
