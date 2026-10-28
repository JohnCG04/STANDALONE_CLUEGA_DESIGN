import type { Asset, AssetKind, WorkflowAsset } from "@dogclaw-ad/workflow";
import {
  mediaBaseUrl,
  mediaFetch,
} from "@/resources/app/pages/app/components/Conversation/apis/api.helper";
import { translateStatic } from "@/hooks/useTranslate";
import { deleteArtifactById } from "@/lib/media-library/api";
import {
  assertUploadContent,
  inspectMediaDecode,
  inspectUploadContent,
} from "@/lib/uploads/contentCheck";
import {
  mapUploadFailure,
  preflightUpload,
  resolveUploadMessage,
  type UploadCopy,
  type UploadRejection,
} from "@/lib/uploads/limits";
import { notifyUploadFailures } from "@/lib/uploads/uploadFailureToast";
import {
  PACKAGE_SUPPORT_FILE_NAMES,
  UPLOAD_TYPE_SUPPORT,
  UPLOAD_TYPE_USER,
  WORKFLOW_RUN_ERROR_MARK,
} from "./constants";
import {
  hostedFileIdFromUrl,
  isHostedFileId,
  mediaFileName,
  toSameOriginDownloadUrl,
} from "./helpers";
import { canvasMediaCheck, isCanvasMedia, withCanonicalType } from "./mediaUploadRules";
import { proxyImageAsset } from "./mediaProxy";
import { ARTIFACT_MESSAGES } from "./messages";

/** One node file as an Asset whose id is the hosted ULID, so Export can re-resolve its url.
 *  No `Content-Type`: FormData sets the multipart boundary. `UPLOAD_TYPE_SUPPORT` skips Assets. */
export async function uploadFileToArtifact(
  file: File,
  projectId?: string,
  typeUpload: string = UPLOAD_TYPE_USER,
): Promise<Asset> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) throw new Error(ARTIFACT_MESSAGES.uploadUnavailable);

  // A file whose bytes are not what its name says never leaves the browser.
  await assertUploadContent(file);

  const formData = new FormData();
  formData.append("file", file); // field name MUST be "file"
  formData.append("type_upload", typeUpload);
  if (projectId) formData.append("workflow_id", projectId);

  const response = await mediaFetch(`${baseUrl}/artifacts`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    // media-ai answers `detail`/`message`; the gateway's `{ error: { code } }` maps to copy.
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
      message?: string;
    } | null;
    if (body?.detail ?? body?.message) throw new Error(body?.detail ?? body?.message);
    throw refusalError(mapUploadFailure(response.status, body, file.type));
  }

  // The `{ success, data }` envelope is a fallback in case the gateway shape changes.
  const payload = (await response.json()) as {
    data?: { id?: string; url?: string; mimeType?: string };
    id?: string;
    artifact_id?: string;
    file_id?: string;
    output_refs?: string[];
    url?: string;
    mimeType?: string;
  };

  const fileId =
    payload.id ??
    payload.data?.id ??
    payload.artifact_id ??
    payload.file_id ??
    payload.output_refs?.[0] ??
    null;
  if (!fileId) throw new Error(ARTIFACT_MESSAGES.noFileId);

  const url =
    payload.url ??
    payload.data?.url ??
    (await resolveHostedDownloadUrl(fileId)) ??
    "";

  const mimeType = payload.data?.mimeType ?? payload.mimeType ?? file.type;
  // `AssetKind` has no audio: it rides as video (never image-proxied), `mimeType` says what it is
  const streamed = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  return {
    id: fileId, // hosted file id (ULID) → drives `resolveDownload`
    url,
    kind: streamed ? "video" : "image",
    mimeType,
  };
}

/** The chat composer's checks (type and size, then bytes); canvas video/audio use canvas caps. */
async function refusalOf(file: File): Promise<UploadRejection | null> {
  if (isCanvasMedia(file)) {
    return (await canvasMediaCheck(file)) ?? (await inspectUploadContent(withCanonicalType(file)));
  }
  return preflightUpload(file) ?? (await inspectUploadContent(file));
}

/** The reason in the chat's words, marked so the node shows it rather than a guessed kind. */
function refusalError(rejection: UploadCopy): Error {
  const error = new Error(resolveUploadMessage(translateStatic, rejection));
  return Object.assign(error, { [WORKFLOW_RUN_ERROR_MARK]: true });
}

/** The editor's `screenUploads`: the composer's checks plus a decode, as a card will draw it.
 *  A refused file never gets a card to wire up; the toast names it and says why. */
