import type { MagicLayerRequest, MagicLayerResult } from "@dogclaw-ad/workflow";
import { pollJobImageResult } from "@/resources/app/pages/app/components/Conversation/apis/stream/pollJobImageUrl";
import { FEATURES } from "../../shared/constants";
import type { FlowJobTrack } from "../../shared/types";
import { loadFont } from "./loadFont";
import { fontsOf, toMagicLayerResult } from "./magicLayerMap";
import { createDesignLayersJob } from "../../shared/mediaJob";
import { toJobInputUrl } from "../../shared/mediaProxy";
import { MEDIA_JOB_MESSAGES } from "../../shared/messages";
import { proxied } from "./helpers";

const NO_SOURCE = "Magic Layer received no source image.";

/** media-ai splits the picture into image layers and Google-font text blocks. Folded `transforms`
 *  aren't applied server-side yet, so boxes are in the source's own pixels. */
export async function decomposeLayers(
  req: MagicLayerRequest,
  workflowId?: string,
  track?: FlowJobTrack,
): Promise<MagicLayerResult> {
  // The backend fetches the source server-side, so hand it a url IT can reach.
  const source = req.image?.url ? toJobInputUrl(req.image.url) : undefined;
  if (!source) throw new Error(NO_SOURCE);

  const jobId = await createDesignLayersJob(source, workflowId, track?.target);
  track?.onCreated?.([jobId], jobId);
  const { result } = await pollJobImageResult(jobId, req.signal);
  const layers = toMagicLayerResult(result?.design_layers, proxied);
  if (!layers || layers.layers.length === 0) {
    throw new Error(MEDIA_JOB_MESSAGES.noImageUrl(FEATURES.magicLayer));
  }
  // The editor draws text in these families but never fetches a font: make them available first.
  await Promise.all(fontsOf(layers).map(loadFont));
  return layers;
}
