import type { Asset, GenResult, ResizeImageRequest } from "@dogclaw-ad/workflow";
import { createMediaJob } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { uploadFileToArtifact } from "../../shared/artifacts";
import { STOP_CANCEL, UPLOAD_TYPE_SUPPORT } from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { assertPubliclyFetchable } from "../../shared/helpers";
import { watchJob } from "../../shared/jobStop";
import { proxyImageAsset, toJobInputUrl } from "../../shared/mediaProxy";
import { RESIZE_FEATURE, RESIZE_IMAGE_MODEL, SEAM_LIMIT } from "./constants";
import {
  buildExpandCanvas,
  canvasToPhotoBlob,
  canvasToPngBlob,
  compositeOriginalBack,
  photoFileExtension,
} from "./expandCanvas";
import {
  measureSeamDiscontinuity,
  verifyExpandCanvas,
} from "./expandVerify";
import {
  buildExpandPrompt,
  readExpandPlan,
  resolveExpandGeometry,
} from "./helpers";
import { RESIZE_MESSAGES, RESIZE_WARNINGS } from "./messages";
import { loadPixelSource } from "./pixelSource";
import { resolveExpandedUrl } from "./response";
import type { SeamReport } from "./types";

/** Reframe ONE image by OUTPAINTING the new margins, then paste the original back so it can't be
 *  redrawn. No `aspect_ratio` (the canvas IS the frame); a stop blocks re-rolls and the upload. */
export async function resizeImage(
  req: ResizeImageRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  const plan = readExpandPlan(req);
  if (!req.image?.url) throw new Error(RESIZE_MESSAGES.noSource);
  // The paste-back restores the ORIGINAL, so an unapplied crop would reappear in the result.
  if (req.image.transforms && req.image.transforms.length > 0) {
    throw new Error(RESIZE_MESSAGES.unbakedEdits);
  }

  const source = await loadPixelSource(req.image.url);
  try {
    // Against the source's natural size, not the node's preview.
    const geometry = resolveExpandGeometry(
      {
        width: source.image.naturalWidth,
        height: source.image.naturalHeight,
      },
      plan,
    );

    const { canvas, mask } = buildExpandCanvas(source.image, geometry);
    const canvasBlob = await canvasToPngBlob(canvas);
    await verifyExpandCanvas(canvasBlob, geometry);

    // A second FILE only in "gray" fill: an alpha canvas carries the mask in its own channel.
    const uploads = [
      uploadFileToArtifact(
        new File([canvasBlob], "expand-canvas.png", { type: "image/png" }),
        workflowId,
        UPLOAD_TYPE_SUPPORT, // the job's input, not a result
      ),
    ];
    if (geometry.fill === "gray") {
      uploads.push(
        canvasToPngBlob(mask).then((maskBlob) =>
          uploadFileToArtifact(
            new File([maskBlob], "expand-mask.png", { type: "image/png" }),
            workflowId,
            UPLOAD_TYPE_SUPPORT,
          ),
        ),
      );
    }
    const uploaded = await Promise.all(uploads);

    const inputFiles = uploaded.map((asset) => toJobInputUrl(asset.url));
    assertPubliclyFetchable(inputFiles, RESIZE_FEATURE);

    // A visible seam is stochastic: ONE re-roll, keep the better; a false alarm only costs a job.
    const expandOnce = async (): Promise<{
      canvas: HTMLCanvasElement;
      seam: SeamReport;
    }> => {
      req.signal?.throwIfAborted();
      const jobId = await createMediaJob(
        buildExpandPrompt(plan, geometry),
        undefined,
        // Generative Fill sends its pick; AI Resize has no picker and takes the house route.
        plan.model ?? RESIZE_IMAGE_MODEL,
        inputFiles,
        "image",
        undefined, // one expansion per run; variants would each need a paste-back
        undefined, // no aspect_ratio — the canvas already is the target frame
        workflowId,
        undefined,
        undefined,
        undefined,
        undefined,
        track?.target,
      );
      // A re-roll fires this again under the same seq: one ledger submit must know both ids.
      track?.onCreated?.([jobId], jobId);

      const expanded = await watchJob(
        req.signal,
        () => cancelJobGroup(jobId, STOP_CANCEL),
        (signal) => resolveExpandedUrl(jobId, signal),
      );
      const generated = await loadPixelSource(expanded);
      try {
        const composited = compositeOriginalBack(
          generated.image,
          source.image,
          geometry,
        );
        return {
          canvas: composited,
          seam: measureSeamDiscontinuity(composited, geometry),
        };
      } finally {
        generated.release();
      }
    };

    let best = await expandOnce();
    if (best.seam.score > SEAM_LIMIT) {
      const rerolled = await expandOnce();
      if (rerolled.seam.score < best.seam.score) best = rerolled;
    }
    if (best.seam.score > SEAM_LIMIT) {
      // No toast surface, and a picture the user can re-run beats two paid jobs and an error.
      console.warn(RESIZE_WARNINGS.visibleSeam(best.seam.side, best.seam.score));
    }

    // A PHOTO, not PNG: no transparency left to carry, and PNG is ~10× heavier.
    const finalBlob = await canvasToPhotoBlob(best.canvas);

    req.signal?.throwIfAborted();
    const asset = proxyImageAsset(
      await uploadFileToArtifact(
        new File([finalBlob], `resized.${photoFileExtension(finalBlob)}`, {
          type: finalBlob.type,
        }),
        workflowId,
      ),
    );
    return { asset, assets: [asset] } as GenResult & { assets: Asset[] };
  } finally {
    source.release();
  }
}