export async function screenWorkflowUploads(files: File[]): Promise<File[]> {
  const refusals = await Promise.all(
    files.map(
      async (file) =>
        (await refusalOf(file)) ?? (await inspectMediaDecode(withCanonicalType(file))),
    ),
  );
  const reasons: Record<string, string> = {};
  files.forEach((file, i) => {
    const refusal = refusals[i];
    if (refusal) reasons[file.name] = resolveUploadMessage(translateStatic, refusal);
  });
  notifyUploadFailures(Object.keys(reasons), reasons);
  return files.filter((_, i) => !refusals[i]);
}

/** A batch in the SAME order (the contract). Re-checked for paths `screenUploads` misses: a refused
 *  file is never sent and leaves a gap; nothing left to send throws the first reason. */
export async function uploadFilesToArtifacts(
  files: File[],
  projectId?: string,
): Promise<Asset[]> {
  const refusals = await Promise.all(files.map(refusalOf));
  notifyUploadFailures(files.filter((_, i) => refusals[i]).map((file) => file.name));
  const firstRefusal = refusals.find((refusal) => refusal !== null);
  if (firstRefusal && refusals.every(Boolean)) throw refusalError(firstRefusal);
  const assets = await Promise.all(
    files.map((file, i) =>
      refusals[i]
        ? undefined
        : uploadFileToArtifact(
            // An alias or blank type (`audio/mp3`, an untyped .mov) goes up under the stored one.
            withCanonicalType(file),
            projectId,
            PACKAGE_SUPPORT_FILE_NAMES.has(file.name)
              ? UPLOAD_TYPE_SUPPORT
              : UPLOAD_TYPE_USER,
          ).then(proxyImageAsset),
    ),
  );
  // Only multi-file picks reach here with gaps; the gallery pairs by index and drops them.
  return assets as Asset[];
}

/** A fresh, authorized download url for a hosted file; `null` on failure so callers fall back. */
async function resolveHostedDownloadUrl(id: string): Promise<string | null> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) return null;
  try {
    const response = await mediaFetch(
      `${baseUrl}/artifacts/${encodeURIComponent(id)}/download-url`,
    );
    if (!response.ok) return null;

    type UrlBody = { url?: string; download_url?: string; downloadUrl?: string };
    const payload = (await response.json().catch(() => null)) as
      | (UrlBody & { data?: UrlBody })
      | null;
    if (!payload) return null;

    const body = payload.data ?? payload;
    return body.url ?? body.download_url ?? body.downloadUrl ?? null;
  } catch {
    return null;
  }
}

/** Hosted bytes via the gateway (its OWN CORS policy); `null` on failure so callers fall back. */
async function fetchHostedDownloadBlob(id: string): Promise<Blob | null> {
  const baseUrl = mediaBaseUrl();
  if (!baseUrl) return null;
  try {
    const response = await mediaFetch(
      `${baseUrl}/artifacts/${encodeURIComponent(id)}/download`,
    );
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** An Export node's asset as a Blob: via the gateway when the id is hosted, else its own url
 *  through the proxy (a just-generated image's client-side id is unknown to the gateway). */
export async function resolveDownloadBlob(asset: {
  id: string;
  url: string;
  kind: AssetKind;
}): Promise<Blob> {
  if (isHostedFileId(asset.id)) {
    const proxied = await fetchHostedDownloadBlob(asset.id);
    if (proxied) return proxied;
  }

  const response = await fetch(toSameOriginDownloadUrl(asset.url));
  if (!response.ok) {
    throw new Error(ARTIFACT_MESSAGES.downloadFailed(response.status));
  }

  return response.blob();
}

/** Revoked on a timer: `click()` only STARTS the download, and Firefox/Safari may still read it. */
function saveBlobAs(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4_000);
}

/** Save an Assets-panel asset. Its id is an asset uuid, never a ULID, so it takes the url path. */
export async function downloadWorkflowAsset(asset: WorkflowAsset): Promise<void> {
  const blob = await resolveDownloadBlob(asset);
  saveBlobAs(blob, asset.title || asset.id);
}

export async function downloadMediaFromUrl(
  url: string,
  kind: AssetKind,
): Promise<void> {
  const id = hostedFileIdFromUrl(url) ?? "";
  const blob = await resolveDownloadBlob({ id, url, kind });
  saveBlobAs(blob, mediaFileName(url, kind, blob, id));
}

/** Delete the asset behind a dropped card. Fire-and-forget with no toast surface: failures log. */
export function deleteWorkflowAsset(asset: {
  id?: string;
  url: string;
  kind: AssetKind;
}): void {
  const mediaId =
    hostedFileIdFromUrl(asset.url) ??
    (asset.id && isHostedFileId(asset.id) ? asset.id : null);
  if (!mediaId) return;
  void deleteArtifactById(mediaId).catch((err) =>
    console.error("[workflow] asset delete failed", err),
  );
}
