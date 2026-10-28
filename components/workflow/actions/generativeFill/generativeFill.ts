import type {
  Asset,
  GenResult,
  GenerativeFillRequest,
} from "@dogclaw-ad/workflow";
import { createMediaJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/apis";
import { cancelJobGroup } from "@/resources/app/pages/app/components/Conversation/apis/video.api";
import { resizeImage } from "../resizeImage";
import { canvasToPngBlob } from "../resizeImage/expandCanvas";
import { loadPixelSource } from "../resizeImage/pixelSource";
import { uploadFileToArtifact } from "../../shared/artifacts";
import {
  DEFAULT_IMAGE_MODEL,
  FEATURES,
  MEDIA_JOB_TYPE_IMAGE,
  STOP_CANCEL,
  UPLOAD_TYPE_SUPPORT,
} from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { assertPubliclyFetchable, runCount } from "../../shared/helpers";
import { watchJob } from "../../shared/jobStop";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { resolveJobImageAssets } from "../../shared/response";
import { punchMaskedRegion } from "./fillCanvas";
import { inpaintPrompt, isPlacement } from "./helpers";
import { asFillFailure, FILL_MESSAGES } from "./messages";

/** Fill part of ONE image. INPAINT ships the photo with the painted region cut out (no mask field);
 *  OUTPAINT runs AI Resize's pipeline on the dragged `placement`. No `aspect_ratio` either way. */
export async function generativeFill(
  req: GenerativeFillRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  return req.mode === "outpaint"
    ? outpaint(req, workflowId, track)
    : inpaint(req, workflowId, track);
}

async function inpaint(
  req: GenerativeFillRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  if (!req.image?.url) throw new Error(FILL_MESSAGES.noSource);
  // The strokes match the TRANSFORMED preview, so punched into the base asset the hole would move.
  if (req.image.transforms && req.image.transforms.length > 0) {
    throw new Error(FILL_MESSAGES.unbakedEdits);
  }
  if (!req.mask?.url) throw new Error(FILL_MESSAGES.noMask);

  const photo = await loadPixelSource(req.image.url);
  try {
    const mask = await loadPixelSource(req.mask.url);
    let blob: Blob;
    try {
      blob = await canvasToPngBlob(punchMaskedRegion(photo.image, mask.image));
    } finally {
      mask.release();
    }

    // PNG is the operation: the alpha IS the instruction; a JPEG would ship an intact photograph.
    const uploaded = await uploadFileToArtifact(
      new File([blob], "generative-fill-source.png", { type: "image/png" }),
      workflowId,
      UPLOAD_TYPE_SUPPORT, // the job's input, not a result
    );
    // The backend fetches it server-side, so hand it a url IT can reach.
    const input = toJobInputUrl(uploaded.url);
    assertPubliclyFetchable([input], FEATURES.generativeFill);

    req.signal?.throwIfAborted();
    const group = await createMediaJobGroup(
      inpaintPrompt(req.prompt),
      undefined,
      // Unlike Relight's badge, `model` IS a catalog id (the node has a picker); empty falls back.
      req.model || DEFAULT_IMAGE_MODEL,
      [input],
      MEDIA_JOB_TYPE_IMAGE,
      runCount(req.params?.runs),
      undefined, // no aspect_ratio — an inpaint returns the frame it was given
      workflowId,
      // Never backend-enhanced: a rewrite would reword the cut-out contract that quotes the user.
      undefined,
      undefined, // skills
      undefined, // creative
      undefined, // locale
      track?.target,
    );
    track?.onCreated?.(group.jobIds, group.groupId);

    const assets = await watchJob(
      req.signal,
      () => cancelJobGroup(group.groupId, STOP_CANCEL),
      (signal) => resolveJobImageAssets(group.jobId, FEATURES.generativeFill, signal),
    );
    return { asset: assets[0], assets } as GenResult & { assets: Asset[] };
  } finally {
    photo.release();
  }
}

async function outpaint(
  req: GenerativeFillRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<GenResult> {
  if (!req.image?.url) throw new Error(FILL_MESSAGES.noSource);
  const placement = req.placement;
  if (!isPlacement(placement)) throw new Error(FILL_MESSAGES.noFrame);
  // Caught here, not by the pipeline's band check: the fix is on the user's canvas, not a ratio.
  if (placement.width >= 1 && placement.height >= 1) {
    throw new Error(FILL_MESSAGES.identityFrame);
  }

  try {
    return await resizeImage(
      {
        nodeId: req.nodeId,
        // The node's pause has to reach the pipeline's rolls and its upload.
        signal: req.signal,
        image: req.image,
        // `params.expand` is the escape hatch for a caller owning its geometry (`readExpandPlan`).
        params: {
          expand: {
            placement,
            ...(req.prompt?.trim() ? { prompt: req.prompt.trim() } : {}),
            ...(req.model ? { model: req.model } : {}),
          },
        },
      },
      workflowId,
      track,
    );
  } catch (err) {
    throw asFillFailure(err);
  }
}
